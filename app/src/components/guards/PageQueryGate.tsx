import { getUiErrorDecision } from "@/lib/api-errors";
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
    return <NoAccess />;
  }

  return <>{children}</>;
}
