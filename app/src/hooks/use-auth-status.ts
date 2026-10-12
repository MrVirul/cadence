import { useLocation } from "@tanstack/react-router";
import { useUser } from "@/contexts/user-context";
import { isPublicRoute } from "@/lib/routes";

// Single source of truth for auth status across all components.
export function useAuthStatus() {
  const { isLoading, isAuthenticated } = useUser();
  const pathname = useLocation({ select: (l) => l.pathname });

  // Public routes (/login, /signup, /invite/<token>) do not require auth.
  const isMetaRoute = isPublicRoute(pathname);
  const isMainRoute = !isMetaRoute;

  const shouldShowLoader = isMainRoute && (isLoading || !isAuthenticated);

  return {
    isLoading,
    isAuthenticated,
    isMainRoute,
    isMetaRoute,
    shouldShowLoader,
  };
}
