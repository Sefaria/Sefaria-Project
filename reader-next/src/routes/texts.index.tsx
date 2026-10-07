import { createFileRoute } from "@tanstack/react-router";
import { LibraryRoute } from "~/features/library/LibraryRoute";
import { calendarsQueryOptions } from "~/lib/library/calendars";
import { tocQueryOptions } from "~/lib/catalog/toc";

/** /texts: Browse the Library. */
export const Route = createFileRoute("/texts/")({
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(tocQueryOptions()), context.queryClient.ensureQueryData(calendarsQueryOptions()).catch(() => undefined)]);
  },
  head: () => ({ meta: [{ title: "Browse the Library | Sefaria Reader" }] }),
  component: () => <LibraryRoute path={[]} />,
});
