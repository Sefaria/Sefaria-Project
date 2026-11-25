import { createFileRoute, notFound } from "@tanstack/react-router";
import { TranslationsRoute } from "~/features/library/TranslationsRoute";
import { CANONICAL_ORIGIN, SITE_ORIGIN, canonicalUrl } from "~/lib/config";
import { hebrewSiteOrigin } from "~/lib/routing/site-origins";
import { pageCanonicalOrigin } from "~/lib/routing/canonical";
import { ErrorState } from "~/ui/Feedback/Feedback";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { prefetchTranslationsPage, translationLanguage } from "~/lib/translations/translations-page";

/** Is this load a navigation inside the app (the loader runs in the browser), not the server's page? */
const inApp = () => typeof window !== "undefined";

/**
 * /translations/<lang>: texts available in one translation language. The languages Django accepts have a page however they are
 * reached; ISOMap's others (ro, tr — the sidebar links to them —, lad, jrb) only inside the app, as the old client: from the server
 * they are a 404 (passed to Django in the cluster, whose own 404 page answers, as before). The title and description are the old
 * page's, in that language.
 *
 * @feature RTE-011 Translations page URLs
 * @feature LIB-021 Translations page backend and SEO
 * @feature LIB-037 Sidebar module: Translations languages list
 */
export const Route = createFileRoute("/translations/$slug")({
  loader: async ({ context, params }) => {
    if (!translationLanguage(params.slug, inApp())) throw notFound();
    // the list in the server's page when the API answers quickly; otherwise the page does not wait for it (LIB-021)
    await prefetchTranslationsPage(context.queryClient, params.slug);
    return { canonicalOrigin: await pageCanonicalOrigin() };
  },
  head: ({ params, loaderData }) => {
    const language = translationLanguage(params.slug, inApp());
    if (!language) return {};
    // as sefaria.org's head for the page (VERIFIED 2026-11-04 for de, en, he): the language's title and description, the shared card
    const path = `/translations/${params.slug}`;
    // og:url and the language alternates are absolute (PUBLIC_CANONICAL_ORIGIN): SITE_ORIGIN is "" in the cluster; og:url names
    // this host's site (English or Hebrew), the alternates both
    const url = canonicalUrl(path, loaderData?.canonicalOrigin);
    const img = (platform: string) => `${SITE_ORIGIN}/api/img-gen${path}?lang=&platform=${platform}&ven=&vhe=`;
    return {
      meta: [
        { title: language.title },
        { property: "og:title", content: language.title },
        { name: "twitter:title", content: language.title },
        ...(language.desc
          ? [
              { name: "description", content: language.desc },
              { property: "og:description", content: language.desc },
              { name: "twitter:description", content: language.desc },
            ]
          : []),
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
      ],
    };
  },
  // local development only: in the cluster the 404 goes to Django, whose own "Page Not Found" answers
  notFoundComponent: () => (
    <ErrorState title={<InterfaceText en="Page Not Found" he="הדף לא נמצא" />}>
      <InterfaceText en="There is no translations page for that language." he="אין דף תרגומים לשפה זו." />
    </ErrorState>
  ),
  component: function Translations() {
    return <TranslationsRoute slug={Route.useParams().slug} />;
  },
});
