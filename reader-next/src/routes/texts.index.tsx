import { createFileRoute } from "@tanstack/react-router";
import { LibraryRoute } from "~/features/library/LibraryRoute";
import { calendarsQueryOptions } from "~/lib/library/calendars";
import { recentlyViewed } from "~/lib/library/recently-viewed";
import { viewerQuery } from "~/features/auth/viewer";
import { catalogSliceQueryOptions } from "~/lib/library/catalog-slice";
import { libraryHomeMeta, pageUrls } from "~/lib/library/page-head";
import { CANONICAL_ORIGIN } from "~/lib/config";
import { hebrewSiteOrigin } from "~/lib/routing/site-origins";
import { pageCanonicalOrigin } from "~/lib/routing/canonical";

/** /texts: Browse the Library. */
export const Route = createFileRoute("/texts/")({
  loader: async ({ context, location }) => {
    await Promise.all([context.queryClient.ensureQueryData(catalogSliceQueryOptions(context.queryClient, [])), context.queryClient.ensureQueryData(calendarsQueryOptions(context.diaspora)).catch(() => undefined), recentlyViewed(context.queryClient, context.queryClient.ensureQueryData(viewerQuery))]);
    return { urls: pageUrls(location.href, await pageCanonicalOrigin(), { english: CANONICAL_ORIGIN, hebrew: hebrewSiteOrigin(CANONICAL_ORIGIN) }) };
  },
  head: ({ match, loaderData }) => ({ meta: [...libraryHomeMeta((match.context as { interfaceLang?: "english" | "hebrew" }).interfaceLang ?? "english"), ...(loaderData?.urls.meta ?? [])], links: loaderData?.urls.links ?? [] }),
  component: () => <LibraryRoute path={[]} />,
});
