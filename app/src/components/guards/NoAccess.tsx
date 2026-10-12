import { useRouter } from "@tanstack/react-router";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { getLastUsedOrgId } from "@/lib/routes";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

interface NoAccessProps {
  variant?: "not_found" | "forbidden";
}

export function NoAccess({ variant = "not_found" }: NoAccessProps) {
  const router = useRouter();
  const { memberships } = useUser();

  const handleBack = () => {
    const lastOrgId = getLastUsedOrgId();
    const validLastOrg = memberships.find((m) => m.org.id === lastOrgId);
    const fallbackOrgId = validLastOrg?.org.id ?? memberships[0]?.org.id;

    if (fallbackOrgId) {
      router.navigate({ href: `/${fallbackOrgId}` });
    } else {
      router.navigate({ to: "/onboarding" });
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ShieldAlert className="size-5" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">
            {variant === "forbidden"
              ? "Only team leads and org admins can see this"
              : "You don't have access to this"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {variant === "forbidden"
              ? "You don't have access to this page with your current role."
              : "This resource doesn't exist or you don't have permission to view it."}
          </p>
          <div className="mt-6">
            <Button className="h-10 w-full" onClick={handleBack}>
              <ArrowLeft className="size-4" />
              {memberships.length > 0
                ? "Back to my organization"
                : "Create an organization"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
