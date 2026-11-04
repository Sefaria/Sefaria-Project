import { createFileRoute } from "@tanstack/react-router";
import { ComparePage } from "~/features/compare/ComparePage";
import { loadCompareRoute } from "~/features/compare/compare-route";

/** /compare: the version-diff tool's empty form (sefaria/views.py compare). */
export const Route = createFileRoute("/compare/")({
  loader: ({ context, location }) => loadCompareRoute(context.queryClient, location.pathname),
  head: () => ({ meta: [{ title: "Compare" }, { name: "viewport", content: "width=980" }] }),
  component: function CompareIndexRoute() {
    const { address } = Route.useLoaderData();
    return <ComparePage address={address} />;
  },
});
