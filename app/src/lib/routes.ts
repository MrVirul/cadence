// Public (meta) routes that do not require authentication.
// Matches "/login", "/signup", and "/invite/<token>" exactly.
export const PUBLIC_ROUTES = ["/login", "/signup", "/invite"] as const;

export function isPublicRoute(pathname: string): boolean {
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalized === "/login" || normalized === "/signup") {
    return true;
  }
  return /^\/invite\/[^/]+$/.test(normalized);
}

// Accepts only same-site paths starting with a single "/" and not starting with
// "//" or containing "://"; otherwise returns "/".
export function sanitizeRedirectPath(redirect?: string | null): string {
  if (
    typeof redirect === "string" &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//") &&
    !redirect.includes("://")
  ) {
    return redirect;
  }
  return "/";
}

const LAST_ORG_STORAGE_KEY = "cadence_last_org";

export function getLastUsedOrgId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(LAST_ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLastUsedOrgId(orgId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(LAST_ORG_STORAGE_KEY, orgId);
  } catch {
    // Ignore storage quota/privacy errors
  }
}
