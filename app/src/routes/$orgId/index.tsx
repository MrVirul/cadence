import { Navigate, createFileRoute } from "@tanstack/react-router";
import { currentWeekStartUtc } from "@/lib/week";

export const Route = createFileRoute("/$orgId/")({
  component: OrgIndexRedirect,
});

function OrgIndexRedirect() {
  const { orgId } = Route.useParams();
  const weekStart = currentWeekStartUtc();
  return (
    <Navigate
      to="/$orgId/week/$weekStart"
      params={{ orgId, weekStart }}
      replace
    />
  );
}
