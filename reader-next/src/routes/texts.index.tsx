import { createFileRoute } from "@tanstack/react-router";
import { LibraryRoute } from "~/features/library/LibraryRoute";
import { calendarsQueryOptions } from "~/lib/library/calendars";
import { catalogSliceQueryOptions } from "~/lib/library/catalog-slice";
import { LIBRARY_HOME_TITLE } from "~/lib/library/category-model";

/** /texts: Browse the Library. */
export const Route = createFileRoute("/texts/")({
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(catalogSliceQueryOptions(context.queryClient, [])), context.queryClient.ensureQueryData(calendarsQueryOptions(context.diaspora)).catch(() => undefined)]);
  },
  head: () => ({ meta: [{ title: LIBRARY_HOME_TITLE }] }),
  component: () => <LibraryRoute path={[]} />,
});
