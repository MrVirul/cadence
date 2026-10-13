import { useLocation } from "@tanstack/react-router";
import { useUser } from "@/contexts/user-context";
import { isPublicRoute } from "@/lib/routes";

export function useAuthStatus() {
  const { isLoading, isAuthenticated, isStaffOnly } = useUser();
  const pathname = useLocation({ select: (l) => l.pathname });

  const isMetaRoute = isPublicRoute(pathname);
  const isMainRoute = !isMetaRoute;

  const shouldShowLoader =
    isMainRoute && !isStaffOnly && (isLoading || !isAuthenticated);

  return {
    isLoading,
    isAuthenticated,
    isStaffOnly,
    isMainRoute,
    isMetaRoute,
    shouldShowLoader,
  };
}
