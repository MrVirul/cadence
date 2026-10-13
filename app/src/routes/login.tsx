import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Lock, LogIn, Mail } from "lucide-react";
import { login } from "@/api/endpoints/auth/auth";
import { useUser } from "@/contexts/user-context";
import { ApiError } from "@/lib/api-client";
import {
  getApiErrorCode,
  getApiErrorMessage,
  parseValidationErrors,
} from "@/lib/api-errors";
import { sanitizeRedirectPath } from "@/lib/routes";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in — Cadence" }],
  }),
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect:
      typeof search["redirect"] === "string" ? search["redirect"] : undefined,
  }),
  component: Login,
});

function Login() {
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refetch } = useUser();
  const { redirect } = Route.useSearch();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  const loginMutation = useMutation({
    meta: { skipGlobalErrorToast: true },
    mutationFn: (data: LoginFormData) => login(data),
    onSuccess: async () => {
      setLoginError("");
      queryClient.clear();
      await refetch();
      const target = sanitizeRedirectPath(redirect);
      await router.navigate({ href: target });
    },
    onError: (error: unknown) => {
      if (!(error instanceof ApiError)) {
        setLoginError(
          "Network error. Please check your connection and try again."
        );
        return;
      }

      const code = getApiErrorCode(error);
      if (error.status === 401 || code === "unauthorized") {
        setLoginError("Incorrect email or password.");
      } else if (error.status === 422 || code === "validation_error") {
        const { fieldErrors, generalMessage } = parseValidationErrors(error);
        if (fieldErrors["email"]) {
          form.setError("email", {
            type: "server",
            message: fieldErrors["email"],
          });
        }
        if (fieldErrors["password"]) {
          form.setError("password", {
            type: "server",
            message: fieldErrors["password"],
          });
        }
        setLoginError(
          generalMessage ?? "Please check your credentials and try again."
        );
      } else {
        setLoginError(
          getApiErrorMessage(error, "Login failed. Please try again.")
        );
      }
    },
  });

  const onSubmit = (data: LoginFormData) => {
    setLoginError("");
    loginMutation.mutate(data);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-6 text-center">
          <Logo className="justify-center" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in to your Cadence account.
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Password"
                          className="h-11 pl-9 pr-9"
                          autoComplete="current-password"
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {loginError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-center text-sm text-destructive"
                >
                  {loginError}
                </div>
              )}

              <Button
                type="submit"
                className="h-11 w-full text-sm"
                disabled={loginMutation.isPending}
              >
                <LogIn className="size-4" />
                {loginMutation.isPending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to Cadence?{" "}
          <Link
            to="/signup"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
