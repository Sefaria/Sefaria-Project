import { createFileRoute } from "@tanstack/react-router";
import { CalendarsRoute } from "~/features/calendars/CalendarsRoute";
import { textualCustomQuery } from "~/features/calendars/textual-custom";
import { viewerQuery } from "~/features/auth/viewer";
import { CANONICAL_ORIGIN, SITE_ORIGIN, canonicalUrl } from "~/lib/config";
import { hebrewSiteOrigin } from "~/lib/routing/site-origins";
import { pageCanonicalOrigin } from "~/lib/routing/canonical";
import { calendarsQueryOptions } from "~/lib/library/calendars";

const TITLE = "Learning Schedules | Sefaria Library";
const DESCRIPTION = "Weekly Torah portions, Daf Yomi, and other schedules for Torah learning.";

/** /calendars (and /calendars/, a page of its own on sefaria.org): Learning Schedules. */
export const Route = createFileRoute("/calendars")({
  loader: async ({ context, location }) => {
    const qc = context.queryClient;
    const viewer = await qc.ensureQueryData(viewerQuery).catch(() => null);
    const custom = await qc.ensureQueryData(textualCustomQuery(viewer?.profileUrl));
    await qc.ensureQueryData(calendarsQueryOptions(context.diaspora, custom));
    // the canonical is the address as asked: sefaria.org's /calendars/ says ".../calendars/"; on the Hebrew site's host, .org.il's
    return { path: location.pathname, canonicalOrigin: await pageCanonicalOrigin() };
  },
  head: ({ loaderData }) => {
    const path = loaderData?.path ?? "/calendars";
    // canonical, og:url and the language alternates are absolute (PUBLIC_CANONICAL_ORIGIN): SITE_ORIGIN is "" in the cluster;
    // canonical and og:url name this host's site (English or Hebrew), the alternates both
    const url = canonicalUrl(path, loaderData?.canonicalOrigin);
    const img = (platform: string) => `${SITE_ORIGIN}/api/img-gen/calendars?lang=&platform=${platform}&ven=&vhe=`;
    // as sefaria.org's head for the page (VERIFIED 2026-11-04), whatever the interface language
    return {
      meta: [
        { title: TITLE },
        { name: "description", content: DESCRIPTION },
        { property: "og:title", content: TITLE },
        { name: "twitter:title", content: TITLE },
        { property: "og:description", content: DESCRIPTION },
        { name: "twitter:description", content: DESCRIPTION },
        { property: "og:type", content: "website" },
        { property: "og:image", content: img("facebook") },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:site", content: "@sefariaproject" },
        { name: "twitter:image", content: img("twitter") },
      ],
      links: [
        { rel: "alternate", href: canonicalUrl(path), hrefLang: "en" },
        { rel: "alternate", href: canonicalUrl(path, hebrewSiteOrigin(CANONICAL_ORIGIN)), hrefLang: "he" },
        { rel: "canonical", href: url },
      ],
    };
  },
  component: CalendarsRoute,
});
