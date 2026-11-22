import { createFileRoute } from "@tanstack/react-router";
import { socialLoader } from "~/features/surfaces/social-route";
import { SurfacePage } from "~/features/surfaces/SurfaceMount";

/**
 * /social/*: every page under /social is the social surface's (a room's lobby, a shiur, its settings; one it does not know is its own
 * not-found page), mounted client-side into a sized placeholder while the `social` lab is on; the reader's not-found page while it
 * is off (src/features/surfaces/social-route.ts).
 *
 * @feature SHL-076 Social lab and /social routes
 */
export const Route = createFileRoute("/social/$")({
  loader: socialLoader,
  component: SurfacePage,
});
