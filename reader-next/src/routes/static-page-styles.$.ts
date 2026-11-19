import { createFileRoute } from "@tanstack/react-router";
import { staticPageStylesResponse } from "~/lib/static-page/styles-response";

/**
 * /static-page-styles/legacy.<hash>.css: the old site's static-page stylesheets scoped to the static page's wrapper
 * (lib/static-page/legacy-css.ts), for the static-page route's head. Immutable at its hashed address.
 */
export const Route = createFileRoute("/static-page-styles/$")({
  server: {
    handlers: {
      GET: ({ params }: { params: { _splat?: string } }) => staticPageStylesResponse(params._splat ?? ""),
    },
  },
});
