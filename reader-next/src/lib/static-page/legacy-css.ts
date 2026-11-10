/**
 * The legacy stylesheets a static page's content leans on (T-F31), scoped to `#staticContentWrapper` (scope-css.ts) so they style the
 * content block in this client's shell and nothing else — the header, the footer and the other pages never see them.
 *
 * What is in it: every stylesheet templates/base.html loads (the colour names, font stacks and font choice, the interface-language
 * rules, links, the shared static-page rules of common.css…) and static.css, in base.html's order, so the content is styled by the
 * same rules in the same order as on the old page; before them the browser defaults the legacy <body> had. Rules for `body`, `html`
 * and `:root` apply to the wrapper; `[data-active-module="library"]` (the theme) to the content, which carries it as on the old page.
 *
 * The reader's image is built from reader-next/ alone, so the copy is generated into legacy-css.gen.ts and checked against
 * static/ by legacy-css.test.ts (UPDATE_LEGACY_CSS=1 rewrites it). Served by src/routes/static-page-styles.$.ts.
 */
import { fontFaceFamily, scopeCss } from "./scope-css";

export const STATIC_SCOPE = "#staticContentWrapper";

/**
 * The legacy stylesheets, as paths under static/: templates/base.html's (reader/static_content.py BASE_CSS, in its order), then
 * static.css, which every static page lists.
 */
export const LEGACY_SOURCES = [
  "css/common.css",
  "font-awesome/css/font-awesome.css",
  "css/fonts.css",
  "css/header.css",
  "css/popover.css",
  "css/breakpoints.css",
  "css/keyboard.css",
  "css/font-faces.css",
  "css/color-palette.css",
  "css/themes/library-theme.css",
  "css/themes/sheets-theme.css",
  "css/common-components.css",
  "css/common-component.css",
  "css/auth.css",
  "css/s2.css",
  "css/cookies-notification.css",
  "css/library-assistant.css",
  "css/lexicon-edit.css",
  "css/unbounce-banner.css",
  "css/static.css",
] as const;

/**
 * Before them: what the legacy page's <body> had from the browser and this client's own base.css overrides (its font, size, line
 * height and colour; and box-sizing: base.css makes every box border-box, the legacy pages were laid out content-box). The legacy
 * stylesheets' own `body` rules (scoped to the wrapper) come after and win. And the one thing Django decided by the visitor's device.
 */
export const LEGACY_BODY_DEFAULTS = `#staticContentWrapper,
#staticContentWrapper *,
#staticContentWrapper *::before,
#staticContentWrapper *::after {
  box-sizing: content-box;
}
#staticContentWrapper {
  font-size: 16px;
  line-height: normal;
  color: #000;
  text-align: start;
}
/* the About pages leave their sidebar out for a phone (templates/static/*.html: {% if not request.user_agent.is_mobile %}); Django
   renders the content for a desktop, so a phone's width hides it here (the app's own About menu page is the sidebar itself) */
@media (max-width: 480px) {
  #staticContentWrapper:not([data-static-page="mobile-about-menu"]) #aboutSidebar {
    display: none;
  }
}
`;

/** The font families a stylesheet declares with @font-face (lower case): for the shell's own src/ui/tokens/fonts.css. */
export function declaredFontFamilies(css: string): Set<string> {
  return new Set([...css.matchAll(/@font-face\s*\{([^}]*)\}/gi)].map((m) => fontFaceFamily(m[1]!)).filter(Boolean));
}

/**
 * The whole stylesheet: the body defaults, then each legacy stylesheet scoped (`read` gives a file's text by its path under static/),
 * without the @font-face rules of the families the shell declares itself (`shellFonts`: src/ui/tokens/fonts.css — Taamey Frank,
 * Cardo, Noto Color Emoji), which on a static page would otherwise replace the shell's faces with the old files.
 */
export function buildLegacyStaticCss(read: (path: string) => string, shellFonts: ReadonlySet<string> = new Set()): string {
  return [
    LEGACY_BODY_DEFAULTS,
    ...LEGACY_SOURCES.map((path) => `/* static/${path} */\n${scopeCss(read(path), STATIC_SCOPE, { baseUrl: `/static/${path}`, dropFontFaces: shellFonts })}`),
  ].join("\n");
}

/** A short content hash (FNV-1a), for the stylesheet's address. */
export function cssHash(css: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < css.length; i++) {
    h ^= css.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
