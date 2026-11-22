import { createFileRoute } from "@tanstack/react-router";
import { socialLoader } from "~/features/surfaces/social-route";
import { SurfacePage } from "~/features/surfaces/SurfaceMount";

/**
 * /social: the social surface's home (its feed), mounted client-side into a sized placeholder while the `social` lab is on; the
 * reader's not-found page while it is off (src/features/surfaces/social-route.ts).
 *
 * @feature SHL-076 Social lab and /social routes
 */
export const Route = createFileRoute("/social/")({
  loader: socialLoader,
  component: SurfacePage,
});
