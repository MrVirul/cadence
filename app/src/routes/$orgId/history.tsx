import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useListPlans } from "@/api/endpoints/plans/plans";
import { PageQueryGate } from "@/components/guards/PageQueryGate";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PlanStatusBadge,
  ShippedBadge,
} from "@/components/week/PlanStatusBadge";
import { currentWeekStartUtc, getWeekRangeLabel } from "@/lib/week";

export const Route = createFileRoute("/$orgId/history")({
  head: () => ({
    meta: [{ title: "My history — Cadence" }],
  }),
  component: MyHistoryPage,
});

const PAGE_SIZE = 10;

function MyHistoryPage() {
  const { orgId } = Route.useParams();
  const thisMonday = currentWeekStartUtc();
  const [page, setPage] = useState(0);

  const plansQuery = useListPlans(
    orgId,
    { mine: true, limit: 100 },
    {
      query: {
        retry: false,
      },
    }
  );

  const pastPlans = useMemo(() => {
    const items = plansQuery.data?.items ?? [];
    return items
      .filter((item) => item.week_start < thisMonday)
      .sort((a, b) => b.week_start.localeCompare(a.week_start));
  }, [plansQuery.data?.items, thisMonday]);

  const totalPages = Math.max(1, Math.ceil(pastPlans.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = pastPlans.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE
  );

  return (
    <PageQueryGate error={plansQuery.error} orgId={orgId}>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              My past weeks
            </h1>
            <p className="text-sm text-muted-foreground">
              Your weekly commitments and whether the main task shipped.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                to="/$orgId/week/$weekStart"
                params={{ orgId, weekStart: thisMonday }}
              />
            }
          >
            <CalendarDays className="size-4" />
            This week
          </Button>
        </div>

        {plansQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-xl border bg-background p-4"
              >
                <div className="space-y-2">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : pastPlans.length === 0 ? (
          <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock className="size-5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              No past weeks yet
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Once a week finishes, your plan and shipped outcome will show up
              here.
            </p>
            <div className="mt-4">
              <Button
                size="sm"
                render={
                  <Link
                    to="/$orgId/week/$weekStart"
                    params={{ orgId, weekStart: thisMonday }}
                  />
                }
              >
                Go to this week
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="divide-y overflow-hidden rounded-xl border bg-background shadow-sm">
              {pageItems.map((plan) => (
                <Link
                  key={plan.id}
                  to="/$orgId/week/$weekStart"
                  params={{ orgId, weekStart: plan.week_start }}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {getWeekRangeLabel(plan.week_start)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        (Week of {plan.week_start})
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {plan.tasks_done} / {plan.tasks_total}{" "}
                      {plan.tasks_total === 1 ? "task" : "tasks"} done
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <PlanStatusBadge status={plan.status} />
                    <ShippedBadge
                      shipped={plan.shipped}
                      nullLabel="Not closed"
                    />
                    <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
                  </div>
                </Link>
              ))}
            </div>

            {pastPlans.length > PAGE_SIZE && (
              <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-xs text-muted-foreground">
                  Showing {safePage * PAGE_SIZE + 1}–
                  {Math.min((safePage + 1) * PAGE_SIZE, pastPlans.length)} of{" "}
                  {pastPlans.length} past weeks
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages - 1}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PageQueryGate>
  );
}
