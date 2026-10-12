import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User as UserIcon,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { signup } from "@/api/endpoints/auth/auth";
import { usePreviewInvite } from "@/api/endpoints/invites/invites";
import { useUser } from "@/contexts/user-context";
import { ApiError } from "@/lib/api-client";
import {
  getApiErrorCode,
  getApiErrorDetail,
  getApiErrorMessage,
  parseValidationErrors,
} from "@/lib/api-errors";
import { setLastUsedOrgId } from "@/lib/routes";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const signupSchema = z.object({
  name: z.string().max(200, "Name must be 200 characters or fewer").optional(),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(10, "Password must be at least 10 characters"),
  org_name: z
    .string()
    .max(200, "Organization name must be 200 characters or fewer")
    .optional(),
});

type SignupFormData = z.infer<typeof signupSchema>;

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { invite?: string } => ({
    invite:
      typeof search["invite"] === "string" && search["invite"].trim().length > 0
        ? search["invite"].trim()
        : undefined,
  }),
  component: SignupPage,
});

function SignupPage() {
  const { invite: inviteToken } = Route.useSearch();
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refetch } = useUser();

  const inviteQuery = usePreviewInvite(inviteToken ?? "", {
    query: {
      enabled: Boolean(inviteToken),
      retry: false,
    },
  });

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      org_name: "",
    },
    mode: "onTouched",
  });

  const signupMutation = useMutation({
    meta: { skipGlobalErrorToast: true },
    mutationFn: (data: SignupFormData) => {
      const trimmedName = data.name?.trim();
      const trimmedOrg = data.org_name?.trim();
      return signup({
        email: data.email.trim(),
        password: data.password,
        name: trimmedName ? trimmedName : null,
        org_name: inviteToken ? null : trimmedOrg || null,
        invite_token: inviteToken ?? null,
      });
    },
    onSuccess: async (res) => {
      setFormError("");
      setLastUsedOrgId(res.membership.org_id);
      queryClient.clear();
      await refetch();
      await router.navigate({ href: `/${res.membership.org_id}` });
    },
    onError: (error: unknown) => {
      if (!(error instanceof ApiError)) {
        const msg =
          "Network error. Please check your connection and try again.";
        setFormError(msg);
        toast.error(msg);
        return;
      }

      const code = getApiErrorCode(error);
      const detail = getApiErrorDetail(error);

      if (error.status === 409 || code === "conflict") {
        form.setError("email", {
          type: "server",
          message: detail ?? "An account with this email already exists.",
        });
        return;
      }

      if (error.status === 422 || code === "validation_error") {
        const { fieldErrors, generalMessage } = parseValidationErrors(error);
        let mappedAny = false;
        const validFields: Array<keyof SignupFormData> = [
          "email",
          "password",
          "name",
          "org_name",
        ];
        for (const field of validFields) {
          const fieldMsg = fieldErrors[field];
          if (fieldMsg) {
            form.setError(field, { type: "server", message: fieldMsg });
            mappedAny = true;
          }
        }
        if (generalMessage || !mappedAny) {
          setFormError(
            generalMessage ??
              detail ??
              "Please check the form fields and try again."
          );
        }
        return;
      }

      const msg = getApiErrorMessage(
        error,
        "Sign up failed. Please try again."
      );
      setFormError(msg);
      toast.error(msg);
    },
  });

  const onSubmit = (data: SignupFormData) => {
    setFormError("");
    if (!inviteToken && !data.org_name?.trim()) {
      form.setError("org_name", {
        type: "manual",
        message: "Organization name is required",
      });
      return;
    }
    signupMutation.mutate(data);
  };

  // If invite token was provided but is invalid/expired/revoked
  if (inviteToken && inviteQuery.isError) {
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
            <h1 className="text-lg font-semibold">Invite no longer valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This invite link is no longer valid, ask for a new one.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button
                className="h-10 w-full"
                onClick={() => router.navigate({ to: "/signup" })}
              >
                Create a new organization instead
              </Button>
              <Button
                variant="outline"
                className="h-10 w-full"
                onClick={() => router.navigate({ to: "/login" })}
              >
                Go to sign in
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-6 text-center">
          <Logo className="justify-center" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {inviteToken ? "Join your team" : "Create your account"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {inviteToken
                ? "Create your Cadence account to accept this invite."
                : "Set up your account and organization in seconds."}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-6 shadow-sm">
          {inviteToken && (
            <div className="mb-5 rounded-lg border bg-muted/40 p-3.5">
              {inviteQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-44" />
                </div>
              ) : inviteQuery.data ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      Joining organization
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {inviteQuery.data.org_name}
                    </p>
                  </div>
                  <Badge variant="secondary" className="capitalize">
                    {inviteQuery.data.role}
                  </Badge>
                </div>
              ) : null}
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name (optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Ada Lovelace"
                          className="h-11 pl-9"
                          autoComplete="name"
                          autoFocus
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          className="h-11 pl-9"
                          autoComplete="email"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="At least 10 characters"
                          className="h-11 pl-9 pr-9"
                          autoComplete="new-password"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          disabled={!field.value?.length}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Must be at least 10 characters.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!inviteToken && (
                <FormField
                  control={form.control}
                  name="org_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Create an organization</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="text"
                            placeholder="Organization name (e.g. Acme Engineering)"
                            className="h-11 pl-9"
                            autoComplete="organization"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {formError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-center text-sm text-destructive"
                >
                  {formError}
                </div>
              )}

              <Button
                type="submit"
                className="h-11 w-full text-sm"
                disabled={
                  signupMutation.isPending ||
                  (Boolean(inviteToken) && inviteQuery.isLoading)
                }
              >
                <UserPlus className="size-4" />
                {signupMutation.isPending
                  ? "Creating account..."
                  : inviteToken
                    ? "Create account & join"
                    : "Create account"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            search={
              inviteToken ? { redirect: `/invite/${inviteToken}` } : undefined
            }
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
