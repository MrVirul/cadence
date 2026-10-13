import { useAuthStatus } from "@/hooks/use-auth-status";
import FullScreenLoader from "./FullScreenLoader";
import { StaffOnlyView } from "./StaffOnlyView";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { shouldShowLoader, isStaffOnly } = useAuthStatus();

  if (isStaffOnly) {
    return <StaffOnlyView withBanner />;
  }

  if (shouldShowLoader) {
    return <FullScreenLoader />;
  }

  return <>{children}</>;
}
