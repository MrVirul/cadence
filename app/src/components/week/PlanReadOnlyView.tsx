import type { ReactNode } from "react";
import { CheckCircle2, History, MessageSquareWarning } from "lucide-react";
import type { PlanDetailResponse, PlanEventResponseAction } from "@/api/model";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PlanStatusBadge, ShippedBadge } from "./PlanStatusBadge";
import { cn } from "@/lib/utils";

const EVENT_LABELS: Record<
  PlanEventResponseAction,
  { label: string; className: string }
> = {
  submitted: {
    label: "Submitted",
    className: "border-amber-300 bg-amber-50 text-amber-800",
  },
  withdrawn: {
    label: "Withdrawn",
    className: "border-slate-300 bg-slate-100 text-slate-700",
  },
  approved: {
    label: "Approved",
    className: "border-indigo-300 bg-indigo-50 text-indigo-800",
  },
  sent_back: {
    label: "Sent back",
    className: "border-amber-300 bg-amber-100 text-amber-900",
  },
  closed: {
    label: "Closed",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800",
  },
};

function formatUtcTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

interface PlanReadOnlyViewProps {
  plan: PlanDetailResponse;
  teamName?: string;
  canTick?: boolean;
  onTickTask?: (taskId: string, currentStatus: "todo" | "done") => void;
  statusNote?: ReactNode;
  actions?: ReactNode;
}

export function PlanReadOnlyView({
  plan,
  teamName,
  canTick = false,
  onTickTask,
  statusNote,
  actions,
}: PlanReadOnlyViewProps) {
  const sortedTasks = [...plan.tasks].sort((a, b) => a.position - b.position);
  const mainTask = sortedTasks.find((t) => t.kind === "main");
  const subGoals = sortedTasks.filter((t) => t.kind === "sub_goal");
  const gtmGoals = sortedTasks.filter((t) => t.kind === "gtm");
  const doneCount = sortedTasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-6">
      {/* Sent-back comment banner */}
      {plan.decision_comment && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                Sent back for changes
                {plan.decided_by
                  ? ` by ${plan.decided_by.user.name || plan.decided_by.user.email}`
                  : ""}
              </p>
              <p className="text-sm whitespace-pre-wrap text-amber-900">
                {plan.decision_comment}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <PlanStatusBadge
            status={plan.status}
            hasDecisionComment={Boolean(plan.decision_comment)}
          />

          {plan.status === "done" && <ShippedBadge shipped={plan.shipped} />}

          {teamName && (
            <span className="text-xs text-muted-foreground">
              Team:{" "}
              <strong className="font-medium text-foreground">
                {teamName}
              </strong>
            </span>
          )}

          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300 ease-out"
                style={{
                  width: `${sortedTasks.length ? (doneCount / sortedTasks.length) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              ({doneCount}/{sortedTasks.length} tasks done)
            </span>
          </div>

          {statusNote}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {/* Main Task */}
      <section className="space-y-3 rounded-xl border bg-background p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Main task</h2>
          {canTick && (
            <span className="text-xs text-muted-foreground">
              Tick tasks as you complete them
            </span>
          )}
        </div>

        {mainTask ? (
          <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
            <Checkbox
              id={`tick-${mainTask.id}`}
              checked={mainTask.status === "done"}
              disabled={!canTick}
              onCheckedChange={() => onTickTask?.(mainTask.id, mainTask.status)}
              aria-label={`Mark main task "${mainTask.title}" as done`}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <label
                htmlFor={`tick-${mainTask.id}`}
                className={cn(
                  "block text-sm font-medium text-foreground transition-all duration-200",
                  canTick && "cursor-pointer",
                  mainTask.status === "done" &&
                    "line-through text-muted-foreground"
                )}
              >
                {mainTask.title}
              </label>
              {mainTask.why && (
                <p className="text-xs text-muted-foreground">
                  <strong className="font-medium text-foreground">Why:</strong>{" "}
                  {mainTask.why}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No main task set.</p>
        )}
      </section>

      {/* Sub-goals */}
      {subGoals.length > 0 && (
        <section className="space-y-3 rounded-xl border bg-background p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-foreground">Sub-goals</h2>
          <div className="space-y-2.5">
            {subGoals.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3.5"
              >
                <Checkbox
                  id={`tick-${task.id}`}
                  checked={task.status === "done"}
                  disabled={!canTick}
                  onCheckedChange={() => onTickTask?.(task.id, task.status)}
                  aria-label={`Mark sub-goal "${task.title}" as done`}
                  className="mt-0.5"
                />
                <label
                  htmlFor={`tick-${task.id}`}
                  className={cn(
                    "block flex-1 text-sm text-foreground transition-all duration-200",
                    canTick && "cursor-pointer",
                    task.status === "done" &&
                      "line-through text-muted-foreground"
                  )}
                >
                  {task.title}
                </label>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Go-to-market goals */}
      {gtmGoals.length > 0 && (
        <section className="space-y-3 rounded-xl border bg-background p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-foreground">
            Go-to-market goals
          </h2>
          <div className="space-y-2.5">
            {gtmGoals.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3.5"
              >
                <Checkbox
                  id={`tick-${task.id}`}
                  checked={task.status === "done"}
                  disabled={!canTick}
                  onCheckedChange={() => onTickTask?.(task.id, task.status)}
                  aria-label={`Mark GTM goal "${task.title}" as done`}
                  className="mt-0.5"
                />
                <label
                  htmlFor={`tick-${task.id}`}
                  className={cn(
                    "block flex-1 text-sm text-foreground transition-all duration-200",
                    canTick && "cursor-pointer",
                    task.status === "done" &&
                      "line-through text-muted-foreground"
                  )}
                >
                  {task.title}
                </label>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Events / Comment history */}
      {plan.events.length > 0 && (
        <section className="space-y-3 rounded-xl border bg-background p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">
              Activity &amp; comments
            </h2>
          </div>
          <div className="space-y-2.5">
            {plan.events.map((ev) => {
              const info = EVENT_LABELS[ev.action];
              return (
                <div
                  key={ev.id}
                  className="rounded-lg border bg-muted/20 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={info.className}>
                        {info.label}
                      </Badge>
                      {ev.self_approved && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="size-3" />
                          Self-approved (no other approver)
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatUtcTimestamp(ev.created_at)} UTC
                    </span>
                  </div>
                  {ev.comment && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                      {ev.comment}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
