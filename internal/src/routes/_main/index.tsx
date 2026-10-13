import { createFileRoute, redirect } from "@tanstack/react-router";

// `/` redirects straight to `/orgs` (staff home screen).
export const Route = createFileRoute("/_main/")({
  beforeLoad: () => {
    throw redirect({ to: "/orgs" });
  },
});
