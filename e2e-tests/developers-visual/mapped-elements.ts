/**
 * Mapped elements for gates 1 and 2 (PLAN.md §6.1.4): the element keys of
 * `docs/dev-portal/research/reference/data/computed-get-v3-texts.json`, plus a few docs-page and
 * homepage keys, each with the selector that finds it on each side.
 *
 * The research file stores the keys and the measurements but not the selectors; the live selectors
 * below were re-derived against live (deploy 5.968.3) and checked against the research rects at
 * 1440×900 (see `capture/verify-mapped.ts`). An element that does not exist in a state is simply
 * absent from that state's metrics file; gate 1 and 2 only compare keys present on both sides.
 *
 * Local selectors are `[data-visual="<key>"]` by convention: the portal's components carry a
 * `data-visual` attribute on the element that corresponds to the live element. Until the
 * components exist, a missing local element fails gates 1 and 2 for that key, which is the point.
 */

/** Computed-style properties recorded per mapped element. `fontFamily` is recorded but exempt (D-1). */
export const STYLE_PROPS = [
  'display',
  'position',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'color',
  'backgroundColor',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'borderTopWidth',
  'borderTopStyle',
  'borderTopColor',
  'borderRightWidth',
  'borderRightStyle',
  'borderRightColor',
  'borderBottomWidth',
  'borderBottomStyle',
  'borderBottomColor',
  'borderLeftWidth',
  'borderLeftStyle',
  'borderLeftColor',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
  'boxShadow',
] as const;

export type StyleProp = (typeof STYLE_PROPS)[number];

/** Properties gate 1 compares (PLAN §6.1.4: size, weight, line height, color, background, padding, margin, border, radius). */
export const GATE1_PROPS: readonly StyleProp[] = STYLE_PROPS.filter(
  (p) => !['display', 'position', 'fontFamily', 'letterSpacing', 'textTransform', 'boxShadow'].includes(p)
);

export interface MappedElement {
  key: string;
  /** Live selector. The first match with a non-empty box is used. */
  live: string;
  /** Local selector (convention: `[data-visual="<key>"]`). */
  local: string;
  /** True when the key comes from computed-get-v3-texts.json. */
  research: boolean;
}

const m = (key: string, live: string, research = true): MappedElement => ({
  key,
  live,
  local: `[data-visual="${key}"]`,
  research,
});

export const MAPPED_ELEMENTS: readonly MappedElement[] = [
  // page
  m('html', 'html'),
  m('body', 'body'),
  // header
  m('header', 'header.rm-Header'),
  m('headerTop', '.rm-Header-top'),
  m('headerBottom', '.rm-Header-bottom'),
  m('logo', '.rm-Header-bottom .rm-Header-left_logo img.rm-Logo-img, .rm-Header-left_mobile .rm-Logo img'),
  m('navLink', 'nav[aria-label="Primary navigation"] a.rm-Header-bottom-link:not([aria-current])'),
  m('navLinkActive', 'nav[aria-label="Primary navigation"] a.rm-Header-bottom-link[aria-current="page"]'),
  m('topLink', 'a.rm-Header-top-link'),
  m('search', 'button.rm-SearchToggle'),
  m('moduleBtn', 'button[aria-label="Open links menu"]'),
  m('mobileSubnav', 'button[class*="MobileSubnav"]'),
  m('hamburger', 'button[aria-label="Toggle navigation menu"]'),
  // layout
  m('main', 'main#Explorer, main.rm-Guides, main'),
  // sidebar
  m('sidebar', 'nav.rm-Sidebar[aria-label="Secondary navigation"]'),
  m('filter', 'nav.rm-Sidebar input[aria-label="Filter pages"]'),
  m('sbHeading', 'nav.rm-Sidebar .rm-Sidebar-heading'),
  m('sbGroup', 'nav.rm-Sidebar a.rm-Sidebar-link.Sidebar-link_parent'),
  m('sbLink', 'nav.rm-Sidebar a.rm-Sidebar-link.subpage:not(.active)'),
  m('sbActive', 'nav.rm-Sidebar a.rm-Sidebar-link.active'),
  m('badgeGetSb', 'nav.rm-Sidebar .rm-APIMethod.APIMethod_get'),
  m('badgePostSb', 'nav.rm-Sidebar .rm-APIMethod.APIMethod_post'),
  m('poweredBy', 'nav.rm-Sidebar #readmeLogo'),
  m('collapseBtn', 'button[aria-label="Hide sidebar navigation"]'),
  // article
  m('articleWrap', '[class*="SuperHubReference-article-wrapper"]'),
  m('article', 'article#content, article.rm-Article'),
  m('h1', 'h1.rm-PageHeader-title, header#content-head h1, .rm-Article h1'),
  m('badgeLg', '.rm-APIMethod.APIMethod_lg'),
  m('urlText', '[data-testid="serverurl"]'),
  m('copyPage', '.rm-AIDropdown'),
  m('excerpt', '.rm-Markdown[class*="excerpt"]'),
  m('excerptP', '.rm-Markdown[class*="excerpt"] p'),
  m('sectionHeader', '[class*="APISectionHeader-heading_title"]'),
  m('logsTable', '.rm-APILogsTable table'),
  m('logsTh', '.rm-APILogsTable th'),
  m('paramContainer', '.rm-ParamContainer'),
  m('paramName', '.rm-ParamContainer [class*="Param-name"]'),
  m('paramType', '.rm-ParamContainer [class*="Param-type"]'),
  m('paramRequired', '.rm-ParamContainer [class*="Param-required"]'),
  m('paramDefault', '.rm-ParamContainer [class*="Param-default"]'),
  m('paramDesc', '.rm-ParamContainer [class*="Param-description"] .rm-Markdown'),
  m('paramInput', '.rm-ParamContainer input.Input'),
  m('paramSelect', '.rm-ParamContainer select'),
  m('enumChip', '.rm-ParamContainer button[class*="Param-enum-section-item"]'),
  m('inlineCode', '.rm-ParamContainer .field-description code'),
  m('respPicker', '.rm-APIResponseSchemaPicker'),
  m('respToggle', '.rm-APIResponseSchemaPicker h1 > button'),
  m('statusChit', '.rm-APIResponseSchemaPicker .HTTPStatus-chit'),
  m('updated', '.UpdatedAt .DateLine'),
  m('pagination', 'nav.rm-Pagination'),
  m('pageLink', 'nav.rm-Pagination a'),
  m('thumbs', '[class*="PageThumbs"]:not(button)'),
  m('thumbBtn', 'button.PageThumbs-button'),
  // playground
  m('playground', '#ReferencePlayground'),
  m('langHeader', '#ReferencePlayground .rm-APISectionHeader [class*="APISectionHeader-heading"]'),
  m('langBtn', '.rm-LanguageButton:not(.rm-LanguageButton_active)'),
  m('langBtnActive', '.rm-LanguageButton.rm-LanguageButton_active'),
  m('langMore', 'button.rm-LanguageButton-more'),
  m('reqCard', '.rm-PlaygroundRequest'),
  m('codeLine', '.rm-PlaygroundRequest .CodeMirror-line'),
  m('tryIt', 'button.rm-TryIt'),
  m('respCard', '.rm-PlaygroundResponse'),
  m('respCode', '.rm-PlaygroundResponse .CodeMirror-line'),
  // docs pages (not in the research file)
  m('docBody', '.rm-Article .rm-Markdown.markdown-body', false),
  m('docP', '.rm-Article .rm-Markdown > p', false),
  m('docH2', '.rm-Article .rm-Markdown h2', false),
  m('docCallout', '.rm-Article .callout', false),
  m('docTable', '.rm-Article .rdmd-table table', false),
  m('docCodeTabs', '.rm-Article .CodeTabs', false),
  m('docCode', '.rm-Article pre code', false),
  m('docToc', '.rm-Toc, nav.rm-Toc', false),
];
