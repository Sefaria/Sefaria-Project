import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { StaticPageRoute } from "~/features/static-page/StaticPageRoute";
import { preloadStylesheets } from "~/features/static-page/preload-css";
import { CANONICAL_ORIGIN, SITE_ORIGIN, canonicalUrl } from "~/lib/config";
import { hebrewSiteOrigin } from "~/lib/routing/site-origins";
import { pageCanonicalOrigin } from "~/lib/routing/canonical";
import { loadStaticPage } from "~/lib/static-page/load";
import { rendersStaticPage, staticPageOwner } from "~/lib/static-page/pages";
import { LEGACY_STATIC_CSS_HREF } from "~/lib/static-page/styles-response";

/**
 * The static information pages (/about, /terms, /privacy-policy, /linker, /ways-to-give…: lib/static-page/pages.ts), one route for all
 * of them (LAUNCH_PLAN T-F31, D-5). Only a name of the list matches (`params.parse` turns every other single-segment address away, so
 * `/Genesis` is still the reader's); the router ranks this above the reader's `$` catch-all.
 *
 * Django's content block, title, description and stylesheets are fetched on the server, in the interface language, and rendered in this
 * client's shell (features/static-page); the ports (/mobile, /educators, the English /ways-to-give) render their own markup in the same
 * frame. A page Django does not have is this client's 404; a Django without the content mode (an older deploy) is handed to Django: from the
 * server by answering 404 (src/server/site-routing.ts then serves Django's page), in the app by loading the page in full.
 *
 * @feature STA-001 Static content pages
 * @feature STA-005 Static page serving and About sidebar
 * @feature STA-007 Terms and privacy policy
 */
export const Route = createFileRoute("/$page")({
  params: {
    // not a page of the list: no match here (the router goes on to the reader's `$`)
    parse: ({ page }: { page: string }) => (rendersStaticPage(page) ? { page } : (false as unknown as { page: string })),
    stringify: ({ page }: { page: string }) => ({ page }),
  },
  loader: async ({ params, context, location }) => {
    const lang = context.interfaceLang === "hebrew" ? ("he" as const) : ("en" as const);
    const owner = staticPageOwner(params.page, lang);
    const toDjango = () => {
      if (typeof window !== "undefined") throw redirect({ href: location.href, reloadDocument: true });
      throw notFound();
    };
    if (owner !== "content" && owner !== "port") return toDjango();
    const result = await loadStaticPage({ data: { page: params.page, lang } });
    if (result.kind === "missing") throw notFound();
    if (result.kind === "unsupported") return toDjango();
    await preloadStylesheets([LEGACY_STATIC_CSS_HREF, ...result.model.css]);
    return { model: result.model, owner, canonicalOrigin: await pageCanonicalOrigin() };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {};
    const { model } = loaderData;
    // as the old page's head (templates/base.html): its title and description, the shared card, the language alternates; and the
    // canonical address, which the old static pages did not have (PUBLIC_CANONICAL_ORIGIN, this host's site)
    const path = `/${params.page}`;
    const title = model.title || "Sefaria";
    const url = canonicalUrl(path, loaderData.canonicalOrigin);
    const img = (platform: string) => `${SITE_ORIGIN}/api/img-gen${path}?lang=&platform=${platform}&ven=&vhe=`;
    return {
      meta: [
        { title },
        { property: "og:title", content: title },
        { name: "twitter:title", content: title },
        ...(model.description
          ? [
              { name: "description", content: model.description },
              { property: "og:description", content: model.description },
              { name: "twitter:description", content: model.description },
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
        { rel: "canonical", href: url },
        { rel: "stylesheet", href: LEGACY_STATIC_CSS_HREF },
        ...model.css.map((href) => ({ rel: "stylesheet", href })),
      ],
    };
  },
  component: function StaticPageComponent() {
    const { model, owner } = Route.useLoaderData();
    return <StaticPageRoute model={model} owner={owner} />;
  },
});
