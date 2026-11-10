import { createFileRoute, redirect } from "@tanstack/react-router";
import { LibraryRoute } from "~/features/library/LibraryRoute";
import { catalogSliceQueryOptions } from "~/lib/library/catalog-slice";
import { calendarsQueryOptions } from "~/lib/library/calendars";
import { LIBRARY_HOME_TITLE, tocObjectByCategories, withDefaultCorpus } from "~/lib/library/category-model";

const pathOf = (splat: string | undefined) => (splat ?? "").split("/").filter(Boolean).map(decodeURIComponent);

/** /texts/Tanakh/Torah …: a category's page. */
export const Route = createFileRoute("/texts/$")({
  loader: async ({ context, params }) => {
    const path = pathOf(params._splat);
    // the old site's spelling
    // the router encodes the splat itself: encoding it here too made a permanent redirect to /texts/Tanakh/A%2520B (CODE_REVIEW R-28)
    if (path[0] === "Tanach") throw redirect({ to: "/texts/$", params: { _splat: ["Tanakh", ...path.slice(1).map((p) => p.replace(/\//g, "%2F"))].join("/") }, statusCode: 301 });
    const [tree] = await Promise.all([context.queryClient.ensureQueryData(catalogSliceQueryOptions(context.queryClient, path)), context.queryClient.ensureQueryData(calendarsQueryOptions(context.diaspora)).catch(() => undefined)]);
    // a path that names no category (/texts/history, where Django's /texts/recent redirects) is the library's home, titled as it
    return { path, known: !!tocObjectByCategories(tree, withDefaultCorpus(path)) };
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.known ? `${loaderData.path.at(-1)} | Sefaria Reader` : LIBRARY_HOME_TITLE }] }),
  component: function CategoryRoute() {
    const { path } = Route.useLoaderData();
    return <LibraryRoute path={path} />;
  },
});
