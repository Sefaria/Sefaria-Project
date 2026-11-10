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
import { STATIC_PAGES, type StaticPageOwner } from "./pages";
import { remToPx } from "./rem-to-px";
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
/* sefaria.org's header is fixed over the page (60px, header.css) and the page starts at the top of the window under it: its first
   block clears the header with its own space (.staticPageHeader's margin-top: 60px, #aboutSidebar's 120px…). Here the header is in
   the flow and the page starts below it, so the content goes up by the header's height and its first 60px sit under the header, as
   there (parity S12: every static page was 60px lower). The header paints over it (SiteHeader: position relative, z-index). With the
   attribute, so the legacy "body { margin: 0 }" (s2.css, scoped to the wrapper below) does not undo it. */
#staticContentWrapper[data-static-page] {
  margin-top: -60px;
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

/**
 * The font families the shell declares itself (src/ui/tokens/fonts.css; legacy-css.test.ts checks the list against that file): their
 * legacy @font-face rules are dropped, from the legacy stylesheets and from a page's own CSS.
 */
export const SHELL_FONT_FAMILIES: ReadonlySet<string> = new Set(["cardo", "noto color emoji", "taamey frank"]);

/** The font families a stylesheet declares with @font-face (lower case): for the shell's own src/ui/tokens/fonts.css. */
export function declaredFontFamilies(css: string): Set<string> {
  return new Set([...css.matchAll(/@font-face\s*\{([^}]*)\}/gi)].map((m) => fontFaceFamily(m[1]!)).filter(Boolean));
}

/**
 * The whole stylesheet: the body defaults, then each legacy stylesheet scoped (`read` gives a file's text by its path under static/),
 * without the @font-face rules of the families the shell declares itself (`shellFonts`: src/ui/tokens/fonts.css — Taamey Frank,
 * Cardo, Noto Color Emoji), which on a static page would otherwise replace the shell's faces with the old files.
 */
export function buildLegacyStaticCss(read: (path: string) => string, shellFonts: ReadonlySet<string> = SHELL_FONT_FAMILIES, readTemplate?: (path: string) => string | null): string {
  return [
    LEGACY_BODY_DEFAULTS,
    ...LEGACY_SOURCES.map((path) => `/* static/${path} */\n${scopeCss(read(path), STATIC_SCOPE, { baseUrl: `/static/${path}`, dropFontFaces: shellFonts })}`),
    ...(readTemplate ? [buildStaticPageCss(readTemplate, shellFonts)] : []),
  ]
    .filter(Boolean)
    .join("\n");
}

/** A template's `{% block css %}…{% endblock %}` (plain CSS in every static template today), or "" when it has none. */
export function templateCssBlock(template: string): string {
  const m = /\{%\s*block\s+css\s*%\}([\s\S]*?)\{%\s*endblock(?:\s+css)?\s*%\}/.exec(template);
  const css = (m?.[1] ?? "").trim();
  if (/\{[%{]/.test(css)) throw new Error("a static page's {% block css %} uses template tags: build it by hand");
  return css;
}

/** The template each rendered static page comes from, and the scope its CSS applies to (only that page, in that language). */
export function staticPageCssSources(pages: Readonly<Record<string, { owner: StaticPageOwner; byLang?: boolean; enOwner?: StaticPageOwner }>> = STATIC_PAGES) {
  const out: { template: string; scope: string }[] = [];
  for (const [page, e] of Object.entries(pages)) {
    const scope = `${STATIC_SCOPE}[data-static-page="${page}"]`;
    if (!e.byLang) {
      if (e.owner === "content" || (e.enOwner === "content")) out.push({ template: `static/${page}.html`, scope });
      continue;
    }
    if ((e.enOwner ?? e.owner) === "content") out.push({ template: `static/en/${page}.html`, scope: `${scope}[dir="ltr"]` });
    if (e.owner === "content") out.push({ template: `static/he/${page}.html`, scope: `${scope}[dir="rtl"]` });
  }
  return out;
}

/**
 * The rendered static pages' own `{% block css %}`, from the repository's templates (`readTemplate` gives a file under templates/, or
 * null when there is none), each scoped to its page alone. Built here, at build time, into the static stylesheet: the CSS Django
 * sends with a page at request time is never used (owner, 2026-11-10; content.ts pageInlineCss). On the old page these came after the
 * shared stylesheets and won; appended after them here, with a more specific scope, they still do.
 */
export function buildStaticPageCss(readTemplate: (path: string) => string | null, shellFonts: ReadonlySet<string> = SHELL_FONT_FAMILIES): string {
  return staticPageCssSources()
    .map(({ template, scope }) => {
      const source = readTemplate(template);
      const css = source === null ? "" : templateCssBlock(source);
      return css ? `/* templates/${template} */\n${scopeCss(remToPx(css), scope, { dropFontFaces: shellFonts })}` : "";
    })
    .filter(Boolean)
    .join("\n");
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
