import { createFileRoute } from "@tanstack/react-router";
import { LibraryRoute } from "~/features/library/LibraryRoute";
import { calendarsQueryOptions } from "~/lib/library/calendars";
import { recentlyViewed } from "~/lib/library/recently-viewed";
import { viewerQuery } from "~/features/auth/viewer";
import { catalogSliceQueryOptions } from "~/lib/library/catalog-slice";
import { libraryHomeMeta } from "~/lib/library/page-head";

/** /texts: Browse the Library. */
export const Route = createFileRoute("/texts/")({
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(catalogSliceQueryOptions(context.queryClient, [])), context.queryClient.ensureQueryData(calendarsQueryOptions(context.diaspora)).catch(() => undefined), recentlyViewed(context.queryClient, context.queryClient.ensureQueryData(viewerQuery))]);
  },
  head: ({ match }) => ({ meta: libraryHomeMeta((match.context as { interfaceLang?: "english" | "hebrew" }).interfaceLang ?? "english") }),
  component: () => <LibraryRoute path={[]} />,
});
