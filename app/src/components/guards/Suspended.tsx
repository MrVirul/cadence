import { useRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Building2, LogOut, Plus } from "lucide-react";
import { logout } from "@/api/endpoints/auth/auth";
import { useUser } from "@/contexts/user-context";
import { setLastUsedOrgId } from "@/lib/routes";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

interface SuspendedProps {
  orgId?: string;
}

export function Suspended({ orgId }: SuspendedProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { memberships } = useUser();

  const otherMemberships = memberships.filter((m) => m.org.id !== orgId);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await logout();
    },
    onSettled: () => {
      queryClient.clear();
      router.navigate({ to: "/login" });
    },
  });

  const handleSwitchOrg = (targetOrgId: string) => {
    setLastUsedOrgId(targetOrgId);
    router.navigate({ href: `/${targetOrgId}` });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4 sm:p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Ban className="size-5" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">
            Organization suspended
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This organization is suspended. Contact support.
          </p>

          <div className="mt-6 space-y-2.5">
            {otherMemberships.length > 0 && (
              <div className="space-y-2 text-left">
                <p className="text-xs font-medium text-muted-foreground">
                  Switch organization
                </p>
                {otherMemberships.map((m) => (
                  <Button
                    key={m.org.id}
                    variant="outline"
                    className="h-10 w-full justify-start"
                    onClick={() => handleSwitchOrg(m.org.id)}
                  >
                    <Building2 className="size-4 text-muted-foreground" />
                    <span className="truncate">{m.org.name}</span>
                  </Button>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              className="h-10 w-full"
              onClick={() => router.navigate({ to: "/onboarding" })}
            >
              <Plus className="size-4" />
              Create organization
            </Button>

            <Button
              variant="ghost"
              className="h-10 w-full text-muted-foreground hover:text-foreground"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
            >
              <LogOut className="size-4" />
              {logoutMutation.isPending ? "Signing out..." : "Log out"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
