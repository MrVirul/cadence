import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldAlert } from "lucide-react";
import { logout } from "@/api/endpoints/auth/auth";
import { InternalBanner } from "@/components/InternalBanner";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

interface StaffOnlyViewProps {
  withBanner?: boolean;
}

export function StaffOnlyView({ withBanner = true }: StaffOnlyViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await logout();
      } catch {
        // Ignore logout errors if cookie is already cleared
      }
    },
    onSettled: () => {
      queryClient.clear();
      navigate({ to: "/login", replace: true });
    },
  });

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 text-foreground">
      {withBanner && <InternalBanner />}
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-[#B45309] dark:text-amber-400">
            <ShieldAlert className="size-6" />
          </div>
          <div className="mb-3 flex justify-center">
            <Logo />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            This area is for Cadence staff only
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account does not have platform staff access. Sign out to return
            to the staff login screen or use the customer application instead.
          </p>
          <div className="mt-6">
            <Button
              variant="default"
              className="w-full sm:w-auto"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
            >
              <LogOut className="size-4" />
              {logoutMutation.isPending ? "Logging out..." : "Log out"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
