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
    }
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
    ],
  },
  {
    id: 'D-5',
    difference: 'No colored dots on the first three Copy Page menu items',
    source: 'Brief §4.3',
    states: ['v3_copy_page_menu_open'],
    treatments: [
      {
        kind: 'mask',
        // The dots are ::before marks at the left edge of the menu items (no element of their
        // own), so the left 28px of every item is masked.
        live: '.tippy-box:has(.Dropdown-content_opened) .Menu-Item',
        local: '[data-visual-deviation="D-5"]',
        liveClipLeftPx: 28,
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
    treatments: [{ kind: 'mask', live: null, local: '[data-visual-deviation="D-7"]' }],
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
    treatments: [{ kind: 'mask', live: null, local: '[data-visual-deviation="D-10"]' }],
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
