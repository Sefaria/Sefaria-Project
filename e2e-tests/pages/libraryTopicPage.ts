import { expect, Page, Locator } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { SEARCH_DROPDOWN } from '../constants';

/**
 * Library topic-page POM (`https://www.<sandbox>/topics/<slug>`).
 *
 * Source: `Sefaria-Project/static/js/TopicPage.jsx` + `Story.jsx`. The page is
 * React-rendered after a server-side loading skeleton, so every data-shaped
 * assertion waits for a data-bearing child element, not just the panel wrapper
 * (CLAUDE.md §11).
 *
 * Library differs from Voices in three ways that drive this POM:
 *  1. It renders **text sources** (`.story.topicPassageStory`, via
 *     `TopicTextPassage`), not sheet cards. The default tab is "Notable Sources"
 *     (`?tab=notable-sources`); a broader "Sources" tab is available too.
 *  2. Source tabs sort by `['Relevance', 'Chronological']` (not Views/Newest).
 *  3. It exposes a source-language toggle (the "A" popover tab → `LangSelectInterface`
 *     with Source / Translation / Source-with-Translation) which Voices gates off
 *     (`Sefaria.activeModule === LIBRARY_MODULE`, TopicPage.jsx:773). The real
 *     text-filter tab only appears when the active tab is NOT "notable-sources"
 *     (TopicPage.jsx:760), so filter/sort-UI tests switch to the "Sources" tab first.
 *
 * Verified against production www.sefaria.org on 2026-06-15 via /topics/torah.
 */
export class LibraryTopicPage extends HelperBase {
  /** Inner element that actually scrolls (FilterableList's scrollableElement). */
  private static readonly SCROLL_CONTAINER = '.topicPanel .content.noOverflowX';

  constructor(page: Page, language: string) {
    super(page, language);
  }

  // --- Containers / shells ---

  private get panel(): Locator {
    return this.page.locator('.topicPanel');
  }

  private get title(): Locator {
    return this.panel.locator('.navTitle h1');
  }

  private get description(): Locator {
    return this.panel.locator('.topicDescription');
  }

  private get topicImage(): Locator {
    return this.page.locator('.topicImage img.imageWithCaptionPhoto');
  }

  private get topicCategory(): Locator {
    // The category line (e.g. "Values") with a link to /topics/category/<slug>.
    return this.panel.locator('.topicCategory');
  }

  private get tabs(): Locator {
    return this.panel.locator('.tab');
  }

  /** Text-source cards rendered by `TopicTextPassage` (both Notable + Sources tabs). */
  private get sources(): Locator {
    return this.page.locator('.story.topicPassageStory');
  }

  private get sideColumn(): Locator {
    return this.page.locator('.topicSideColumn');
  }

  private get relatedSection(): Locator {
    return this.sideColumn.locator('.link-section');
  }

  // --- Navigation helpers ---

  /** Visit the topic page, dismiss overlays, wait for the data-bearing child. */
  async open(baseUrl: string, slug: string, opts: { sort?: string; query?: string } = {}): Promise<void> {
    const params = new URLSearchParams();
    if (opts.sort) params.set('sort', opts.sort);
    if (opts.query) {
      // raw extra query string (e.g. an invalid param to test graceful fallback)
      for (const [k, v] of new URLSearchParams(opts.query)) params.set(k, v);
    }
    const qs = params.toString();
    await this.page.goto(`${baseUrl}/topics/${slug}${qs ? `?${qs}` : ''}`);
    await hideAllModalsAndPopups(this.page);
    await this.waitForLoaded();
  }

  /** Wait for the first source card — the panel wrapper renders before data. */
  async waitForLoaded(): Promise<void> {
    await expect(this.panel).toBeVisible({ timeout: t(15000) });
    await expect(this.sources.first()).toBeVisible({ timeout: t(20000) });
  }

  // --- Title / description / image / category ---

  async expectTitleText(expected: string | RegExp): Promise<void> {
    await expect(this.title).toBeVisible({ timeout: t(10000) });
    if (typeof expected === 'string') {
      await expect(this.title).toContainText(expected, { timeout: t(5000) });
    } else {
      await expect(this.title).toHaveText(expected, { timeout: t(5000) });
    }
  }

  async expectDescriptionPresent(minLength = 50): Promise<void> {
    await expect(this.description).toBeVisible({ timeout: t(10000) });
    const text = (await this.description.innerText()).trim();
    expect(text.length, `topic description should be >= ${minLength} chars`).toBeGreaterThanOrEqual(minLength);
  }

  async expectImageVisibleWithAlt(): Promise<void> {
    await expect(this.topicImage).toBeVisible({ timeout: t(10000) });
    const src = await this.topicImage.getAttribute('src');
    const alt = await this.topicImage.getAttribute('alt');
    expect(src, 'topic image must have non-empty src').toBeTruthy();
    expect(alt, 'topic image must have non-empty alt for a11y').toBeTruthy();
  }

  /** Assert the browser tab title (document.title) contains `fragment`. */
  async expectDocumentTitleContains(fragment: string | RegExp): Promise<void> {
    await expect(this.page).toHaveTitle(typeof fragment === 'string' ? new RegExp(fragment) : fragment, { timeout: t(10000) });
  }

  /**
   * Assert the topic category line ("Values", "People", …) is visible and links
   * to a /topics/category/<slug> page. Library surfaces the topic's place in the
   * topic hierarchy here (there is no "Library > Topics > X" breadcrumb trail).
   */
  async expectCategoryPresent(): Promise<{ href: string }> {
    await expect(this.topicCategory).toBeVisible({ timeout: t(10000) });
    const link = this.topicCategory.locator('a').first();
    const href = await link.getAttribute('href');
    expect(href, 'category link should point at /topics/category/<slug>').toMatch(/\/topics\/category\//);
    return { href: href! };
  }

  /** Click the category link and assert navigation to the category page. */
  async clickCategoryAndExpectNavigation(): Promise<void> {
    const link = this.topicCategory.locator('a').first();
    const href = await link.getAttribute('href');
    await Promise.all([
      this.page.waitForURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: t(20000) }),
      link.click(),
    ]);
  }

  /** Run a callback at the given viewport, then restore the original size. */
  async withViewport(width: number, height: number, fn: () => Promise<void>): Promise<void> {
    const original = this.page.viewportSize();
    await this.page.setViewportSize({ width, height });
    try {
      await fn();
    } finally {
      if (original) await this.page.setViewportSize(original);
    }
  }

  /** Assert the document body has no horizontal overflow at the current viewport. */
  async expectNoHorizontalScroll(): Promise<void> {
    const overflows = await this.page.evaluate(() => {
      const doc = document.documentElement;
      // 2px fudge for sub-pixel rounding / scrollbar gutters.
      return doc.scrollWidth - doc.clientWidth > 2;
    });
    expect(overflows, 'page should not require horizontal scrolling').toBe(false);
  }

  // --- Tabs ---

  /** Click a source tab by its visible label ("Notable Sources" | "Sources"). */
  async switchToTab(label: 'Notable Sources' | 'Sources'): Promise<void> {
    const tab = this.tabs.filter({ hasText: new RegExp(`^${label}$`) }).first();
    await expect(tab).toBeVisible({ timeout: t(10000) });
    await tab.click();
    // The source list re-renders for the new tab.
    await expect(this.sources.first()).toBeVisible({ timeout: t(20000) });
  }

  // --- Source list ---

  async getSourceCount(): Promise<number> {
    return await this.sources.count();
  }

  /**
   * Each source card exposes a reference link (`.headerWithAdminButtons a`,
   * e.g. "Joshua 1:7-8") and a body-text passage (`.storyBody`), both pointing at
   * the same `/<Ref>` reader URL.
   *
   * NOTE: on the default "Notable Sources" tab the cards are accordions
   * (`SummarizedStoryFrame` → `<details>`), and only the first is auto-expanded
   * (TopicPage.jsx:836). So the ref link / body of collapsed cards are present in
   * the DOM but `hidden`. We therefore assert each card is *attached* with a
   * non-empty ref href + text and a body passage — not that they are visible.
   */
  async expectSourcesHaveMetadata(sampleSize = 3): Promise<void> {
    const count = await this.sources.count();
    expect(count, 'should render at least one source').toBeGreaterThan(0);
    const sample = Math.min(count, sampleSize);
    for (let i = 0; i < sample; i++) {
      const source = this.sources.nth(i);
      await expect(source).toBeVisible({ timeout: t(8000) });
      const refLink = source.locator('.headerWithAdminButtons a').first();
      await expect(refLink).toBeAttached({ timeout: t(8000) });
      const refText = (await refLink.textContent() ?? '').trim();
      expect(refText.length, `source ${i} reference should be non-empty`).toBeGreaterThan(0);
      const href = await refLink.getAttribute('href');
      expect(href, `source ${i} reference should link to a /<Ref>`).toBeTruthy();
      // The body text passage should be present.
      await expect(source.locator('.storyBody').first()).toBeAttached({ timeout: t(8000) });
    }
  }

  /** The first source's reference href (e.g. "/Joshua.1.7-8"). */
  async firstSourceRefHref(): Promise<string> {
    const link = this.sources.first().locator('.headerWithAdminButtons a').first();
    await expect(link).toBeAttached({ timeout: t(15000) });
    return (await link.getAttribute('href'))!;
  }

  async firstNSourceRefs(n: number): Promise<string[]> {
    await expect(this.sources.first()).toBeVisible({ timeout: t(15000) });
    const hrefs = await this.sources.locator('.headerWithAdminButtons a').evaluateAll(
      els => els.map(e => (e as HTMLAnchorElement).getAttribute('href') || ''),
    );
    return hrefs.slice(0, n);
  }

  /**
   * Click the first source's reference link and assert it opens the reader
   * (URL changes to the source's /<Ref>). Returns the ref href for back-nav checks.
   */
  async clickFirstSourceAndExpectReader(): Promise<{ href: string }> {
    const link = this.sources.first().locator('.headerWithAdminButtons a').first();
    const href = await link.getAttribute('href');
    expect(href, 'first source should have a /<Ref> href').toMatch(/^\/[^/]/);
    await Promise.all([
      this.page.waitForURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: t(25000) }),
      link.click(),
    ]);
    return { href: href! };
  }

  /**
   * Incrementally scroll the inner scroll container to trigger lazy loading of
   * additional sources. Returns the source count after `rounds` scroll cycles.
   * (The topic page loads ~19 curated sources initially and appends pages of
   * ~20 as the FilterableList's scrollable element nears its bottom.)
   */
  async scrollToLoadMore(rounds = 8): Promise<number> {
    for (let i = 0; i < rounds; i++) {
      await this.page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) el.scrollTo(0, el.scrollHeight);
        const items = document.querySelectorAll('.story.topicPassageStory');
        items[items.length - 1]?.scrollIntoView({ block: 'end' });
      }, LibraryTopicPage.SCROLL_CONTAINER);
      await this.page.waitForTimeout(t(1200));
    }
    return await this.sources.count();
  }

  /** Assert anonymous users see no draft / unpublished markers in the source list. */
  async expectNoDraftMarkers(): Promise<void> {
    const draftMatches = await this.page.locator('text=/^(draft|unpublished)$/i').count();
    expect(draftMatches, 'anonymous view should not surface "draft"/"unpublished" markers').toBe(0);
  }

  // --- Filter strip (text filter + sort) ---
  //
  // The filter tab (icon-only, right-justified) renders only when the active tab
  // is NOT "notable-sources". So callers must `switchToTab('Sources')` first.
  // Clicking it toggles `showFilterHeader`; FilterableList then renders
  // `.filter-bar-new` with a text `<input>` and `.filter-sort-wrapper .sort-option`
  // spans (`['Relevance', 'Chronological']` for sources; the active one gets `.active`).

  private get filterTab(): Locator {
    // The real filter tab carries `.filter` but NOT `.popover` (the popover one is langToggle).
    return this.panel.locator('.tab.filter:not(.popover)');
  }

  private get filterBarNew(): Locator {
    return this.panel.locator('.filter-bar-new');
  }

  private get filterInput(): Locator {
    return this.filterBarNew.locator('input').first();
  }

  private sortOption(label: string): Locator {
    return this.panel.locator('.filter-sort-wrapper .sort-option').filter({ hasText: new RegExp(`^${label}$`) });
  }

  /** Open the filter/sort strip (must be on the "Sources" tab). */
  async openFilterStrip(): Promise<void> {
    await expect(this.filterTab).toBeVisible({ timeout: t(8000) });
    await this.filterTab.first().click();
    await expect(this.filterBarNew).toBeVisible({ timeout: t(5000) });
  }

  async expectSortOptions(labels: string[]): Promise<void> {
    for (const label of labels) {
      await expect(this.sortOption(label).first()).toBeVisible({ timeout: t(5000) });
    }
  }

  async clickSortOption(label: string): Promise<void> {
    const opt = this.sortOption(label).first();
    await expect(opt).toBeVisible({ timeout: t(5000) });
    await opt.click();
  }

  async expectActiveSortOption(label: string): Promise<void> {
    const active = this.panel.locator('.filter-sort-wrapper .sort-option.active');
    await expect(active).toHaveText(new RegExp(`^${label}$`), { timeout: t(5000) });
  }

  /** Type into the filter strip's text input to filter the source list. */
  async typeFilter(text: string): Promise<void> {
    await expect(this.filterInput).toBeVisible({ timeout: t(5000) });
    await this.filterInput.fill(text);
    // FilterableList re-renders synchronously on input; give React a tick.
    await this.page.waitForTimeout(t(800));
  }

  // --- Source-language toggle ("A" popover tab → LangSelectInterface) ---

  private get langToggleTab(): Locator {
    // The clickable element is the TabView `[role="tab"]` wrapper around the
    // `.tab.popover` div (the onClick that toggles the popover lives on the
    // wrapper). Clicking the wrapper reliably opens AND keeps the popover open
    // (the component focuses `.langSelectPopover` on mount); clicking the inner
    // div does not toggle it.
    return this.panel.locator('[role="tab"]:has(.tab.popover)');
  }

  private get langPopover(): Locator {
    return this.page.locator('.langSelectPopover');
  }

  /** Open the source-language popover. */
  async openLangToggle(): Promise<void> {
    await expect(this.langToggleTab.first()).toBeVisible({ timeout: t(8000) });
    // The tab strip can still be re-rendering the langToggle right after a tab
    // switch (it flips between `.tab.popover.filter` and `.tab.popover`), so a
    // single click can land mid-render and no-op. Retry the click until the
    // popover actually opens.
    await expect(async () => {
      if (!(await this.langPopover.isVisible().catch(() => false))) {
        await this.langToggleTab.first().click();
      }
      await expect(this.langPopover).toBeVisible({ timeout: t(2000) });
    }).toPass({ timeout: t(15000) });
  }

  /** The radio id currently marked active (`.active.radioChoice > input`). */
  async activeSourceLanguage(): Promise<string | null> {
    if (!(await this.langPopover.isVisible().catch(() => false))) return null;
    return await this.langPopover.locator('.radioChoice.active input').first().getAttribute('id');
  }

  /**
   * Select a source-language option by its radio id (source / translation /
   * sourcewtrans). Force-clicks the radio input so its `onChange` fires
   * (`handleLangChange` → re-render in the chosen language + `closeInterface`).
   * If the option is already active the click is a no-op (no change event).
   */
  async selectSourceLanguage(option: 'source' | 'translation' | 'sourcewtrans'): Promise<void> {
    if (!(await this.langPopover.isVisible().catch(() => false))) {
      await this.openLangToggle();
    }
    const radio = this.langPopover.locator(`#${option}`);
    await expect(radio).toBeAttached({ timeout: t(5000) });
    await radio.click({ force: true });
    // Source list re-renders in the chosen language; the popover closes itself.
    await this.page.waitForTimeout(t(1200));
  }

  /** Fraction (0..1) of the first `n` source bodies that contain Hebrew characters. */
  async hebrewFractionOfFirstSources(n: number): Promise<number> {
    await expect(this.sources.first()).toBeVisible({ timeout: t(15000) });
    const texts = await this.sources.locator('.storyBody').evaluateAll(
      els => els.map(e => (e as HTMLElement).innerText || ''),
    );
    const sample = texts.slice(0, n);
    const hebrew = /[֐-׿]/;
    const withHebrew = sample.filter(s => hebrew.test(s)).length;
    return sample.length ? withHebrew / sample.length : 0;
  }

  // --- Sidebar / Related topics ---

  async expectSidebarHasRelatedSection(minLinks = 3): Promise<void> {
    await expect(this.relatedSection.first()).toBeVisible({ timeout: t(10000) });
    const links = this.relatedSection.locator('a[href^="/topics/"]');
    const count = await links.count();
    expect(count, 'sidebar should expose related topic links').toBeGreaterThanOrEqual(minLinks);
  }

  /** Click first related-topic link; assert URL changes to `/topics/<slug>`. */
  async clickFirstRelatedTopic(): Promise<{ href: string }> {
    const link = this.relatedSection.locator('a[href^="/topics/"]').first();
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/topics\//);
    await Promise.all([
      this.page.waitForURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: t(20000) }),
      link.click(),
    ]);
    return { href: href! };
  }

  // --- A–Z browse (`/topics/all/<letter>`) ---

  async openAllTopicsForLetter(baseUrl: string, letter: string): Promise<void> {
    await this.page.goto(`${baseUrl}/topics/all/${letter}`);
    await hideAllModalsAndPopups(this.page);
    await expect(this.page.locator('.TOCCardsWrapper')).toBeVisible({ timeout: t(15000) });
  }

  async expectAllTopicsLetterPagePopulated(minCards = 1): Promise<void> {
    const cards = await this.page.locator('.TOCCardsWrapper > *').count();
    expect(cards, 'A–Z page should render at least one topic card').toBeGreaterThanOrEqual(minCards);
  }

  async clickAlphabetLetterAndExpectUrl(letter: string): Promise<void> {
    const link = this.page.locator(`a[href="/topics/all/${letter}"]`).first();
    await expect(link).toBeVisible({ timeout: t(10000) });
    await Promise.all([
      this.page.waitForURL(new RegExp(`/topics/all/${letter}(\\?|$)`), { timeout: t(20000) }),
      link.click(),
    ]);
    await expect(this.page.locator('.TOCCardsWrapper')).toBeVisible({ timeout: t(15000) });
  }

  // --- /topics landing page (Trending Topics) ---

  private get trendingBlock(): Locator {
    return this.page.locator('[data-anl-feature_name="Trending"]');
  }

  async openLandingPage(baseUrl: string): Promise<void> {
    await this.page.goto(`${baseUrl}/topics`);
    await hideAllModalsAndPopups(this.page);
    await expect(this.trendingBlock.first()).toBeVisible({ timeout: t(15000) });
  }

  async expectTrendingTopicsList(minCount = 3, maxCount = 20): Promise<void> {
    const links = this.trendingBlock.locator('a[href^="/topics/"]');
    const n = await links.count();
    expect(n, `Trending Topics list should have ${minCount}–${maxCount} entries`).toBeGreaterThanOrEqual(minCount);
    expect(n).toBeLessThanOrEqual(maxCount);
    await expect(links.first()).toBeVisible({ timeout: t(10000) });
  }

  async clickFirstTrendingTopic(): Promise<{ href: string }> {
    const link = this.trendingBlock.locator('a[href^="/topics/"]').first();
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/topics\//);
    await Promise.all([
      this.page.waitForURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: t(20000) }),
      link.click(),
    ]);
    return { href: href! };
  }

  // --- Header search autocomplete (LIB-014) ---

  private get searchBox(): Locator {
    return this.page.getByRole('combobox', { name: /search/i });
  }

  private get autocompleteDropdown(): Locator {
    return this.page.locator(SEARCH_DROPDOWN.CONTAINER);
  }

  /**
   * Type `query` in the header search box, wait for the autocomplete dropdown,
   * and assert it surfaces at least one Topic suggestion (an `<a href="/topics/…">`).
   * Returns the first topic suggestion's locator + href for a follow-up click.
   */
  async searchAndExpectTopicSuggestion(query: string): Promise<{ link: Locator; href: string }> {
    await hideAllModalsAndPopups(this.page);
    await expect(this.searchBox).toBeVisible({ timeout: t(10000) });
    await this.searchBox.click();
    await this.searchBox.fill(query);
    await expect(this.autocompleteDropdown).toBeVisible({ timeout: t(10000) });
    const topicLink = this.autocompleteDropdown.locator('a[href^="/topics/"]').first();
    await expect(topicLink).toBeVisible({ timeout: t(10000) });
    const href = await topicLink.getAttribute('href');
    return { link: topicLink, href: href! };
  }

  async clickSuggestionAndExpectNavigation(link: Locator, href: string): Promise<void> {
    await Promise.all([
      this.page.waitForURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: t(20000) }),
      link.click(),
    ]);
  }

  // --- Misc / error handling ---

  async expectTitleStillInDom(): Promise<void> {
    await expect(this.title).toBeAttached({ timeout: t(5000) });
  }

  /**
   * Assert the page is a recognizable "not found" state: an h1 / body text that
   * says the page wasn't found, no topic panel, and at least the global nav
   * (Topics link) remains so the user isn't stranded.
   */
  async expectNotFoundState(): Promise<void> {
    await expect(this.panel).toHaveCount(0, { timeout: t(10000) });
    await expect(
      this.page.locator('h1', { hasText: /Page Not Found|not found/i }).first(),
    ).toBeVisible({ timeout: t(10000) });
    // User can navigate away — the global header "Topics" link is present.
    await expect(this.page.locator('a[href="/topics"], a[href^="/topics"]').first()).toBeVisible({ timeout: t(10000) });
  }

  // --- Analytics / a11y proxies ---

  /** Assert source cards carry the analytics batch attribute (`data-anl-batch`). */
  async expectSourceAnalyticsAttributes(): Promise<void> {
    const first = this.sources.first();
    await expect(first).toBeVisible({ timeout: t(10000) });
    // Each rendered source is wrapped in a div carrying data-anl-batch (refRenderWrapper).
    const wrapper = this.page.locator('[data-anl-batch]');
    expect(await wrapper.count(), 'rendered sources should carry data-anl-batch analytics payloads').toBeGreaterThan(0);
  }

  /** Assert basic heading/a11y structure: exactly one visible topic h1 with text. */
  async expectAccessibleHeadingStructure(): Promise<void> {
    await expect(this.title).toBeVisible({ timeout: t(10000) });
    const h1Text = (await this.title.innerText()).trim();
    expect(h1Text.length, 'topic h1 should have non-empty accessible text').toBeGreaterThan(0);
  }
}
