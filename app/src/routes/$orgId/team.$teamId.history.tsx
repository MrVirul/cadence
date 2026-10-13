import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
} from "lucide-react";
import { useGetTeam, useTeamHistory } from "@/api/endpoints/teams/teams";
import { PageQueryGate } from "@/components/guards/PageQueryGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currentWeekStartUtc, getWeekRangeLabel } from "@/lib/week";

export const Route = createFileRoute("/$orgId/team/$teamId/history")({
  head: () => ({
    meta: [{ title: "Team history — Cadence" }],
  }),
  component: TeamHistoryPage,
});

const PAGE_SIZE = 10;

function TeamHistoryPage() {
  const { orgId, teamId } = Route.useParams();
  return (
    <TeamHistoryWorkspace
      key={`${orgId}:${teamId}`}
      orgId={orgId}
      teamId={teamId}
    />
  );
}

function TeamHistoryWorkspace({
  orgId,
  teamId,
}: {
  orgId: string;
  teamId: string;
}) {
  const thisMonday = currentWeekStartUtc();
  const [page, setPage] = useState(0);

  const historyQuery = useTeamHistory(
    orgId,
    teamId,
    {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    {
      query: {
        retry: false,
      },
    }
  );

  const teamQuery = useGetTeam(orgId, teamId, {
    query: {
      retry: false,
    },
  });

  const team = teamQuery.data;
  const leadMember = team?.lead_membership_id
    ? team.members.find((m) => m.membership_id === team.lead_membership_id)
    : undefined;

  const items = historyQuery.data?.items ?? [];
  const totalWeeks = historyQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalWeeks / PAGE_SIZE));
  const overallShippedRate = historyQuery.data?.shipped_rate;
  const overallRatePercent =
    overallShippedRate !== null && overallShippedRate !== undefined
      ? Math.round(
          overallShippedRate <= 1
            ? overallShippedRate * 100
            : overallShippedRate
        )
      : null;

  return (
    <PageQueryGate error={historyQuery.error || teamQuery.error} orgId={orgId}>
      <div className="space-y-6">
        {/* Team Header + View Switcher */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            {teamQuery.isLoading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-36" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {team?.name ?? "Team"} — History
                  </h1>
                  {leadMember ? (
                    <Badge variant="secondary" className="text-xs font-normal">
                      Lead: {leadMember.user.name || leadMember.user.email}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-xs text-amber-800"
                    >
                      No lead yet
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Past weekly commitments and shipped rate for this team.
                </p>
              </>
            )}
          </div>

          <div
            role="navigation"
            aria-label="Team view switcher"
            className="inline-flex items-center self-start rounded-lg border bg-background p-1 shadow-xs sm:self-auto"
          >
            <Link
              to="/$orgId/team/$teamId/week/$weekStart"
              params={{ orgId, teamId, weekStart: thisMonday }}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <CalendarDays className="size-3.5" />
              This week
            </Link>
            <Link
              to="/$orgId/team/$teamId/history"
              params={{ orgId, teamId }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
            >
              <History className="size-3.5" />
              History
            </Link>
          </div>
        </div>

        {/* Summary bar when history exists */}
        {!historyQuery.isLoading && items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 shadow-xs">
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {totalWeeks}
              </span>{" "}
              {totalWeeks === 1 ? "past week" : "past weeks"} recorded
            </div>
            {overallRatePercent !== null && (
              <div className="flex items-center gap-2.5 text-sm">
                <span className="text-muted-foreground">
                  Page shipped rate:
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{ width: `${overallRatePercent}%` }}
                    />
                  </div>
                  <span className="font-semibold tabular-nums text-foreground">
                    {overallRatePercent}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {historyQuery.isLoading ? (
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
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock className="size-5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              No past weeks for this team yet
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Once a week finishes, the team&apos;s plan counts and shipped rate
              will show up here.
            </p>
            <div className="mt-4">
              <Button
                size="sm"
                render={
                  <Link
                    to="/$orgId/team/$teamId/week/$weekStart"
                    params={{ orgId, teamId, weekStart: thisMonday }}
                  />
                }
              >
                Go to this week
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="px-4">Week</TableHead>
                    <TableHead className="px-4 text-right">Total</TableHead>
                    <TableHead className="px-4 text-right">Submitted</TableHead>
                    <TableHead className="px-4 text-right">Approved</TableHead>
                    <TableHead className="px-4 text-right">Done</TableHead>
                    <TableHead className="px-4 text-right">Shipped</TableHead>
                    <TableHead className="px-4">Shipped rate</TableHead>
                    <TableHead className="w-10 px-3" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((week) => {
                    const weekRate =
                      week.total > 0
                        ? Math.round((week.shipped_count / week.total) * 100)
                        : 0;
                    return (
                      <TableRow key={week.week_start}>
                        <TableCell className="px-4 py-3">
                          <Link
                            to="/$orgId/team/$teamId/week/$weekStart"
                            params={{
                              orgId,
                              teamId,
                              weekStart: week.week_start,
                            }}
                            className="group inline-flex flex-col hover:underline"
                          >
                            <span className="font-medium text-foreground group-hover:text-primary">
                              {getWeekRangeLabel(week.week_start)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Week of {week.week_start}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right font-medium tabular-nums">
                          {week.total}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {week.submitted_count}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {week.approved_count}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {week.done_count}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right font-medium tabular-nums text-emerald-700">
                          {week.shipped_count}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-emerald-600 transition-all"
                                style={{ width: `${weekRate}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium tabular-nums text-foreground">
                              {weekRate}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right">
                          <Link
                            to="/$orgId/team/$teamId/week/$weekStart"
                            params={{
                              orgId,
                              teamId,
                              weekStart: week.week_start,
                            }}
                            aria-label={`Open week of ${week.week_start}`}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <ChevronRight className="size-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {totalWeeks > PAGE_SIZE && (
              <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-xs text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–
                  {Math.min((page + 1) * PAGE_SIZE, totalWeeks)} of {totalWeeks}{" "}
                  past weeks
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
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
