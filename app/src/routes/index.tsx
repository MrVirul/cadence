import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import FullScreenLoader from "@/components/FullScreenLoader";
import { useUser } from "@/contexts/user-context";
import { getLastUsedOrgId, setLastUsedOrgId } from "@/lib/routes";

export const Route = createFileRoute("/")({
  component: RootDispatchPage,
});

function RootDispatchPage() {
  const router = useRouter();
  const { memberships, isLoading, isAuthenticated, isUnauthenticated } =
    useUser();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (isUnauthenticated || !isAuthenticated) {
      router.navigate({ to: "/login", replace: true });
      return;
    }

    if (memberships.length === 0) {
      router.navigate({ to: "/onboarding", replace: true });
      return;
    }

    const savedOrgId = getLastUsedOrgId();
    const matched = memberships.find((m) => m.org.id === savedOrgId);
    const targetOrgId = matched?.org.id ?? memberships[0]?.org.id;

    if (targetOrgId) {
      setLastUsedOrgId(targetOrgId);
      router.navigate({ href: `/${targetOrgId}`, replace: true });
    }
  }, [isLoading, isAuthenticated, isUnauthenticated, memberships, router]);

  return <FullScreenLoader />;
}
