import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";

export const Route = createFileRoute("/$orgId/")({
  component: OrgIndexStubPage,
});

function OrgIndexStubPage() {
  return (
    <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CalendarDays className="size-5" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">
        My week is coming next
      </h1>
    </div>
  );
}
