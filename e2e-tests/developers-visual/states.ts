/**
 * Every visual-parity state of PLAN.md Appendix B, as data.
 *
 * - `id` is the baseline file stem (`baselines/roboto/<id>-visual-<width>.png`). Reference-page ids
 *   match REFERENCE_SPEC.md §6 so the research screenshots can be found; the page-type ids (P01…)
 *   are new.
 * - `widths` are the widths the state is captured and compared at. A width left out is listed in
 *   `excluded` with the reason (I-2).
 * - `regions` are compared in gate 3 (cropped to the screenshot); `masks` are dynamic content
 *   masked on both sides (default: all of DEFAULT_MASKS, each a no-op where nothing matches).
 *   Registered deviations live in deviations.ts, not here.
 * - `recipe` runs after the adapter has navigated to `path` (`adapter.goto(path)` is done by the
 *   runner). It frames the viewport itself; recipes never sleep.
 */
import type { Recipe } from './adapter.ts';
import type { MaskId, RegionId } from './regions.ts';

export const WIDTHS = [1440, 1280, 1024, 768, 390] as const;
export type Width = (typeof WIDTHS)[number];

export const VIEWPORTS: Record<Width, { width: number; height: number }> = {
  1440: { width: 1440, height: 900 },
  1280: { width: 1280, height: 800 },
  1024: { width: 1024, height: 768 },
  768: { width: 768, height: 1024 },
  390: { width: 390, height: 844 },
};

export interface VisualState {
  id: string;
  /** Row of PLAN.md Appendix B. */
  appendix: string;
  title: string;
  path: string;
  widths: readonly Width[];
  excluded?: Partial<Record<Width, string>>;
  fullPage?: boolean;
  regions: readonly RegionId[];
  masks?: readonly MaskId[];
  recipe: Recipe;
  notes?: string;
}

const ALL: readonly Width[] = WIDTHS;
const DESKTOP: readonly Width[] = [1440, 1280, 1024];
const MOBILE: readonly Width[] = [768, 390];

const NO_SIDEBAR_BELOW_769 = 'At 768 and below the sidebar is not shown; it opens from the mobile sub-nav (R39).';
const desktopOnly = (reason: string): Partial<Record<Width, string>> => ({ 768: reason, 390: reason });
const mobileOnly = (reason: string): Partial<Record<Width, string>> => ({ 1440: reason, 1280: reason, 1024: reason });

const V3 = '/reference/get-v3-texts';
const FIND_REFS = '/reference/post-find-refs';
const CALENDARS = '/reference/get-calendars';

const REF_REGIONS: readonly RegionId[] = [
  'header',
  'sidebar',
  'headline',
  'recentRequests',
  'paramCard',
  'languagePicker',
  'requestCard',
  'responseCard',
];
const DOC_REGIONS: readonly RegionId[] = ['header', 'sidebar', 'headline', 'article', 'docsToc'];

/** Recipe helpers shared by several states. */
const nothing: Recipe = async () => {};
const genesis: Recipe = async (a) => {
  await a.fillParam('tref', 'Genesis 1:1');
  await a.scrollToTop();
};
const tryGenesis: Recipe = async (a) => {
  await genesis(a);
  await a.runTryIt({ fixture: 'v3-genesis-200' });
  await a.scrollToTop();
};
const tryNotabook: Recipe = async (a) => {
  await a.fillParam('tref', 'Notabook 99');
  await a.runTryIt({ fixture: 'v3-notabook-404' });
  await a.scrollToTop();
};
const findRefsFilled: Recipe = async (a) => {
  await a.expandBodyParam('text');
  await a.fillParam('text_body', 'See Genesis 1:1 and Exodus 2:3.');
  await a.fillParam('text_title', 'Test');
  await a.selectParamOption('lang', 'en');
};

export const STATES: readonly VisualState[] = [
  // ------------------------------------------------------------------ API reference: get-v3-texts
  {
    id: 'v3_default',
    appendix: 'R01',
    title: 'get-v3-texts, first viewport',
    path: V3,
    widths: ALL,
    regions: REF_REGIONS,
    recipe: nothing,
  },
  {
    id: 'v3_default_full',
    appendix: 'R01',
    title: 'get-v3-texts, full page',
    path: V3,
    widths: ALL,
    fullPage: true,
    regions: [...REF_REGIONS, 'responseAccordion', 'pageFooter'],
    recipe: nothing,
  },
  {
    id: 'v3_schema_expanded',
    appendix: 'R02',
    title: '200 response schema expanded',
    path: V3,
    widths: ALL,
    regions: ['sidebar', 'responseAccordion', 'requestCard', 'responseCard'],
    recipe: async (a) => {
      await a.expandResponseSchema('200');
      await a.scrollToRegion('responseSection', { offset: 24 });
    },
    notes:
      'Live opens the 200 accordion on load (defaultExpandResponseSchema: true), so expandResponseSchema is a no-op there; the research screenshots agree (respPicker is 7348px tall in computed-get-v3-texts.json).',
  },
  {
    id: 'v3_schema_child_attributes',
    appendix: 'R03',
    title: 'Nested sub-cards, union select, TEXT ARRAY expander',
    path: V3,
    widths: ALL,
    regions: ['sidebar', 'responseAccordion'],
    recipe: async (a) => {
      await a.expandResponseSchema('200');
      await a.expandSchemaChildAttributes();
      await a.scrollToRegion('schemaArrayExpander', { offset: 16 });
    },
  },
  {
    id: 'v3_lang_node',
    appendix: 'R04',
    title: 'Node selected',
    path: V3,
    widths: ALL,
    regions: REF_REGIONS,
    recipe: async (a) => {
      await a.selectLanguage('node');
      await a.scrollToTop();
    },
  },
  {
    id: 'v3_lang_node_library_menu',
    appendix: 'R05',
    title: 'Node library menu',
    path: V3,
    widths: ALL,
    regions: ['languagePicker', 'requestCard', 'popover'],
    recipe: async (a) => {
      await a.selectLanguage('node');
      await a.scrollToRegion('languagePicker', { offset: 120 });
      await a.openLibraryMenu();
    },
  },
  {
    id: 'v3_more_languages_open',
    appendix: 'R06',
    title: 'More Languages menu',
    path: V3,
    widths: ALL,
    regions: ['languagePicker', 'popover'],
    recipe: async (a) => {
      await a.scrollToRegion('languagePicker', { offset: 120 });
      await a.openMoreLanguages();
    },
  },
  {
    id: 'v3_copy_page_menu_open',
    appendix: 'R07',
    title: 'Copy Page menu',
    path: V3,
    widths: ALL,
    regions: ['header', 'headline', 'popover'],
    recipe: async (a) => {
      await a.openCopyPageMenu();
    },
  },
  {
    id: 'v3_tags_tooltip',
    appendix: 'R08',
    title: 'Tags popover',
    path: V3,
    widths: ALL,
    regions: ['headline', 'popover'],
    recipe: async (a) => {
      await a.openTagsPopover();
    },
  },
  {
    id: 'v3_param_examples_combobox_open',
    appendix: 'R09',
    title: 'Example-value combobox of `version`',
    path: V3,
    widths: ALL,
    regions: ['paramCard', 'popover'],
    recipe: async (a) => {
      await a.scrollToRegion('queryParams', { offset: 360 });
      await a.openParamExamples('version');
    },
  },
  {
    id: 'v3_footer_feedback',
    appendix: 'R10',
    title: 'Page footer: Updated, prev/next, feedback',
    path: V3,
    widths: ALL,
    regions: ['pageFooter'],
    recipe: async (a) => {
      await a.scrollToRegion('pageFooter', { offset: 240 });
    },
    notes: 'D-7 does not apply on reference pages.',
  },
  {
    id: 'v3_feedback_yes_open',
    appendix: 'R11',
    title: 'Feedback popover after "Yes" (Vote is never clicked)',
    path: V3,
    widths: ALL,
    regions: ['pageFooter', 'popover'],
    recipe: async (a) => {
      await a.scrollToRegion('pageFooter', { offset: 240 });
      await a.openFeedback('yes');
    },
  },
  {
    id: 'v3_tryit_before_genesis',
    appendix: 'R12',
    title: 'tref = Genesis 1:1, before Try It',
    path: V3,
    widths: ALL,
    regions: REF_REGIONS,
    recipe: genesis,
  },
  {
    id: 'v3_tryit_loading',
    appendix: 'R13',
    title: 'Try It loading (recorded response held by the route handler)',
    path: V3,
    widths: ALL,
    regions: ['requestCard', 'responseCard'],
    recipe: async (a) => {
      await genesis(a);
      await a.runTryIt({ fixture: 'v3-genesis-200', hold: true });
      await a.scrollToTop();
    },
  },
  {
    id: 'v3_tryit_success',
    appendix: 'R14',
    title: 'Try It success (recorded 200)',
    path: V3,
    widths: ALL,
    regions: REF_REGIONS,
    recipe: tryGenesis,
  },
  {
    id: 'v3_tryit_button_hover',
    appendix: 'R15',
    title: 'Try It button hover',
    path: V3,
    widths: ALL,
    regions: ['requestCard'],
    recipe: async (a) => {
      await a.scrollToRegion('requestCard', { offset: 120 });
      await a.hoverTryIt();
    },
  },
  {
    id: 'v3_response_menu_open',
    appendix: 'R16',
    title: 'Response status dropdown after Try It',
    path: V3,
    widths: ALL,
    regions: ['responseCard', 'popover'],
    recipe: async (a) => {
      await tryGenesis(a);
      await a.scrollToRegion('responseCard', { offset: 120 });
      await a.openResponseMenu();
    },
  },
  {
    id: 'v3_response_example_menu',
    appendix: 'R17',
    title: 'Example dropdown before Try It',
    path: V3,
    widths: ALL,
    regions: ['responseCard', 'popover'],
    recipe: async (a) => {
      await a.scrollToRegion('responseCard', { offset: 120 });
      await a.openResponseExampleMenu();
    },
  },
  {
    id: 'v3_response_headers_modal',
    appendix: 'R18',
    title: 'Headers modal after Try It',
    path: V3,
    widths: ALL,
    regions: ['modal'],
    // Playwright paints masks above the modal; the time cell is behind the backdrop here.
    masks: ['updatedAgo', 'thirdPartyFrames'],
    recipe: async (a) => {
      await tryGenesis(a);
      await a.scrollToRegion('responseCard', { offset: 120 });
      await a.openResponseHeaders();
    },
  },
  {
    id: 'v3_tryit_error',
    appendix: 'R19',
    title: 'Try It error (recorded 404)',
    path: V3,
    widths: ALL,
    regions: REF_REGIONS,
    recipe: tryNotabook,
  },
  {
    id: 'v3_recent_requests_after_tryit',
    appendix: 'R20',
    title: 'Recent Requests after a 200',
    path: V3,
    widths: ALL,
    regions: ['recentRequests'],
    recipe: async (a) => {
      await tryGenesis(a);
      await a.scrollToRegion('recentRequests', { offset: 120 });
    },
  },
  {
    id: 'v3_recent_requests_after_error',
    appendix: 'R21',
    title: 'Recent Requests after a 404',
    path: V3,
    widths: ALL,
    regions: ['recentRequests'],
    recipe: async (a) => {
      await tryNotabook(a);
      await a.scrollToRegion('recentRequests', { offset: 120 });
    },
  },
  {
    id: 'v3_recent_request_row_selected',
    appendix: 'R22',
    title: 'Recent Requests row selected',
    path: V3,
    widths: ALL,
    regions: ['recentRequests', 'requestCard', 'responseCard'],
    recipe: async (a) => {
      await tryGenesis(a);
      await a.scrollToRegion('recentRequests', { offset: 120 });
      await a.selectRecentRequestRow(0);
    },
  },
  {
    id: 'v3_sidebar_collapsed',
    appendix: 'R23',
    title: 'Sidebar collapsed',
    path: V3,
    widths: DESKTOP,
    excluded: desktopOnly('No collapsible sidebar at 768 and below (the sidebar is not shown).'),
    regions: ['header', 'headline', 'paramCard', 'requestCard', 'responseCard'],
    recipe: async (a) => {
      await a.collapseSidebar();
    },
  },
  // ------------------------------------------------------------------ API reference: other pages
  {
    id: 'find_refs_default',
    appendix: 'R24',
    title: 'post-find-refs, first viewport',
    path: FIND_REFS,
    widths: ALL,
    regions: REF_REGIONS,
    recipe: nothing,
  },
  {
    id: 'find_refs_body_text_expanded',
    appendix: 'R25',
    title: 'post-find-refs, body param `text` expanded',
    path: FIND_REFS,
    widths: ALL,
    regions: ['paramCard', 'requestCard'],
    recipe: async (a) => {
      await a.expandBodyParam('text');
      await a.scrollToRegion('bodyParams', { offset: 120 });
    },
  },
  {
    id: 'find_refs_filled',
    appendix: 'R26',
    title: 'post-find-refs, body filled',
    path: FIND_REFS,
    widths: ALL,
    regions: ['paramCard', 'requestCard'],
    recipe: async (a) => {
      await findRefsFilled(a);
      await a.scrollToRegion('bodyParams', { offset: 120 });
    },
  },
  {
    id: 'find_refs_tryit_result',
    appendix: 'R27',
    title: 'post-find-refs, Try It → recorded 202',
    path: FIND_REFS,
    widths: ALL,
    regions: ['requestCard', 'responseCard', 'recentRequests'],
    recipe: async (a) => {
      await findRefsFilled(a);
      await a.runTryIt({ fixture: 'find-refs-202' });
      await a.scrollToRegion('requestCard', { offset: 120 });
    },
  },
  {
    id: 'calendars_default',
    appendix: 'R28',
    title: 'get-calendars, first viewport',
    path: CALENDARS,
    widths: ALL,
    regions: REF_REGIONS,
    recipe: nothing,
  },
  {
    id: 'calendars_enum_params',
    appendix: 'R29',
    title: 'get-calendars, enum params',
    path: CALENDARS,
    widths: ALL,
    regions: ['paramCard'],
    recipe: async (a) => {
      await a.scrollToRegion('queryParams', { offset: 24 });
    },
  },
  {
    id: 'calendars_enum_selected',
    appendix: 'R30',
    title: 'get-calendars, enum values selected',
    path: CALENDARS,
    widths: ALL,
    regions: ['paramCard', 'requestCard'],
    recipe: async (a) => {
      await a.selectParamOption('diaspora', '0');
      await a.selectParamOption('custom', 'sephardi');
      await a.scrollToRegion('queryParams', { offset: 24 });
    },
  },
  {
    id: 'img_gen_enum_params',
    appendix: 'R31',
    title: 'get-img-gen, enum params (lang, platform)',
    path: '/reference/get-img-gen',
    widths: ALL,
    regions: ['paramCard'],
    recipe: async (a) => {
      await a.scrollToRegion('queryParams', { offset: 24 });
    },
  },
  // ------------------------------------------------------------------ sidebar, search, header
  {
    id: 'sidebar_index_groups',
    appendix: 'R32',
    title: 'Both "Index" groups expanded',
    path: V3,
    widths: DESKTOP,
    excluded: desktopOnly(NO_SIDEBAR_BELOW_769),
    regions: ['sidebar'],
    recipe: async (a) => {
      await a.expandSidebarGroup('Index', 0);
      await a.expandSidebarGroup('Index', 1);
      await a.scrollToTop();
      await a.scrollSidebarTo('Index', 0);
    },
  },
  {
    id: 'sidebar_index1_group',
    appendix: 'R33',
    title: 'The second "Index" group (index-1) expanded',
    path: V3,
    widths: DESKTOP,
    excluded: desktopOnly(NO_SIDEBAR_BELOW_769),
    regions: ['sidebar'],
    recipe: async (a) => {
      await a.expandSidebarGroup('Index', 1);
      await a.scrollToTop();
      await a.scrollSidebarTo('Index', 1);
    },
  },
  {
    id: 'sidebar_filter_index',
    appendix: 'R34',
    title: 'Sidebar filtered by "index"',
    path: V3,
    widths: DESKTOP,
    excluded: desktopOnly(NO_SIDEBAR_BELOW_769),
    regions: ['sidebar'],
    recipe: async (a) => {
      await a.filterSidebar('index');
    },
  },
  {
    id: 'search_open',
    appendix: 'R35',
    title: 'Search modal open',
    path: V3,
    widths: ALL,
    regions: ['searchModal'],
    recipe: async (a) => {
      await a.openSearch();
    },
  },
  {
    id: 'search_results_texts',
    appendix: 'R36',
    title: 'Search results for "texts"',
    path: V3,
    widths: ALL,
    regions: ['searchModal'],
    recipe: async (a) => {
      await a.openSearch();
      await a.searchFor('texts');
    },
    notes: 'D-9: result order differs; only the modal frame, tabs and result-row layout are compared.',
  },
  {
    id: 'header_links_menu_open',
    appendix: 'R37',
    title: 'Header links menu open',
    path: V3,
    widths: DESKTOP,
    excluded: desktopOnly('Below 769 the links are in the mobile drawer (R38), not a menu.'),
    regions: ['header', 'popover'],
    recipe: async (a) => {
      await a.openLinksMenu();
    },
  },
  {
    id: 'mobile_nav_open',
    appendix: 'R38',
    title: 'Mobile navigation drawer',
    path: V3,
    widths: MOBILE,
    excluded: mobileOnly('The hamburger exists only at 768 and below.'),
    regions: ['mobileNav'],
    recipe: async (a) => {
      await a.openMobileNav();
    },
  },
  {
    id: 'mobile_subnav_sidebar_open',
    appendix: 'R39',
    title: 'Mobile sub-nav: sidebar as a floating panel',
    path: V3,
    widths: MOBILE,
    excluded: mobileOnly('The mobile sub-nav exists only at 768 and below.'),
    regions: ['header', 'mobileSubnavPanel'],
    recipe: async (a) => {
      await a.openMobileSubnav();
    },
  },
  {
    id: 'mobile_search_open',
    appendix: 'R40',
    title: 'Mobile search open',
    path: V3,
    widths: MOBILE,
    excluded: mobileOnly('The mobile search icon exists only at 768 and below (R35 covers desktop).'),
    regions: ['searchModal'],
    recipe: async (a) => {
      await a.openSearch();
    },
  },
  {
    id: 'v1_texts_deprecated_default',
    appendix: 'R41',
    title: 'Deprecated endpoint get-v1-texts, first viewport',
    path: '/reference/get-v1-texts',
    widths: ALL,
    regions: REF_REGIONS,
    recipe: nothing,
  },
  // ------------------------------------------------------------------ page types
  {
    id: 'docs_welcome',
    appendix: 'P01',
    title: '/docs/welcome (callout, plain page)',
    path: '/docs/welcome',
    widths: ALL,
    regions: DOC_REGIONS,
    recipe: nothing,
  },
  {
    id: 'docs_linker_v3',
    appendix: 'P02',
    title: '/docs/linker-v3, first viewport',
    path: '/docs/linker-v3',
    widths: ALL,
    regions: DOC_REGIONS,
    recipe: nothing,
  },
  {
    id: 'docs_linker_v3_full',
    appendix: 'P02',
    title: '/docs/linker-v3, full page',
    path: '/docs/linker-v3',
    widths: ALL,
    fullPage: true,
    regions: [...DOC_REGIONS, 'pageFooter'],
    recipe: nothing,
  },
  {
    id: 'docs_mcp_error_callout',
    appendix: 'P03',
    title: '/docs/the-sefaria-mcp (error callout)',
    path: '/docs/the-sefaria-mcp',
    widths: ALL,
    regions: ['article'],
    recipe: async (a) => {
      await a.scrollToRegion('callout', { offset: 160 });
    },
  },
  {
    id: 'docs_linker_api_code_tabs',
    appendix: 'P04',
    title: '/docs/linker-api (code tabs, table)',
    path: '/docs/linker-api',
    widths: ALL,
    regions: ['article'],
    recipe: async (a) => {
      await a.scrollToRegion('codeTabs', { offset: 160 });
    },
  },
  {
    id: 'docs_index_and_versions_table',
    appendix: 'P05',
    title: '/docs/index-and-versions (table)',
    path: '/docs/index-and-versions',
    widths: ALL,
    regions: ['article'],
    recipe: async (a) => {
      await a.scrollToRegion('table', { offset: 160 });
    },
  },
  {
    id: 'docs_disambiguator_image',
    appendix: 'P06',
    title: '/docs/the-disambiguator (framed image)',
    path: '/docs/the-disambiguator',
    widths: ALL,
    regions: ['article'],
    recipe: async (a) => {
      await a.scrollToRegion('lightboxImage', { offset: 120 });
    },
  },
  {
    id: 'docs_disambiguator_lightbox',
    appendix: 'P06',
    title: '/docs/the-disambiguator, lightbox open',
    path: '/docs/the-disambiguator',
    widths: ALL,
    regions: [],
    recipe: async (a) => {
      await a.scrollToRegion('lightboxImage', { offset: 120 });
      await a.openImageLightbox();
    },
  },
  {
    id: 'docs_pycon_embed',
    appendix: 'P07',
    title: '/docs/sefaria-research-at-pyconn-2024 (embed; frame content masked)',
    path: '/docs/sefaria-research-at-pyconn-2024',
    widths: ALL,
    regions: ['article'],
    recipe: async (a) => {
      await a.scrollToRegion('embed', { offset: 160 });
    },
  },
  {
    id: 'docs_powered_by_html_block',
    appendix: 'P08',
    title: '/docs/powered-by-sefaria (HTML block)',
    path: '/docs/powered-by-sefaria',
    widths: ALL,
    regions: ['header', 'sidebar', 'headline', 'htmlBlock'],
    recipe: nothing,
  },
  {
    id: 'docs_hebrew_citations_rtl',
    appendix: 'P09',
    title: 'Hebrew citation guide (RTL HTML block)',
    path: '/docs/' + encodeURIComponent('איך-ליצור-מראי-מקורות-להפניה'),
    widths: ALL,
    regions: ['header', 'sidebar', 'headline', 'htmlBlock'],
    recipe: nothing,
  },
  {
    id: 'ref_getting_started',
    appendix: 'P10',
    title: '/reference/getting-started (guide page in the reference section)',
    path: '/reference/getting-started',
    widths: ALL,
    regions: ['header', 'sidebar', 'headline', 'article'],
    recipe: nothing,
  },
  {
    id: 'page_contact_us',
    appendix: 'P11',
    title: '/page/contact-us (frame content masked)',
    path: '/page/contact-us',
    widths: ALL,
    regions: ['header', 'article'],
    recipe: nothing,
  },
  {
    id: 'home',
    appendix: 'P12',
    title: 'Homepage, first viewport (animations at their end state)',
    path: '/',
    widths: ALL,
    regions: ['header', 'homeHero'],
    recipe: async (a) => {
      await a.freezeAnimations();
    },
  },
  {
    id: 'home_full',
    appendix: 'P12',
    title: 'Homepage, full page (animations at their end state)',
    path: '/',
    widths: ALL,
    fullPage: true,
    regions: ['header', 'homeHero', 'homeFooter'],
    recipe: async (a) => {
      await a.freezeAnimations();
    },
  },
  {
    id: 'not_found',
    appendix: 'P13',
    title: 'The 404 page',
    path: '/docs/devportal-visual-parity-404',
    widths: ALL,
    regions: ['header', 'notFound'],
    notes: 'The "Maybe you were looking for one of these" suggestions come from live search for the slug.',
    recipe: nothing,
  },
  {
    id: 'docs_sidebar_nested',
    appendix: 'P14',
    title: 'Docs sidebar: nested Linker group open, deprecated item, link item',
    path: '/docs/linker-v3',
    widths: DESKTOP,
    excluded: desktopOnly(NO_SIDEBAR_BELOW_769),
    regions: ['sidebar'],
    recipe: async (a) => {
      await a.scrollSidebarTo('The Sefaria Linker');
    },
  },
  {
    id: 'docs_footer',
    appendix: 'P15',
    title: 'Docs page footer: Updated, prev/next, feedback',
    path: '/docs/linker-v3',
    widths: ALL,
    regions: ['pageFooter'],
    recipe: async (a) => {
      await a.scrollToRegion('pageFooter', { offset: 240 });
    },
  },
];

export function stateById(id: string): VisualState {
  const s = STATES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown state ${id}`);
  return s;
}

/** Every (state, width) pair that is captured and compared. */
export function stateWidthPairs(): { state: VisualState; width: Width }[] {
  return STATES.flatMap((state) => state.widths.map((width) => ({ state, width })));
}
