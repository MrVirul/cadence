import { CheckCircle2, XCircle } from "lucide-react";
import type { PlanDetailResponseStatus, TeamWeekRowStatus } from "@/api/model";
import { Badge } from "@/components/ui/badge";

export type AnyPlanStatus = PlanDetailResponseStatus | TeamWeekRowStatus;

const STATUS_STYLES: Record<
  AnyPlanStatus,
  { label: string; className: string }
> = {
  not_started: {
    label: "Not started",
    className: "border-slate-200 bg-slate-50 text-slate-600",
  },
  draft: {
    label: "Draft",
    className: "border-slate-300 bg-slate-100 text-slate-800",
  },
  submitted: {
    label: "Submitted",
    className: "border-amber-300 bg-amber-50 text-amber-800",
  },
  approved: {
    label: "Approved",
    className: "border-indigo-300 bg-indigo-50 text-indigo-800",
  },
  done: {
    label: "Done",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800",
  },
};

interface PlanStatusBadgeProps {
  status: AnyPlanStatus;
  hasDecisionComment?: boolean;
}

export function PlanStatusBadge({
  status,
  hasDecisionComment = false,
}: PlanStatusBadgeProps) {
  if (status === "draft" && hasDecisionComment) {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-100 text-amber-900"
      >
        Sent back (Draft)
      </Badge>
    );
  }
  const info = STATUS_STYLES[status];
  return (
    <Badge variant="outline" className={info.className}>
      {info.label}
    </Badge>
  );
}

interface ShippedBadgeProps {
  shipped: boolean | null;
  nullLabel?: string | null;
}

export function ShippedBadge({ shipped, nullLabel = null }: ShippedBadgeProps) {
  if (shipped === true) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-300 bg-emerald-50 text-emerald-800"
      >
        <CheckCircle2 className="mr-1 size-3.5" />
        Shipped
      </Badge>
    );
  }
  if (shipped === false) {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-800"
      >
        <XCircle className="mr-1 size-3.5" />
        Not shipped
      </Badge>
    );
  }
  if (nullLabel) {
    return <span className="text-xs text-muted-foreground">{nullLabel}</span>;
  }
  return null;
}
