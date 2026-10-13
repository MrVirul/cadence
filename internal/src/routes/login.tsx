import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Lock, LogIn, Mail, ShieldCheck } from "lucide-react";
import { auth } from "@/api/endpoints/auth/auth";
import { useUser } from "@/contexts/user-context";
import { InternalBanner } from "@/components/InternalBanner";
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
import {
  applyApiErrorToForm,
  getApiErrorCode,
  getApiStatus,
} from "@/lib/api-error";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refetch } = useUser();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginFormData) => auth(data),
    onSuccess: async () => {
      setLoginError("");
      queryClient.clear();
      await refetch();
      navigate({ to: "/orgs" });
    },
    onError: (error: unknown) => {
      const code = getApiErrorCode(error);
      const status = getApiStatus(error);
      if (code === "staff_only" || status === 403) {
        setLoginError(
          "This area is for Cadence staff only. Customer accounts cannot sign in here."
        );
        return;
      }
      if (code === "unauthorized" || status === 401) {
        setLoginError(
          "Invalid credentials or non-staff account. This area is for Cadence staff only — customer accounts must sign in at the customer app."
        );
        return;
      }
      const formError = applyApiErrorToForm(error, form.setError, {
        fields: ["email", "password"],
        fallback: "Sign in failed. Please try again.",
      });
      setLoginError(formError ?? "");
    },
  });

  const onSubmit = (data: LoginFormData) => {
    setLoginError("");
    loginMutation.mutate(data);
  };

  return (
    <div className="dark flex min-h-screen flex-col bg-background text-foreground">
      <InternalBanner />
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-5 text-center">
            <Logo className="justify-center" />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-600/30 bg-amber-950/40 px-3 py-1 font-mono text-[11px] font-medium tracking-widest text-amber-400 uppercase">
              <ShieldCheck className="size-3.5 text-[#B45309]" />
              Cadence Internal · Restricted
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Staff Console
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Sign in with your Cadence staff credentials.
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
                noValidate
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="email"
                            placeholder="staff@cadence.test"
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
                          <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            className="h-11 pr-9 pl-9"
                            autoComplete="current-password"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            disabled={!field.value?.length}
                            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
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
                    className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-center text-sm text-destructive"
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
        </div>
      </div>
    </div>
  );
}
