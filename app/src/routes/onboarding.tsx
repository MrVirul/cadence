import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";
import { logout } from "@/api/endpoints/auth/auth";
import { createOrg } from "@/api/endpoints/orgs/orgs";
import { AuthGuard } from "@/components/AuthGuard";
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
import { useUser } from "@/contexts/user-context";
import {
  getApiErrorCode,
  getApiErrorMessage,
  parseValidationErrors,
} from "@/lib/api-errors";
import { setLastUsedOrgId } from "@/lib/routes";

const onboardingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Organization name is required")
    .max(200, "Organization name must be 200 characters or fewer"),
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [{ title: "Set up your team — Cadence" }],
  }),
  component: OnboardingRoute,
});

function OnboardingRoute() {
  return (
    <AuthGuard>
      <OnboardingPage />
    </AuthGuard>
  );
}

function OnboardingPage() {
  const [formError, setFormError] = useState("");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, memberships, refetch } = useUser();

  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { name: "" },
    mode: "onTouched",
  });

  const createOrgMutation = useMutation({
    mutationFn: (data: OnboardingFormData) =>
      createOrg({ name: data.name.trim() }),
    onSuccess: async (org) => {
      setFormError("");
      setLastUsedOrgId(org.id);
      await refetch();
      await router.navigate({ href: `/${org.id}` });
    },
    onError: (error: unknown) => {
      const code = getApiErrorCode(error);
      if (code === "forbidden") {
        return;
      }
      if (code === "validation_error") {
        const { fieldErrors, generalMessage } = parseValidationErrors(error);
        if (fieldErrors["name"]) {
          form.setError("name", {
            type: "server",
            message: fieldErrors["name"],
          });
          return;
        }
        if (generalMessage) {
          setFormError(generalMessage);
          return;
        }
      }
      const msg = getApiErrorMessage(
        error,
        "Could not create organization. Please try again."
      );
      setFormError(msg);
      toast.error(msg);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await logout();
    },
    onSettled: () => {
      queryClient.clear();
      router.navigate({ to: "/login" });
    },
  });

  const onSubmit = (data: OnboardingFormData) => {
    setFormError("");
    createOrgMutation.mutate(data);
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-muted/30 p-4 sm:p-6">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between py-2">
        <Logo />
        <div className="flex items-center gap-3">
          {user && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {user.email}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut className="size-4" />
            {logoutMutation.isPending ? "Signing out..." : "Log out"}
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create an organization
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {memberships.length === 0
              ? "Name your organization to start planning your team's week."
              : "Set up a new organization workspace."}
          </p>
        </div>

        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Northwind Labs"
                          className="h-11 pl-9"
                          autoFocus
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                disabled={createOrgMutation.isPending}
              >
                <Plus className="size-4" />
                {createOrgMutation.isPending
                  ? "Creating organization..."
                  : "Create organization"}
              </Button>
            </form>
          </Form>
        </div>

        {memberships.length > 0 && (
          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.navigate({ to: "/" })}
            >
              <ArrowLeft className="size-4" />
              Back to workspace
            </Button>
          </div>
        )}
      </main>

      <footer className="py-2 text-center text-xs text-muted-foreground">
        Cadence — weekly engineering plans
      </footer>
    </div>
  );
}
