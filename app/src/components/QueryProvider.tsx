import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  getApiErrorCode,
  getApiErrorMessage,
  getUiErrorDecision,
} from "@/lib/api-errors";
import { isPublicRoute } from "@/lib/routes";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (
              getUiErrorDecision(error) === "redirect_login" &&
              typeof window !== "undefined" &&
              !isPublicRoute(window.location.pathname)
            ) {
              window.location.replace("/login");
            }
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (
              getUiErrorDecision(error) === "redirect_login" &&
              typeof window !== "undefined" &&
              !isPublicRoute(window.location.pathname)
            ) {
              window.location.replace("/login");
              return;
            }
            // A 403 forbidden from an action inside a page shows a toast.
            if (
              getApiErrorCode(error) === "forbidden" &&
              !mutation.meta?.["skipGlobalErrorToast"]
            ) {
              toast.error(getApiErrorMessage(error));
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: (failureCount: number, error: unknown) => {
              // Only retry on network errors, not on 4xx errors
              const status =
                error instanceof ApiError ? error.status : undefined;
              if (status && status >= 400 && status < 500) {
                return false;
              }
              return failureCount < 2; // Max 2 retries
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
