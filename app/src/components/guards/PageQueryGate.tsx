import {
  getApiErrorCode,
  getApiStatus,
  getUiErrorDecision,
} from "@/lib/api-errors";
import { NoAccess } from "./NoAccess";
import { Suspended } from "./Suspended";

interface PageQueryGateProps {
  error: unknown;
  orgId?: string;
  children: React.ReactNode;
}

export function PageQueryGate({ error, orgId, children }: PageQueryGateProps) {
  const decision = getUiErrorDecision(error);

  if (decision === "suspended") {
    return <Suspended orgId={orgId} />;
  }

  if (decision === "no_access") {
    const isForbidden =
      getApiErrorCode(error) === "forbidden" || getApiStatus(error) === 403;
    return <NoAccess variant={isForbidden ? "forbidden" : "not_found"} />;
  }

  return <>{children}</>;
}
