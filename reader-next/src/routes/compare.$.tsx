import { createFileRoute } from "@tanstack/react-router";
import { ComparePage } from "~/features/compare/ComparePage";
import { loadCompareRoute } from "~/features/compare/compare-route";

/** /compare/<ref>/<he|en>/<v1>/<v2>: the version-diff tool (sefaria/views.py compare). */
export const Route = createFileRoute("/compare/$")({
  loader: ({ context, location }) => loadCompareRoute(context.queryClient, location.pathname, location.href),
  // compare.html: "Compare", and no viewport meta (the root leaves it out on a standalone page: a phone lays the page out 980px wide)
  head: () => ({ meta: [{ title: "Compare" }] }),
  component: function CompareRoute() {
    const { address } = Route.useLoaderData();
    return <ComparePage address={address} />;
  },
});
