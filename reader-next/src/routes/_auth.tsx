import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthRoute } from "~/features/auth/AuthRoute";
import { viewerQuery } from "~/features/auth/viewer";
import { pathToFlow } from "~/lib/auth/utils";

/**
 * /login, /register and /password/reset/confirm/<uidb64>/<token>/ — the auth page (ACC-007). A signed-in reader asking for
 * /login or /register goes to "/" as Django's views do. Each child route sets Django's title.
 */
export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context, location }) => {
    if (pathToFlow(location.pathname) === "reset") return;
    const viewer = await context.queryClient.ensureQueryData(viewerQuery);
    if (viewer) throw redirect({ href: "/" });
  },
  component: AuthRoute,
});
