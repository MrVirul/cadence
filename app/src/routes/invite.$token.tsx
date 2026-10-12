import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  LogIn,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  acceptInvite,
  usePreviewInvite,
} from "@/api/endpoints/invites/invites";
import { useUser } from "@/contexts/user-context";
import {
  getApiErrorCode,
  getApiErrorDetail,
  getApiErrorMessage,
  getApiStatus,
} from "@/lib/api-errors";
import { setLastUsedOrgId } from "@/lib/routes";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePreviewPage,
});

function InvitePreviewPage() {
  const { token } = Route.useParams();
  const router = useRouter();
  const {
    user,
    memberships,
    isLoading: authLoading,
    isAuthenticated,
    refetch,
  } = useUser();

  const [alreadyMemberMsg, setAlreadyMemberMsg] = useState<string | null>(null);
  const [inviteInvalidated, setInviteInvalidated] = useState(false);

  const previewQuery = usePreviewInvite(token, {
    query: {
      retry: false,
    },
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: async (res) => {
      const orgId = res.membership.org_id;
      setLastUsedOrgId(orgId);
      await refetch();
      await router.navigate({ href: `/${orgId}` });
    },
    onError: async (error: unknown) => {
      const code = getApiErrorCode(error);
      const status = getApiStatus(error);
      if (code === "forbidden") {
        return;
      }
      if (code === "invite_invalid" || status === 404) {
        setInviteInvalidated(true);
        return;
      }
      if (code === "conflict" || status === 409) {
        await refetch();
        setAlreadyMemberMsg(
          getApiErrorDetail(error) ??
            `You are already a member of ${previewQuery.data?.org_name ?? "this organization"}.`
        );
        return;
      }
      const msg = getApiErrorMessage(error, "Could not accept this invite.");
      toast.error(msg);
    },
  });

  if (previewQuery.isLoading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4 sm:p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <div className="space-y-4 rounded-xl border bg-background p-6 shadow-sm">
            <Skeleton className="mx-auto h-6 w-40" />
            <Skeleton className="mx-auto h-4 w-56" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const isInvalid =
    inviteInvalidated ||
    previewQuery.isError ||
    !previewQuery.data ||
    getApiErrorCode(previewQuery.error) === "invite_invalid";

  if (isInvalid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4 sm:p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <div className="rounded-xl border bg-background p-6 text-center shadow-sm">
            <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-5" />
            </div>
            <h1 className="text-lg font-semibold">Invite link invalid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This invite link is no longer valid, ask for a new one.
            </p>
            <div className="mt-6">
              {isAuthenticated ? (
                <Button
                  className="h-10 w-full"
                  onClick={() => router.navigate({ to: "/" })}
                >
                  Go to my workspace
                </Button>
              ) : (
                <Button
                  className="h-10 w-full"
                  onClick={() => router.navigate({ to: "/login" })}
                >
                  Go to sign in
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const preview = previewQuery.data;
  const matchingMembership = memberships.find(
    (m) => m.org.name === preview.org_name
  );
  const targetOrgHref = matchingMembership
    ? `/${matchingMembership.org.id}`
    : "/";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-6 text-center">
          <Logo className="justify-center" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Organization invite
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              You have been invited to collaborate on Cadence.
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <div className="rounded-lg border bg-muted/40 p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Organization
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {preview.org_name}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="text-xs text-muted-foreground">Role:</span>
              <Badge variant="secondary" className="capitalize">
                {preview.role}
              </Badge>
            </div>
          </div>

          {isAuthenticated ? (
            <div className="mt-6 space-y-4">
              {user && (
                <p className="text-center text-xs text-muted-foreground">
                  Signed in as{" "}
                  <span className="font-medium text-foreground">
                    {user.email}
                  </span>
                </p>
              )}

              {alreadyMemberMsg ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-2.5 rounded-lg border bg-muted/50 p-3 text-sm text-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{alreadyMemberMsg}</span>
                  </div>
                  <Button
                    className="h-11 w-full text-sm"
                    onClick={() => router.navigate({ href: targetOrgHref })}
                  >
                    Go to {preview.org_name}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  className="h-11 w-full text-sm"
                  disabled={acceptMutation.isPending}
                  onClick={() => acceptMutation.mutate()}
                >
                  {acceptMutation.isPending
                    ? `Joining ${preview.org_name}...`
                    : `Join ${preview.org_name}`}
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <Button
                className="h-11 w-full text-sm"
                onClick={() =>
                  router.navigate({
                    to: "/signup",
                    search: { invite: token },
                  })
                }
              >
                <UserPlus className="size-4" />
                Create account
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full text-sm"
                onClick={() =>
                  router.navigate({
                    to: "/login",
                    search: { redirect: `/invite/${token}` },
                  })
                }
              >
                <LogIn className="size-4" />
                Log in
              </Button>
            </div>
          )}
        </div>

        {isAuthenticated && !alreadyMemberMsg && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="underline-offset-4 hover:underline">
              Back to workspace
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
