import { createFileRoute, redirect } from "@tanstack/react-router";
import { LibraryRoute } from "~/features/library/LibraryRoute";
import { catalogSliceQueryOptions } from "~/lib/library/catalog-slice";
import { calendarsQueryOptions } from "~/lib/library/calendars";
import { recentlyViewed } from "~/lib/library/recently-viewed";
import { viewerQuery } from "~/features/auth/viewer";
import { categoryMeta, libraryHomeMeta, pageUrls } from "~/lib/library/page-head";
import { CANONICAL_ORIGIN } from "~/lib/config";
import { hebrewSiteOrigin } from "~/lib/routing/site-origins";
import { pageCanonicalOrigin } from "~/lib/routing/canonical";

const pathOf = (splat: string | undefined) => (splat ?? "").split("/").filter(Boolean).map(decodeURIComponent);

/** /texts/Tanakh/Torah …: a category's page. */
export const Route = createFileRoute("/texts/$")({
  loader: async ({ context, params, location }) => {
    const path = pathOf(params._splat);
    // the old site's spelling
    // the router encodes the splat itself: encoding it here too made a permanent redirect to /texts/Tanakh/A%2520B (CODE_REVIEW R-28)
    if (path[0] === "Tanach") throw redirect({ to: "/texts/$", params: { _splat: ["Tanakh", ...path.slice(1).map((p) => p.replace(/\//g, "%2F"))].join("/") }, statusCode: 301 });
    const [tree] = await Promise.all([context.queryClient.ensureQueryData(catalogSliceQueryOptions(context.queryClient, path)), context.queryClient.ensureQueryData(calendarsQueryOptions(context.diaspora)).catch(() => undefined)]);
    // a path that names no category (/texts/history, where Django's /texts/recent redirects) is the library's home, titled as it
    const meta = categoryMeta(tree, path, context.interfaceLang);
    if (!meta) await recentlyViewed(context.queryClient, context.queryClient.ensureQueryData(viewerQuery)); // the home's Recently Viewed
    const urls = pageUrls(location.href, await pageCanonicalOrigin(), { english: CANONICAL_ORIGIN, hebrew: hebrewSiteOrigin(CANONICAL_ORIGIN) });
    return { path, meta: [...(meta ?? libraryHomeMeta(context.interfaceLang)), ...urls.meta], links: urls.links };
  },
  head: ({ loaderData }) => ({ meta: loaderData?.meta ?? [], links: loaderData?.links ?? [] }),
  component: function CategoryRoute() {
    const { path } = Route.useLoaderData();
    return <LibraryRoute path={path} />;
  },
});
