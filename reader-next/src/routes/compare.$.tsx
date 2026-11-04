import { createFileRoute } from "@tanstack/react-router";
import { ComparePage } from "~/features/compare/ComparePage";
import { loadCompareRoute } from "~/features/compare/compare-route";

/** /compare/<ref>/<he|en>/<v1>/<v2>: the version-diff tool (sefaria/views.py compare). */
export const Route = createFileRoute("/compare/$")({
  loader: ({ context, location }) => loadCompareRoute(context.queryClient, location.pathname),
  // compare.html: "Compare", and no viewport meta (a phone lays the page out 980px wide, as it does any page without one)
  head: () => ({ meta: [{ title: "Compare" }, { name: "viewport", content: "width=980" }] }),
  component: function CompareRoute() {
    const { address } = Route.useLoaderData();
    return <ComparePage address={address} />;
  },
});
