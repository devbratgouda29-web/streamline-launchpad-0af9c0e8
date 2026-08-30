import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Catch-all route: any unmatched URL is sent back to the Home dashboard
 * instead of rendering a dead-end / blank screen.
 */
export const Route = createFileRoute("/$")({
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true });
  },
  component: () => null,
});
