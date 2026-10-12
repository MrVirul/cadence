export const MAX_WEEKS_AHEAD = 4;

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseUtcDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  const [yStr, mStr, dStr] = iso.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime()) || formatUtcDate(date) !== iso) {
    return null;
  }
  return date;
}

/**
 * Returns the Monday of the week containing `now` in UTC, matching
 * `api/app/clock.py::current_week_start(today_utc())`.
 */
export function currentWeekStartUtc(now: Date = new Date()): string {
  const weekdayMondayZero = (now.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - weekdayMondayZero
    )
  );
  return formatUtcDate(monday);
}

export function isMondayUtc(iso: string): boolean {
  const date = parseUtcDate(iso);
  return date !== null && date.getUTCDay() === 1;
}

export function addWeeksUtc(iso: string, deltaWeeks: number): string {
  const date = parseUtcDate(iso);
  if (!date) {
    return iso;
  }
  const shifted = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + deltaWeeks * 7
    )
  );
  return formatUtcDate(shifted);
}

export function latestWeekStartUtc(now: Date = new Date()): string {
  return addWeeksUtc(currentWeekStartUtc(now), MAX_WEEKS_AHEAD);
}

export type WeekWindowStatus = "past" | "creatable" | "too_far_ahead";

export function getWeekWindowStatus(
  weekStartIso: string,
  now: Date = new Date()
): WeekWindowStatus {
  const current = currentWeekStartUtc(now);
  const latest = latestWeekStartUtc(now);
  if (weekStartIso < current) {
    return "past";
  }
  if (weekStartIso > latest) {
    return "too_far_ahead";
  }
  return "creatable";
}

export function getWeekRangeLabel(weekStartIso: string): string {
  const monday = parseUtcDate(weekStartIso);
  if (!monday) {
    return weekStartIso;
  }
  const friday = new Date(
    Date.UTC(
      monday.getUTCFullYear(),
      monday.getUTCMonth(),
      monday.getUTCDate() + 4
    )
  );
  const startMonth = SHORT_MONTHS[monday.getUTCMonth()];
  const endMonth = SHORT_MONTHS[friday.getUTCMonth()];
  const startDay = monday.getUTCDate();
  const endDay = friday.getUTCDate();
  const startYear = monday.getUTCFullYear();
  const endYear = friday.getUTCFullYear();

  if (startYear !== endYear) {
    return `${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${endYear}`;
  }
  return `${startMonth} ${startDay} – ${endDay}, ${endYear}`;
}
