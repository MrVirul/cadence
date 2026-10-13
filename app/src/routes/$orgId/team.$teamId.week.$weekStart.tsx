import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  History,
  Loader2,
  MessageSquareWarning,
  Users,
} from "lucide-react";
import {
  getGetPlanQueryKey,
  getListPlansQueryKey,
  useApprovePlan,
  useGetPlan,
  useSendBackPlan,
} from "@/api/endpoints/plans/plans";
import {
  getTeamWeekQueryKey,
  useGetTeam,
  useTeamWeek,
} from "@/api/endpoints/teams/teams";
import { PageQueryGate } from "@/components/guards/PageQueryGate";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PlanReadOnlyView } from "@/components/week/PlanReadOnlyView";
import {
  PlanStatusBadge,
  ShippedBadge,
} from "@/components/week/PlanStatusBadge";
import { WeekBar } from "@/components/week/WeekBar";
import { useUser } from "@/contexts/user-context";
import {
  getApiErrorCode,
  getApiErrorMessage,
  getApiStatus,
} from "@/lib/api-errors";
import { cn } from "@/lib/utils";
import {
  currentWeekStartUtc,
  getWeekRangeLabel,
  isMondayUtc,
} from "@/lib/week";

export const Route = createFileRoute("/$orgId/team/$teamId/week/$weekStart")({
  head: ({ params }) => ({
    meta: [{ title: `Team week (${params.weekStart}) — Cadence` }],
  }),
  component: TeamWeekPage,
});

const COMMENT_MAX = 1000;

function TeamWeekPage() {
  const { orgId, teamId, weekStart } = Route.useParams();
  return (
    <TeamWeekWorkspace
      key={`${orgId}:${teamId}:${weekStart}`}
      orgId={orgId}
      teamId={teamId}
      weekStart={weekStart}
    />
  );
}

function TeamWeekWorkspace({
  orgId,
  teamId,
  weekStart,
}: {
  orgId: string;
  teamId: string;
  weekStart: string;
}) {
  const queryClient = useQueryClient();
  const { user, memberships } = useUser();
  const thisMonday = currentWeekStartUtc();
  const validMonday = isMondayUtc(weekStart);

  const currentMembership = memberships.find((m) => m.org.id === orgId);
  const isOrgAdminOrOwner =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackComment, setSendBackComment] = useState("");
  const [sendBackError, setSendBackError] = useState<string | null>(null);

  const teamWeekQuery = useTeamWeek(
    orgId,
    teamId,
    { week: weekStart },
    {
      query: {
        enabled: validMonday,
        retry: false,
      },
    }
  );

  const teamQuery = useGetTeam(orgId, teamId, {
    query: {
      enabled: validMonday,
      retry: false,
    },
  });

  const planQuery = useGetPlan(orgId, selectedPlanId ?? "", {
    query: {
      enabled: Boolean(selectedPlanId),
      retry: false,
    },
  });

  const approveMutation = useApprovePlan({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });

  const sendBackMutation = useSendBackPlan({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });

  if (!validMonday) {
    return (
      <div className="rounded-xl border bg-background p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-2 size-8 text-amber-600" />
        <h1 className="text-lg font-semibold text-foreground">
          Plans start on Mondays
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {weekStart} is not a valid Monday date in UTC.
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
            Go to this week ({thisMonday})
          </Button>
        </div>
      </div>
    );
  }

  const team = teamQuery.data;
  const leadMember = team?.lead_membership_id
    ? team.members.find((m) => m.membership_id === team.lead_membership_id)
    : undefined;

  const rows = teamWeekQuery.data?.rows ?? [];
  const totalMembers = rows.length;
  const submittedCount = rows.filter(
    (r) =>
      r.status === "submitted" || r.status === "approved" || r.status === "done"
  ).length;
  const approvedCount = rows.filter(
    (r) => r.status === "approved" || r.status === "done"
  ).length;

  const isLoading = teamWeekQuery.isLoading || teamQuery.isLoading;

  const openPlanSheet = (planId: string) => {
    setSelectedPlanId(planId);
    setSendBackOpen(false);
    setSendBackComment("");
    setSendBackError(null);
  };

  const closePlanSheet = () => {
    setSelectedPlanId(null);
    setSendBackOpen(false);
    setSendBackComment("");
    setSendBackError(null);
  };

  const refetchAfterDecision = async (planId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getTeamWeekQueryKey(orgId, teamId),
      }),
      queryClient.invalidateQueries({
        queryKey: getGetPlanQueryKey(orgId, planId),
      }),
      queryClient.invalidateQueries({
        queryKey: getListPlansQueryKey(orgId),
      }),
    ]);
  };

  const handleDecisionError = async (err: unknown, planId: string) => {
    const code = getApiErrorCode(err);
    const status = getApiStatus(err);
    const isOwnPlan = planQuery.data?.author.user.id === user?.id;

    if (code === "forbidden" || status === 403) {
      if (isOwnPlan) {
        toast.error("Someone else needs to approve your plan");
      } else {
        toast.error(getApiErrorMessage(err));
      }
      return;
    }

    if (code === "invalid_transition" || status === 409) {
      toast.error(
        getApiErrorMessage(
          err,
          "Someone else already updated this plan. Refreshing..."
        )
      );
      await refetchAfterDecision(planId);
      return;
    }

    toast.error(getApiErrorMessage(err));
  };

  const handleApprove = async () => {
    const plan = planQuery.data;
    if (!plan) {
      return;
    }
    try {
      const updated = await approveMutation.mutateAsync({
        orgId,
        planId: plan.id,
      });
      queryClient.setQueryData(getGetPlanQueryKey(orgId, updated.id), updated);
      await refetchAfterDecision(plan.id);
      toast.success("Plan approved.");
    } catch (err) {
      await handleDecisionError(err, plan.id);
    }
  };

  const handleSendBackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const plan = planQuery.data;
    if (!plan) {
      return;
    }
    const trimmed = sendBackComment.trim();
    if (trimmed.length < 1) {
      setSendBackError(
        "Enter a comment (1–1,000 characters) explaining what needs to change."
      );
      return;
    }
    if (trimmed.length > COMMENT_MAX) {
      setSendBackError(`Comment must be at most ${COMMENT_MAX} characters.`);
      return;
    }

    setSendBackError(null);
    try {
      const updated = await sendBackMutation.mutateAsync({
        orgId,
        planId: plan.id,
        data: { comment: trimmed },
      });
      queryClient.setQueryData(getGetPlanQueryKey(orgId, updated.id), updated);
      setSendBackOpen(false);
      setSendBackComment("");
      await refetchAfterDecision(plan.id);
      toast.success("Plan sent back for changes.");
    } catch (err) {
      await handleDecisionError(err, plan.id);
    }
  };

  const isDecisionPending =
    approveMutation.isPending || sendBackMutation.isPending;

  return (
    <PageQueryGate error={teamWeekQuery.error || teamQuery.error} orgId={orgId}>
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
                  <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {team?.name ?? "Team"}
                  </h2>
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
                  Weekly commitments and approval status for this team.
                </p>
              </>
            )}
          </div>

          <div
            role="navigation"
            aria-label="Team view switcher"
            className="inline-flex items-center rounded-lg border bg-background p-1 shadow-xs"
          >
            <Link
              to="/$orgId/team/$teamId/week/$weekStart"
              params={{ orgId, teamId, weekStart: thisMonday }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
            >
              <CalendarDays className="size-3.5" />
              This week
            </Link>
            <Link
              to="/$orgId/team/$teamId/history"
              params={{ orgId, teamId }}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <History className="size-3.5" />
              History
            </Link>
          </div>
        </div>

        {/* Week Navigator Bar */}
        <WeekBar
          weekStart={weekStart}
          renderWeekLink={(targetMonday) => (
            <Link
              to="/$orgId/team/$teamId/week/$weekStart"
              params={{ orgId, teamId, weekStart: targetMonday }}
            />
          )}
        />

        {isLoading ? (
          <div className="space-y-4 rounded-xl border bg-background p-6 shadow-sm">
            <Skeleton className="h-5 w-52" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ) : totalMembers === 0 ? (
          <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              This team has no members yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Add engineers to this team so their weekly plans appear here for
              review.
            </p>
            {isOrgAdminOrOwner && (
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link to="/$orgId/teams" params={{ orgId }} />}
                >
                  Manage teams
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary line on top */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background px-4 py-3 shadow-xs">
              <p className="text-sm font-medium text-foreground">
                {submittedCount} of {totalMembers} submitted, {approvedCount}{" "}
                approved
              </p>
              <span className="text-xs text-muted-foreground">
                Select a member with a plan to inspect tasks or approve
              </span>
            </div>

            {/* Team Week Table */}
            <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="px-4">Member</TableHead>
                    <TableHead className="px-4">Status</TableHead>
                    <TableHead className="px-4">Tasks</TableHead>
                    <TableHead className="px-4">Shipped</TableHead>
                    <TableHead className="px-4 text-right">Plan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const hasPlan = Boolean(row.plan_id);
                    const isLead =
                      Boolean(team?.lead_membership_id) &&
                      row.membership_id === team?.lead_membership_id;
                    const pct =
                      row.tasks_total > 0
                        ? Math.round((row.tasks_done / row.tasks_total) * 100)
                        : 0;

                    return (
                      <TableRow
                        key={row.membership_id}
                        tabIndex={hasPlan ? 0 : undefined}
                        role={hasPlan ? "button" : undefined}
                        aria-label={
                          hasPlan
                            ? `Open plan for ${row.user.name || row.user.email}`
                            : undefined
                        }
                        onClick={() => {
                          if (row.plan_id) {
                            openPlanSheet(row.plan_id);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (
                            row.plan_id &&
                            (e.key === "Enter" || e.key === " ")
                          ) {
                            e.preventDefault();
                            openPlanSheet(row.plan_id);
                          }
                        }}
                        className={cn(
                          hasPlan && "cursor-pointer hover:bg-muted/60"
                        )}
                      >
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar
                              seed={row.user.id}
                              name={row.user.name}
                              size={28}
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-foreground">
                                  {row.user.name || row.user.email}
                                </span>
                                {isLead && (
                                  <Badge
                                    variant="secondary"
                                    className="px-1.5 py-0 text-[10px]"
                                  >
                                    Lead
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {row.user.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="px-4 py-3">
                          <PlanStatusBadge status={row.status} />
                        </TableCell>

                        <TableCell className="px-4 py-3">
                          {hasPlan ? (
                            <div className="flex min-w-28 items-center gap-2.5">
                              <div
                                className="h-2 w-16 overflow-hidden rounded-full bg-muted"
                                aria-hidden="true"
                              >
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium tabular-nums text-foreground">
                                {row.tasks_done} / {row.tasks_total}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              0 / 0
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="px-4 py-3">
                          <ShippedBadge shipped={row.shipped} nullLabel="—" />
                        </TableCell>

                        <TableCell className="px-4 py-3 text-right">
                          {row.plan_id ? (
                            <Button
                              type="button"
                              variant={
                                row.status === "submitted"
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (row.plan_id) {
                                  openPlanSheet(row.plan_id);
                                }
                              }}
                            >
                              {row.status === "submitted"
                                ? "Review"
                                : "View plan"}
                              <ChevronRight className="size-3.5" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No plan
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Read-only Plan Review Side Panel */}
      <Sheet
        open={Boolean(selectedPlanId)}
        onOpenChange={(open) => {
          if (!open) {
            closePlanSheet();
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-0 sm:max-w-xl"
        >
          <div className="space-y-5 p-4 sm:p-6">
            <SheetHeader className="p-0">
              <div className="flex items-center gap-3">
                {planQuery.data && (
                  <Avatar
                    seed={planQuery.data.author.user.id}
                    name={planQuery.data.author.user.name}
                    size={36}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <SheetTitle>
                    {planQuery.data
                      ? `${planQuery.data.author.user.name || planQuery.data.author.user.email}'s plan`
                      : "Weekly plan"}
                  </SheetTitle>
                  <SheetDescription>
                    {planQuery.data
                      ? `${planQuery.data.author.user.email} · ${getWeekRangeLabel(planQuery.data.week_start)}`
                      : `Week of ${weekStart}`}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            {planQuery.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            ) : planQuery.error ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{getApiErrorMessage(planQuery.error)}</span>
              </div>
            ) : planQuery.data ? (
              <div className="space-y-5">
                {/* Decision actions when plan is submitted */}
                {planQuery.data.status === "submitted" && (
                  <div className="space-y-4 rounded-xl border border-amber-300 bg-amber-50/70 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Ready for review
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Approve this weekly commitment or send it back with a
                          comment.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isDecisionPending}
                          onClick={handleApprove}
                        >
                          {approveMutation.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isDecisionPending}
                          onClick={() => {
                            setSendBackOpen((prev) => !prev);
                            setSendBackError(null);
                          }}
                        >
                          <MessageSquareWarning className="size-3.5" />
                          Send back
                        </Button>
                      </div>
                    </div>

                    {sendBackOpen && (
                      <form
                        onSubmit={handleSendBackSubmit}
                        className="space-y-3 border-t border-amber-200 pt-3"
                        noValidate
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="send-back-comment">
                              What needs to change?
                            </Label>
                            <span className="text-xs text-muted-foreground">
                              {sendBackComment.length}/{COMMENT_MAX}
                            </span>
                          </div>
                          <Textarea
                            id="send-back-comment"
                            value={sendBackComment}
                            maxLength={COMMENT_MAX}
                            aria-invalid={Boolean(sendBackError)}
                            onChange={(e) => {
                              setSendBackComment(
                                e.target.value.slice(0, COMMENT_MAX)
                              );
                              if (sendBackError) {
                                setSendBackError(null);
                              }
                            }}
                            placeholder="Explain what should be tightened before approving (e.g. make the main task a checkable Friday result)."
                            className="min-h-24 bg-background"
                          />
                          {sendBackError && (
                            <p
                              role="alert"
                              className="text-xs font-medium text-destructive"
                            >
                              {sendBackError}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={sendBackMutation.isPending}
                            onClick={() => {
                              setSendBackOpen(false);
                              setSendBackError(null);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={sendBackMutation.isPending}
                          >
                            {sendBackMutation.isPending && (
                              <Loader2 className="size-3.5 animate-spin" />
                            )}
                            Confirm send back
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                <PlanReadOnlyView
                  plan={planQuery.data}
                  teamName={team?.name}
                  canTick={false}
                />
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </PageQueryGate>
  );
}
