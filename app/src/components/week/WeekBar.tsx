import type { ReactElement } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addWeeksUtc,
  currentWeekStartUtc,
  getWeekRangeLabel,
  getWeekWindowStatus,
} from "@/lib/week";

interface WeekBarProps {
  weekStart: string;
  renderWeekLink: (targetMonday: string) => ReactElement;
}

export function WeekBar({ weekStart, renderWeekLink }: WeekBarProps) {
  const thisMonday = currentWeekStartUtc();
  const weekWindow = getWeekWindowStatus(weekStart);
  const isPastWeek = weekWindow === "past";
  const prevMonday = addWeeksUtc(weekStart, -1);
  const nextMonday = addWeeksUtc(weekStart, 1);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {getWeekRangeLabel(weekStart)}
          </h1>
          {weekStart === thisMonday ? (
            <Badge
              variant="outline"
              className="border-indigo-300 bg-indigo-50 text-indigo-800"
            >
              This week
            </Badge>
          ) : isPastWeek ? (
            <Badge
              variant="outline"
              className="border-slate-300 bg-slate-100 text-slate-700"
            >
              Past week
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-slate-300 bg-slate-50 text-slate-700"
            >
              Upcoming
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Week starting Monday, {weekStart} (UTC)
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous week"
          render={renderWeekLink(prevMonday)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant={weekStart === thisMonday ? "secondary" : "outline"}
          size="sm"
          disabled={weekStart === thisMonday}
          render={
            weekStart === thisMonday ? undefined : renderWeekLink(thisMonday)
          }
        >
          This week
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next week"
          render={renderWeekLink(nextMonday)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
