// Public (meta) routes that do not require an active staff session.
export const PUBLIC_ROUTES = ["/login", "/staff-only"];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}
