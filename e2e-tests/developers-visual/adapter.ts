/**
 * The adapter interface every visual-parity recipe is written against (PLAN.md §6.1.2).
 *
 * A recipe is a sequence of calls on this interface. The live adapter (`adapters/live.ts`) drives
 * ReadMe's DOM on developers.sefaria.org; the local adapter (`adapters/local.ts`) drives the
 * rebuilt portal through the page objects in `e2e-tests/pages/developers/`. Because both sides
 * run the same recipe, the two screenshots show the same state and can be compared.
 *
 * Rules for adapter implementations:
 * - A method returns only once the state it produces is visible and stable (menus open and
 *   painted, network fulfilled, fonts loaded). Recipes never sleep.
 * - No method sends a request to the Sefaria API or a POST to developers.sefaria.org. Try It is
 *   fulfilled from `fixtures/tryit-responses.ts` on both sides.
 * - Regions, masks and mapped elements are resolved with `regionSelector`, `maskSelector` and
 *   `mappedSelector`; the ids are shared, the selectors are the adapter's own.
 */
import type { Page } from 'playwright';
import type { RegionId, MaskId } from './regions.ts';
import type { TryItFixtureId } from './fixtures/tryit-responses.ts';

/** Languages of the playground language picker, plus entries from the "More Languages" menu. */
export type PlaygroundLanguage = 'shell' | 'node' | 'ruby' | 'php' | 'python';

export interface TryItOptions {
  /** Which recorded response fulfils the call. */
  fixture: TryItFixtureId;
  /**
   * Hold the response until `releaseTryIt()` is called, so the loading state can be captured
   * (R13). The route handler delays the recorded response on both sides.
   */
  hold?: boolean;
}

export interface ScrollOptions {
  /** Distance in CSS px between the top of the viewport and the top of the region. Default 0. */
  offset?: number;
}

export interface VisualAdapter {
  readonly name: 'live' | 'local';
  readonly page: Page;

  // --- navigation and framing -----------------------------------------------------------
  /** Navigate to a portal path (e.g. `/reference/get-v3-texts`) and wait until it is settled. */
  goto(path: string): Promise<void>;
  /** Scroll the window so that the region's top sits `offset` px below the viewport top. */
  scrollToRegion(region: RegionId, options?: ScrollOptions): Promise<void>;
  /** Scroll the window to the very top. */
  scrollToTop(): Promise<void>;
  /**
   * Make the document itself the scrolling element, so a full-page screenshot shows the whole page.
   * (Live scrolls an inner container, `.ContentWithOwlbot-content`, not the window.) Called by the
   * runner before measuring and capturing a `fullPage` state; recipes do not call it.
   */
  prepareFullPage(): Promise<void>;
  /** Freeze CSS animations and transitions at their end state (homepage, P12). */
  freezeAnimations(): Promise<void>;
  /** Move the pointer away from the page, so no hover state is captured by accident. */
  parkPointer(): Promise<void>;

  // --- header ---------------------------------------------------------------------------
  /** Desktop header: the 3×3 "Open links menu" dropdown (R37). */
  openLinksMenu(): Promise<void>;
  /** Mobile header: the hamburger drawer (R38). */
  openMobileNav(): Promise<void>;
  /** Mobile header: the sub-nav button that opens the sidebar as a floating panel (R39). */
  openMobileSubnav(): Promise<void>;
  /** The search modal, opened from the header search button (R35, R40). */
  openSearch(): Promise<void>;
  /** Type a query into the open search modal and wait for the result rows (R36). */
  searchFor(query: string): Promise<void>;

  // --- sidebar --------------------------------------------------------------------------
  /** Collapse the reference sidebar with its hide button (R23). */
  collapseSidebar(): Promise<void>;
  /**
   * Expand a closed sidebar group by its label. `nth` picks among groups with the same label
   * (the two "Index" groups: 0 is `index`, 1 is `index-1`).
   */
  expandSidebarGroup(label: string, nth?: number): Promise<void>;
  /** Type into the sidebar filter and wait for the tree to filter (R34). */
  filterSidebar(text: string): Promise<void>;
  /** Scroll the sidebar's own scroll container so the named item is visible. */
  scrollSidebarTo(label: string, nth?: number): Promise<void>;

  // --- headline -------------------------------------------------------------------------
  /** Open the Copy Page split button's menu (R07). */
  openCopyPageMenu(): Promise<void>;
  /** Open the "View tags" popover next to the H1 (R08). */
  openTagsPopover(): Promise<void>;

  // --- parameters -----------------------------------------------------------------------
  /** Focus a parameter's combobox so its "Use example value" popover opens (R09). */
  openParamExamples(param: string): Promise<void>;
  /** Fill a text parameter (replaces the current value). `param` is the form field name. */
  fillParam(param: string, value: string): Promise<void>;
  /** Choose a value in an enum parameter's select (R30). */
  selectParamOption(param: string, value: string): Promise<void>;
  /** Expand an object-typed body parameter (find-refs `text`, R25). */
  expandBodyParam(param: string): Promise<void>;

  // --- response schema ------------------------------------------------------------------
  /** Open the response accordion for a status code (R02). */
  expandResponseSchema(status: string): Promise<void>;
  /** Open the nested sub-cards of the expanded schema: the first array expander (R03). */
  expandSchemaChildAttributes(): Promise<void>;

  // --- playground -----------------------------------------------------------------------
  selectLanguage(lang: PlaygroundLanguage): Promise<void>;
  /** Open the request card header's library menu ("cURL Request ⌄", "API Request ⌄") (R05). */
  openLibraryMenu(): Promise<void>;
  /** Open the "⋯" More Languages menu (R06). */
  openMoreLanguages(): Promise<void>;
  /** Hover the Try It! button (R15). */
  hoverTryIt(): Promise<void>;
  /** Click Try It!, fulfilled by the recorded response (R13, R14, R19, R27). */
  runTryIt(options: TryItOptions): Promise<void>;
  /** Let a held Try It response through and wait for it to render. */
  releaseTryIt(): Promise<void>;
  /** After Try It: open the status dropdown ("● 200 ⌄") (R16). */
  openResponseMenu(): Promise<void>;
  /** Before Try It: open the example dropdown ("● 200 - Esther 1.1 ⌄") (R17). */
  openResponseExampleMenu(): Promise<void>;
  /** After Try It: open the "Headers ↗" modal (R18). */
  openResponseHeaders(): Promise<void>;
  /** Click a row of the Recent Requests table (0 = newest) (R22). */
  selectRecentRequestRow(index: number): Promise<void>;

  // --- footer ---------------------------------------------------------------------------
  /** Click "Yes" in the "Did this page help you?" widget. Never clicks "Vote" (R11). */
  openFeedback(answer: 'yes' | 'no'): Promise<void>;

  // --- docs pages -----------------------------------------------------------------------
  /** Open the lightbox of the first framed image in the article (P06). */
  openImageLightbox(): Promise<void>;

  // --- selectors for comparison ---------------------------------------------------------
  /** CSS selector of a comparison region on this side, or null when the side has none. */
  regionSelector(region: RegionId): string | null;
  /** CSS selectors to mask on this side (dynamic content, third-party frames). */
  maskSelector(mask: MaskId): string | null;
  /** CSS selector of a mapped element (computed-get-v3-texts.json key) on this side. */
  mappedSelector(key: string): string | null;
}

export type Recipe = (adapter: VisualAdapter) => Promise<void>;
