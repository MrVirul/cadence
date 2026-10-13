import { AlertTriangle, Check, Info, Sparkles, X } from "lucide-react";
import type { Finding } from "@/api/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<Finding["category"], string> = {
  not_verifiable: "Not a checkable result",
  missing_why: "Missing why",
  missing_gtm: "Missing go-to-market goal",
  scope_too_big: "Scope too big for one week",
  too_vague: "Too vague",
  duplicate: "Duplicate task",
};

const ACTION_LABELS: Record<Finding["action"], string> = {
  rewrite_title: "Suggested title rewrite",
  rewrite_why: "Suggested 'why' rewrite",
  add_task: "Suggested task to add",
};

export interface FindingCardProps {
  finding: Finding;
  isOutdated?: boolean;
  applyDisabledReason?: string | null;
  onApply: () => void;
  onDismiss: () => void;
}

export function FindingCard({
  finding,
  isOutdated = false,
  applyDisabledReason = null,
  onApply,
  onDismiss,
}: FindingCardProps) {
  const isBlocker = finding.severity === "blocker";

  return (
    <div
      className={cn(
        "ai-finding-card rounded-lg border p-3.5 text-sm transition-colors",
        isBlocker
          ? "border-amber-300 bg-amber-50/70 text-foreground"
          : "border-indigo-200 bg-indigo-50/50 text-foreground"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {isBlocker ? (
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          ) : (
            <Info className="size-4 shrink-0 text-indigo-600" />
          )}
          <Badge
            variant="outline"
            className={cn(
              "text-xs font-medium",
              isBlocker
                ? "border-amber-300 bg-amber-100/80 text-amber-900"
                : "border-indigo-200 bg-indigo-100/80 text-indigo-900"
            )}
          >
            {CATEGORY_LABELS[finding.category] ?? finding.category}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {finding.severity}
          </Badge>
          {isOutdated && (
            <Badge
              variant="outline"
              className="border-slate-300 bg-slate-100 text-xs text-slate-700"
            >
              May be outdated
            </Badge>
          )}
        </div>
      </div>

      <p className="mt-2 text-sm text-foreground">{finding.problem}</p>

      <div className="mt-2.5 rounded-md border bg-background/90 p-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          {ACTION_LABELS[finding.action]}
          {finding.action === "add_task" && finding.suggested_kind
            ? ` (${finding.suggested_kind === "gtm" ? "Go-to-market goal" : "Sub-goal"})`
            : ""}
          :
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {finding.suggested_rewrite}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={Boolean(applyDisabledReason)}
            onClick={onApply}
          >
            <Check className="size-3.5" />
            Apply
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
            <X className="size-3.5" />
            Dismiss
          </Button>
        </div>
        {applyDisabledReason && (
          <span className="text-xs text-muted-foreground">
            {applyDisabledReason}
          </span>
        )}
      </div>
    </div>
  );
}

export function AiReviewSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Sparkles className="size-4 animate-pulse" />
        <span>Reviewing your plan...</span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-indigo-200/60" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-indigo-200/50" />
      </div>
    </div>
  );
}
