/**
 * Comparison regions, framing anchors and masks, with the selector of each on each side.
 *
 * Regions (gate 3, PLAN.md §6.1.4) are cropped from the state's screenshot by the region's box on
 * that side. A region's box is its first visible match (`pick: 'first'`) or the bounding box of all
 * visible matches (`pick: 'union'`). Anchors only frame a state (`scrollToRegion`) and are never
 * compared; they share the table because the local adapter needs the same ids.
 *
 * Local selectors follow one convention, `[data-visual-region="<id>"]` and
 * `[data-visual-mask="<id>"]`, so the portal's components only need an attribute, not a
 * particular class structure (requested of the Integrator; see README).
 */

export const REGION_IDS = [
  // compared regions (PLAN §6.1.4 gate 3)
  'header',
  'sidebar',
  'headline',
  'recentRequests',
  'paramCard',
  'responseAccordion',
  'requestCard',
  'responseCard',
  'languagePicker',
  'pageFooter',
  'popover',
  'modal',
  'searchModal',
  'mobileNav',
  'mobileSubnavPanel',
  'article',
  'docsToc',
  'htmlBlock',
  'homeHero',
  'homeFooter',
  'notFound',
  // framing anchors
  'pathParams',
  'queryParams',
  'bodyParams',
  'responseSection',
  'schemaArrayExpander',
  'lightboxImage',
  'embed',
  'callout',
  'codeTabs',
  'table',
] as const;

export type RegionId = (typeof REGION_IDS)[number];

export interface RegionDef {
  id: RegionId;
  /** Human name used in PX entries. */
  name: string;
  /** Compared in gate 3 when a state lists it (false for framing anchors). */
  compared: boolean;
  pick: 'first' | 'union';
  live: string;
  local: string;
}

const region = (
  id: RegionId,
  name: string,
  live: string,
  opts: { compared?: boolean; pick?: 'first' | 'union' } = {}
): RegionDef => ({
  id,
  name,
  compared: opts.compared ?? true,
  pick: opts.pick ?? 'first',
  live,
  local: `[data-visual-region="${id}"]`,
});
const anchor = (id: RegionId, name: string, live: string) => region(id, name, live, { compared: false });

export const REGIONS: Record<RegionId, RegionDef> = Object.fromEntries(
  [
    region('header', 'header', 'header.rm-Header'),
    region('sidebar', 'sidebar', 'nav.rm-Sidebar[aria-label="Secondary navigation"], nav#hub-sidebar.rm-Sidebar'),
    region('headline', 'headline', 'header[class*="headline-container"], header#content-head, header.rm-PageHeader'),
    region('recentRequests', 'recent requests', '.Reference-section:has(.rm-APILogsTable)'),
    region('paramCard', 'parameter card', '.rm-ParamContainer'),
    region('responseAccordion', 'response accordion', '.rm-APIResponseSchemaPicker'),
    region('requestCard', 'request card', '.rm-PlaygroundRequest'),
    region('responseCard', 'response card', '.rm-PlaygroundResponse'),
    region('languagePicker', 'language picker', '.rm-LanguagePicker'),
    region('pageFooter', 'page footer', '.UpdatedAt, nav.rm-Pagination, .rm-PageThumbs', { pick: 'union' }),
    region('popover', 'open menu', '.tippy-box:has(.Dropdown-content_opened)'),
    region('modal', 'modal', 'section[role="dialog"][class*="Modal_open"]'),
    region('searchModal', 'search modal', '.rm-SearchModal.show-modal [class*="SuperHubSearch"]'),
    region('mobileNav', 'mobile navigation drawer', '[data-testid="flyout"]'),
    region('mobileSubnavPanel', 'mobile sidebar panel', 'nav.rm-Sidebar'),
    region(
      'article',
      'article',
      'article#content, article.rm-Article, main.rm-CustomPage [class*="SuperHubCustomPage-content"], main.rm-Guides, main'
    ),
    region('docsToc', 'table of contents', '.content-toc.rm-Aside'),
    region('htmlBlock', 'HTML block', '.rm-Article .rdmd-html'),
    region('homeHero', 'homepage hero', '.rm-LandingPage .hero-section'),
    region('homeFooter', 'homepage footer', '.rm-LandingPage .footer-section'),
    region('notFound', '404 message', '[class*="PageNotFound-title"], [class*="PageNotFound-suggestions"]', {
      pick: 'union',
    }),
    anchor('pathParams', 'path params', '#path-params'),
    anchor('queryParams', 'query params', '#query-params'),
    anchor('bodyParams', 'body params', '#body-params'),
    anchor('responseSection', 'response section', '#response-schemas'),
    anchor(
      'schemaArrayExpander',
      'schema array expander',
      '.rm-APIResponseSchemaPicker section[class*="Param-expand"]:has(> button[aria-expanded="true"])'
    ),
    anchor('lightboxImage', 'framed image', '.rm-Article .markdown-body img.img, .rm-Article .markdown-body img'),
    anchor('embed', 'embed', '.rm-Article .embed'),
    anchor('callout', 'callout', '.rm-Article .callout'),
    anchor('codeTabs', 'code tabs', '.rm-Article .CodeTabs'),
    anchor('table', 'table', '.rm-Article .rdmd-table, .rm-Article table'),
  ].map((r) => [r.id, r])
) as Record<RegionId, RegionDef>;

export const MASK_IDS = ['updatedAgo', 'recentRequestsTime', 'thirdPartyFrames', 'notFoundSuggestions'] as const;
export type MaskId = (typeof MASK_IDS)[number];

export interface MaskDef {
  id: MaskId;
  reason: string;
  live: string;
  local: string;
}

/** Dynamic content, masked identically on both sides (PLAN §6.1.4, last paragraph). */
export const MASKS: Record<MaskId, MaskDef> = {
  updatedAgo: {
    id: 'updatedAgo',
    reason: '"Updated N ago" is relative to the capture date',
    live: '.UpdatedAt .DateLine',
    local: '[data-visual-mask="updatedAgo"]',
  },
  recentRequestsTime: {
    id: 'recentRequestsTime',
    reason: 'The time cell of Recent Requests ("Less than a minute ago")',
    live: '.rm-APILogsTable tbody tr td:first-child .DateLine',
    local: '[data-visual-mask="recentRequestsTime"]',
  },
  thirdPartyFrames: {
    id: 'thirdPartyFrames',
    reason: 'Third-party frames (YouTube via Embedly, the contact form) load content we do not control',
    live: 'iframe',
    local: 'iframe',
  },
  notFoundSuggestions: {
    id: 'notFoundSuggestions',
    // Added by W15; confirmed by the Integrator (PLAN §6.1.4, dynamic content): live picks the suggestions at
    // random on each load, so the whole suggestion list is masked on both sides (the portal marks its <ul>; the
    // baseline holds live's item boxes) and the not_found state compares its notFound region only down to the
    // list (states.ts `cropRegionsAtMask`). The title and the prompt are compared.
    reason: 'The 404 page\'s "Maybe you were looking for one of these" links are chosen at random per load',
    live: '[class*="PageNotFound-suggestions-item"]',
    local: '[data-visual-mask="notFoundSuggestions"]',
  },
};

/** Masks applied to every state (each is a no-op where nothing matches). */
export const DEFAULT_MASKS: readonly MaskId[] = MASK_IDS;

/** Colour painted over masked rectangles, on both sides (Playwright's default mask colour). */
export const MASK_COLOR = '#FF00FF';
