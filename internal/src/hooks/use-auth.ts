import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useGetCurrentInternalUser } from "@/api/endpoints/users/users";
import { getApiErrorCode, getApiStatus } from "@/lib/api-error";
import { isPublicRoute } from "@/lib/routes";

// Resolves the current session from GET /users/self (authenticated via the
// httponly internal_access_token cookie).
// - 401 (invalid_token / credentials_required / unauthorized) -> redirect to /login
// - 403 (staff_only) or user.is_admin === false -> show StaffOnlyView in AuthGuard
export function useAuth() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });
  const [isInitialMount, setIsInitialMount] = useState(true);

  const {
    data: user,
    isLoading: queryLoading,
    error,
    refetch,
  } = useGetCurrentInternalUser({
    query: {
      retry: false,
      staleTime: 0,
      gcTime: 0,
    },
  });

  const errorCode = getApiErrorCode(error);
  const errorStatus = getApiStatus(error);
  const isStaffOnly =
    !queryLoading &&
    (errorCode === "staff_only" ||
      errorStatus === 403 ||
      (user !== undefined && !user.is_admin));

  useEffect(() => {
    if (!queryLoading) {
      if (error && !isStaffOnly) {
        if (!isPublicRoute(pathname)) {
          navigate({ to: "/login", replace: true });
          return undefined;
        }
      }
      const timer = setTimeout(() => {
        setIsInitialMount(false);
      }, 60);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [queryLoading, error, isStaffOnly, navigate, pathname]);

  const isLoading = queryLoading || isInitialMount;
  const isAuthenticated =
    !isLoading && !error && Boolean(user) && Boolean(user?.is_admin);
  const isUnauthenticated = !isLoading && (Boolean(error) || !user);

  return {
    user,
    isLoading,
    error,
    isStaffOnly,
    isAuthenticated,
    isUnauthenticated,
    refetch,
  };
}
