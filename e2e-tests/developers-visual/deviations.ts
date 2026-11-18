/**
 * Registered deviations (PLAN.md §6.1.5). This file is the only place a known difference between
 * live and the portal may be declared. D-1…D-12 are exactly the plan's initial entries; D-13 was added by the Integrator.
 *
 * An agent may add an entry only if it traces to the brief or to PLAN §1.3. Anything else goes to
 * the product owner, and every addition is the Integrator's decision, written into the PR
 * description (PLAN §4.5 rule 7).
 *
 * Treatments:
 * - `roboto-baseline`: handled by comparing against the Roboto baselines; nothing is masked.
 * - `mask`: the rectangles matched by `live` (on the baseline) and `local` (on the portal) are
 *   painted with the mask colour on BOTH images before gate 3, and mapped elements inside them
 *   are skipped by gates 1 and 2. A side with nothing to match uses `null`.
 * - `region-threshold`: the named region is compared with a different pixel limit.
 * - `exempt-regions`: the named regions skip gate 3 at the given widths; `alternative` names the
 *   assertion that replaces them.
 * - `mask-regions`: the named regions' boxes (the baseline's from its metrics, the portal's measured) are
 *   painted on both images and skip gate 3; gates 1 and 2 skip only the mapped elements lying wholly
 *   inside them, so elements outside (and the containers around them) are still checked.
 * - `split-region`: the region is not compared as one box; each named mapped element is compared as its
 *   own region instead (its box on each side from the metrics), so a deviation that moves one piece
 *   does not shift the others into failure.
 * - `excise`: local only. The rows of the portal's matches are cut out of the portal's screenshot, and
 *   the portal's boxes below move up by the same height, before the gates run: what live does not have
 *   neither shows nor shifts the rest. In a viewport state the baseline loses the same number of rows at
 *   its bottom so the sizes still match.
 */
import type { RegionId } from './regions.ts';
import type { Width } from './states.ts';

export type DeviationId =
  'D-1' | 'D-2' | 'D-3' | 'D-4' | 'D-5' | 'D-6' | 'D-7' | 'D-8' | 'D-9' | 'D-10' | 'D-11' | 'D-12' | 'D-13';

export type Treatment =
  | { kind: 'roboto-baseline' }
  | {
      kind: 'mask';
      live: string | null;
      local: string | null;
      /** Keep only the left N px of each live match (for marks drawn by pseudo-elements). */
      liveClipLeftPx?: number;
      /** Keep only the left N px of each local match. */
      localClipLeftPx?: number;
      /** Only the first N local matches (document order). */
      localFirst?: number;
    }
  | { kind: 'mask-regions'; regions: readonly RegionId[] }
  | { kind: 'split-region'; region: RegionId; elements: readonly string[] }
  | { kind: 'excise'; local: string }
  | { kind: 'region-threshold'; region: RegionId; maxDiffRatio: number }
  | {
      kind: 'exempt-regions';
      regions: readonly (RegionId | 'viewport')[];
      widths: readonly Width[];
      alternative: string;
    };

export interface Deviation {
  id: DeviationId;
  difference: string;
  source: string;
  /** State ids affected, or '*' for every state. */
  states: readonly string[] | '*';
  treatments: readonly Treatment[];
}

const REFERENCE_STATES_WITH_REQUEST_PANEL = [
  'v3_default',
  'v3_default_full',
  'v3_schema_expanded',
  'v3_schema_child_attributes',
  'v3_lang_node',
  'v3_lang_node_library_menu',
  'v3_more_languages_open',
  'v3_tryit_before_genesis',
  'v3_tryit_loading',
  'v3_tryit_success',
  'v3_tryit_button_hover',
  'v3_response_menu_open',
  'v3_response_example_menu',
  'v3_tryit_error',
  'v3_recent_request_row_selected',
  'v3_sidebar_collapsed',
  'find_refs_default',
  'find_refs_body_text_expanded',
  'find_refs_filled',
  'find_refs_tryit_result',
  'calendars_default',
  'calendars_enum_selected',
  'v1_texts_deprecated_default',
];

const RECENT_REQUESTS_STATES = [
  'v3_default',
  'v3_default_full',
  'v3_lang_node',
  'v3_tryit_before_genesis',
  'v3_tryit_success',
  'v3_tryit_error',
  'v3_recent_requests_after_tryit',
  'v3_recent_requests_after_error',
  'v3_recent_request_row_selected',
  'v3_sidebar_collapsed',
  'find_refs_default',
  'find_refs_tryit_result',
  'calendars_default',
  'v1_texts_deprecated_default',
];

const DOCS_PAGE_END_STATES = ['docs_linker_v3_full', 'docs_footer'];

export const DEVIATIONS: readonly Deviation[] = [
  {
    id: 'D-1',
    difference: 'Roboto and Heebo instead of the system font (handled by the Roboto baselines, not by masking)',
    source: 'Brief §4.3',
    states: '*',
    treatments: [{ kind: 'roboto-baseline' }],
  },
  {
    id: 'D-2',
    difference: 'The sidebar footer shows the Discord button instead of "Powered by ReadMe"',
    source: 'Brief §4.7, I-12',
    states: '*',
    treatments: [{ kind: 'mask', live: 'nav.rm-Sidebar #readmeLogo', local: '[data-visual-deviation="D-2"]' }],
  },
  {
    id: 'D-3',
    difference: '"Questions about this endpoint?" with a Discord button in the request panel',
    source: 'Brief §4.7',
    states: REFERENCE_STATES_WITH_REQUEST_PANEL,
    treatments: [{ kind: 'mask', live: null, local: '[data-visual-deviation="D-3"]' }],
  },
  {
    id: 'D-4',
    difference: 'Node\'s library menu has three entries and defaults to fetch; no "Metadata" relabel',
    source: 'Brief §4.3',
    states: ['v3_lang_node', 'v3_lang_node_library_menu'],
    treatments: [
      {
        kind: 'mask',
        // The snippet (api SDK vs fetch), the library menu, and the "Path Params"/"Metadata" heading.
        live: '.rm-PlaygroundRequest .CodeSnippet, .tippy-box:has(.Dropdown-content_opened), #path-params [class*="APISectionHeader-heading"]',
        local: '[data-visual-deviation="D-4"]',
      },
      // Integrator's decision (D-4 extended; brief §4.3: fetch replaces the "api" SDK default, no "Metadata"
      // relabel): the parameter card, the request card and the response card all change with the default
      // library, so they skip gate 3 in the two Node states. Gates 1 and 2 still run on every element outside them.
      { kind: 'mask-regions', regions: ['paramCard', 'requestCard', 'responseCard'] },
      // The library menu itself is this deviation's (the mask above covers live's whole menu); its 3 entries
      // against live's 4 change its height, so its region box is masked the same way rather than compared
      // masked-against-unmasked. (Applied by the integration pass; for the Integrator's review.)
      { kind: 'mask-regions', regions: ['popover'] },
    ],
  },
  {
    id: 'D-5',
    difference:
      "No colored dots on the first three items of ReadMe's menus (Copy Page, More Languages, response status, Node library, example values)",
    // Brief §4.3 names the Copy Page menu; the same unscoped rule dots the first three items of every ReadMe menu.
    // Integrator's decision (D-5 extended; brief §4.3: don't copy ReadMe's coloured-dot bug): the More Languages,
    // response-status, Node library and example-combobox menus are covered too.
    source: 'Brief §4.3',
    states: [
      'v3_copy_page_menu_open',
      'v3_more_languages_open',
      'v3_response_menu_open',
      'v3_response_example_menu',
      'v3_lang_node_library_menu',
      'v3_param_examples_combobox_open',
    ],
    treatments: [
      {
        kind: 'mask',
        // The dots are ::before marks at the left edge of the menu items (no element of their
        // own), so the left 28px of every item is masked.
        live: '.tippy-box:has(.Dropdown-content_opened) .Menu-Item',
        local: '[data-visual-deviation="D-5"]',
        liveClipLeftPx: 28,
      },
      {
        kind: 'mask',
        // The other menus (D-5 extended). Their baselines predate the extension, so their metrics hold no live
        // rects; the dot column is masked from the portal's first three items instead (painted on both images;
        // the items line up with live's, gate 2). A recapture records the live rects too.
        live: '.tippy-box:has(.Dropdown-content_opened) .Menu-Item:nth-child(-n+3)',
        local: '[data-visual-region="popover"] [role="menu"] [role="menuitem"]',
        liveClipLeftPx: 28,
        localClipLeftPx: 28,
        localFirst: 3,
      },
    ],
  },
  {
    id: 'D-6',
    difference: '"Log in to see full request history" is absent',
    source: 'I-12',
    states: RECENT_REQUESTS_STATES,
    treatments: [
      {
        kind: 'mask',
        live: '.Reference-section [class*="APISectionHeader_subheading"]:has(svg[aria-label="Key"])',
        local: null,
      },
    ],
  },
  {
    id: 'D-7',
    difference: 'Discord button at the end of docs pages, next to the feedback widget',
    source: 'Brief §4.7',
    states: DOCS_PAGE_END_STATES,
    treatments: [
      // Integrator's decision (D-7 treatment): the end-of-page Discord button is masked on the portal (live has
      // none), and the footer pieces ("Updated", prev/next, the feedback widget) are compared by their own boxes,
      // so the button's place in the footer cannot move them into failure.
      { kind: 'mask', live: null, local: '[data-discord-placement="docs_page_end"]' },
      { kind: 'split-region', region: 'pageFooter', elements: ['updated', 'pagination', 'thumbs'] },
    ],
  },
  {
    id: 'D-8',
    difference: 'The Headers modal lists fewer response headers',
    source: 'F-8',
    states: ['v3_response_headers_modal'],
    treatments: [
      {
        kind: 'mask',
        // The RESPONSE section's rows; the frame and the REQUEST section are compared.
        live: 'section[role="dialog"][class*="Modal_open"] [class*="HeadersModal-body"] > [class*="HeadersModal-table-wrapper"]:nth-child(2)',
        local: '[data-visual-deviation="D-8"]',
      },
    ],
  },
  {
    id: 'D-9',
    difference: "Search results differ in order; only the modal's frame, tabs and result-row layout are compared",
    source: 'I-13',
    states: ['search_results_texts'],
    treatments: [
      {
        kind: 'mask',
        // The content of each result row (icon, title, excerpt) and the tab counts; the row boxes,
        // the tabs and the frame stay compared.
        live: '.rm-SearchModal .rm-SearchResults-item-text, .rm-SearchModal .rm-SearchResults-item > i, .rm-SearchModal [class*="SearchTabs-tab-count"]',
        local: '[data-visual-deviation="D-9"]',
      },
    ],
  },
  {
    id: 'D-10',
    difference: 'Homepage: the Discord button in the hero and the community band',
    source: 'Brief §4.7, I-3',
    states: ['home', 'home_full'],
    treatments: [
      // The hero's Discord button stands where live's hero is empty: masked on both images.
      { kind: 'mask', live: null, local: 'div[data-visual-deviation="D-10"]' },
      // Integrator's decision (D-10): the community band is the portal's only. It is cut out of the portal's
      // screenshot (and so out of the page height), so the newsletter band and the footer below it are compared by
      // their own boxes rather than at page coordinates the band has pushed down.
      { kind: 'excise', local: 'section[data-visual-deviation="D-10"]' },
    ],
  },
  {
    id: 'D-11',
    difference: "Mobile homepage: hero spacing from the mobile design instead of live's 300px gap",
    source: 'Brief §4.1',
    states: ['home', 'home_full'],
    treatments: [
      {
        kind: 'exempt-regions',
        regions: ['homeHero', 'viewport'],
        widths: [768, 390],
        alternative:
          'Gates 1 and 2 still run for the hero text; the hero spacing is checked against research/design/homepage-design-mobile.webp by V-behavior.',
      },
    ],
  },
  {
    id: 'D-12',
    difference: 'HTML blocks render inside a frame; compared as a region with a 2% limit',
    source: 'Brief §5',
    states: ['docs_powered_by_html_block', 'docs_hebrew_citations_rtl'],
    treatments: [{ kind: 'region-threshold', region: 'htmlBlock', maxDiffRatio: 0.02 }],
  },
  {
    // Added by the Integrator (PLAN §4.5 rule 7): the brief and DECISIONS (Q14) require the designer's vector
    // wave lines (research/design/wavy-lines-*.svg); live draws a stretched bitmap of a different drawing, so
    // the strokes cannot coincide. W11 measured the hero at 1.23-1.35% with everything else matching.
    id: 'D-13',
    difference: "Homepage hero: the designer's SVG wave lines instead of live's stretched bitmap",
    source: 'Brief §4.1; DECISIONS.md Q14',
    states: ['home', 'home_full'],
    treatments: [{ kind: 'region-threshold', region: 'homeHero', maxDiffRatio: 0.015 }],
  },
];

export function deviationsFor(stateId: string): Deviation[] {
  return DEVIATIONS.filter((d) => d.states === '*' || d.states.includes(stateId));
}
