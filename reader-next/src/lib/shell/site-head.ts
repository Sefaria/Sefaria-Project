/**
 * What base.html puts in every Library page's head besides titles and scripts (VERIFIED on www.sefaria.org 2026-11-10, curl of /texts
 * and the Hebrew site's /texts): the OpenSearch descriptor, the app banner and home-screen meta, the Library's icons, the manifest and
 * the theme colour. The files themselves stay Django's (/static is passed through; /site.webmanifest reaches Django through the
 * 404 pass-through, reader_views.dynamic_manifest). Voices is out of scope: the Library's icons and colour only.
 *
 * @feature PLT-028 OpenSearch browser search integration
 * @feature PLT-017 Web manifest and favicons
 * @feature PLT-021 Module-specific favicons and app icons
 * @feature PLT-010 Other head and third-party script items
 */
import { SITE_ORIGIN } from "~/lib/config";

/** base.html's favicon_version. */
const FAVICON_VERSION = 3;
const iconAt = (siteOrigin: string, file: string) => `${siteOrigin}/static/icons/library/${file}?v=${FAVICON_VERSION}`;

/**
 * `siteOrigin`: where Django's pages are ("" in the cluster, same origin). The manifest is linked only then: a browser fetches it
 * from the page's own origin (a cross-origin manifest needs CORS, which www.sefaria.org does not send), and a dev server has none.
 */
export const siteHeadLinks = (siteOrigin: string = SITE_ORIGIN) => [
  { rel: "search", type: "application/opensearchdescription+xml", title: "Sefaria Search", href: `${siteOrigin}/static/files/opensearch.xml` },
  { rel: "shortcut icon", href: iconAt(siteOrigin, "favicon.ico"), sizes: "48x48" },
  { rel: "icon", type: "image/svg+xml", href: iconAt(siteOrigin, "favicon.svg"), sizes: "any" },
  { rel: "icon", type: "image/png", href: iconAt(siteOrigin, "favicon.png"), sizes: "96x96" },
  { rel: "apple-touch-icon", sizes: "180x180", href: iconAt(siteOrigin, "apple-touch-icon.png") },
  ...(siteOrigin ? [] : [{ rel: "manifest", href: `/site.webmanifest?v=${FAVICON_VERSION}` }]),
];

/** The app banner (Smart App Banner), home-screen title ("Library" / "ספרייה") and the Library's theme colour. */
export const siteHeadMeta = (hebrew: boolean) => [
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "apple-itunes-app", content: "app-id=1163273965" },
  { name: "theme-color", content: "#18345D" },
  { name: "apple-mobile-web-app-title", content: hebrew ? "ספרייה" : "Library" },
];
