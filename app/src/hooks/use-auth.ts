import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMe } from "@/api/endpoints/auth/auth";
import { getUiErrorDecision } from "@/lib/api-errors";
import { isPublicRoute } from "@/lib/routes";

// Resolves the current session from GET /me (authenticated via the httponly
// access_token cookie) and redirects to /login when a protected route is hit
// without a valid session.
export function useAuth() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });
  const [isInitialMount, setIsInitialMount] = useState(true);

  const {
    data: me,
    isLoading: queryLoading,
    error,
    refetch,
  } = useMe({
    query: {
      retry: false,
      staleTime: 0,
      gcTime: 0,
    },
  });

  const user = me?.user;
  const memberships = me?.memberships ?? [];

  useEffect(() => {
    if (!queryLoading) {
      if (error) {
        const decision = getUiErrorDecision(error);
        // Only redirect to login from protected routes on invalid_token or credentials_required;
        // public routes (/login, /signup, /invite/<token>) render without a session.
        if (decision === "redirect_login" && !isPublicRoute(pathname)) {
          navigate({ to: "/login", replace: true });
          return undefined;
        }
      }
      // Small buffer to prevent UI flash while the auth check settles.
      const timer = setTimeout(() => {
        setIsInitialMount(false);
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [queryLoading, error, navigate, pathname]);

  const isLoading = queryLoading || isInitialMount;
  const isAuthenticated = !isLoading && !error && !!user;
  const isUnauthenticated = !isLoading && (!!error || !user);

  return {
    user,
    memberships,
    isLoading,
    error,
    isAuthenticated,
    isUnauthenticated,
    refetch,
  };
}
