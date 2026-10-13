import { createFileRoute } from "@tanstack/react-router";
import { StaffOnlyView } from "@/components/StaffOnlyView";

export const Route = createFileRoute("/staff-only")({
  component: StaffOnlyRoute,
});

function StaffOnlyRoute() {
  return <StaffOnlyView withBanner />;
}
