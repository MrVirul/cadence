import { formatDistanceToNow } from "date-fns";

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Never";
  }
  return formatDistanceToNow(date, { addSuffix: true });
}

export function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function subtractUtcDays(dateStr: string, days: number): string {
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

export function parseUtcDateMs(dateStr: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const d = parts[2] ?? 0;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt.getTime();
}

export function diffUtcDays(fromStr: string, toStr: string): number | null {
  const fromMs = parseUtcDateMs(fromStr);
  const toMs = parseUtcDateMs(toStr);
  if (fromMs === null || toMs === null) {
    return null;
  }
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function formatHumanStaffAction(action: string): string {
  switch (action) {
    case "org_suspended":
      return "Suspended organization";
    case "org_reinstated":
      return "Reinstated organization";
    case "user_deactivated":
      return "Deactivated user";
    case "user_reactivated":
      return "Reactivated user";
    default:
      return action;
  }
}
