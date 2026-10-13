import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { getUiErrorDecision } from "@/lib/api-error";
import { isPublicRoute } from "@/lib/routes";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (typeof window === "undefined") {
              return;
            }
            const decision = getUiErrorDecision(error);
            if (
              decision === "redirect_login" &&
              !isPublicRoute(window.location.pathname)
            ) {
              window.location.replace("/login");
            } else if (
              decision === "staff_only" &&
              window.location.pathname !== "/staff-only"
            ) {
              window.location.replace("/staff-only");
            }
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            if (typeof window === "undefined") {
              return;
            }
            const decision = getUiErrorDecision(error);
            if (
              decision === "redirect_login" &&
              !isPublicRoute(window.location.pathname)
            ) {
              window.location.replace("/login");
            } else if (
              decision === "staff_only" &&
              window.location.pathname !== "/staff-only"
            ) {
              window.location.replace("/staff-only");
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: (failureCount: number, error: unknown) => {
              const status =
                error instanceof ApiError ? error.status : undefined;
              if (status && status >= 400 && status < 500) {
                return false;
              }
              return failureCount < 2;
            },
            retryDelay: (attemptIndex) =>
              Math.min(1000 * 2 ** attemptIndex, 5000),
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
