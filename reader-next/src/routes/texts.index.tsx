import { createFileRoute } from "@tanstack/react-router";
import { LibraryRoute } from "~/features/library/LibraryRoute";
import { calendarsQueryOptions } from "~/lib/library/calendars";
import { catalogSliceQueryOptions } from "~/lib/library/catalog-slice";

/** /texts: Browse the Library. */
export const Route = createFileRoute("/texts/")({
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(catalogSliceQueryOptions(context.queryClient, [])), context.queryClient.ensureQueryData(calendarsQueryOptions(context.diaspora)).catch(() => undefined)]);
  },
  head: () => ({ meta: [{ title: "Browse the Library | Sefaria Reader" }] }),
  component: () => <LibraryRoute path={[]} />,
});
