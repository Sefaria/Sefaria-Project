import { expect, Page, Locator } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';

/**
 * Voices topic-page POM (`https://voices.<sandbox>/topics/<slug>`).
 *
 * Source: `Sefaria-Project/static/js/TopicPage.jsx`. The page is React-rendered
 * after a server-side loading skeleton — every assertion below must wait for
 * the data-bearing child element, not just the panel wrapper (CLAUDE.md §8.1).
 *
 * Voices's tab strip only has `Sheets` + a filter icon (no Sources tab and no
 * langToggle), and sort is driven by the `?sort=Relevance|Newest|Views` URL
 * param — `Sefaria.activeModule === VOICES_MODULE` short-circuits the source
 * tabs and the langToggle (TopicPage.jsx:773).
 */
export class VoicesTopicPage extends HelperBase {
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

  private get tabs(): Locator {
    return this.panel.locator('.tab');
  }

  private get sheets(): Locator {
    return this.page.locator('.storySheetListItem');
  }

  private get sideColumn(): Locator {
    return this.page.locator('.topicSideColumn');
  }

  private get relatedSection(): Locator {
    return this.sideColumn.locator('.link-section');
  }

  // --- Navigation helpers ---

  /** Visit the topic page, dismiss overlays, wait for the data-bearing child. */
  async open(baseUrl: string, slug: string, opts: { sort?: string } = {}): Promise<void> {
    const url = `${baseUrl}/topics/${slug}` + (opts.sort ? `?sort=${opts.sort}` : '');
    await this.page.goto(url);
    await hideAllModalsAndPopups(this.page);
    await this.waitForLoaded();
  }

  /** Wait for the first sheet to appear — the panel wrapper renders before data. */
  async waitForLoaded(): Promise<void> {
    await expect(this.panel).toBeVisible({ timeout: t(15000) });
    await expect(this.sheets.first()).toBeVisible({ timeout: t(20000) });
  }

  // --- Title / description / image ---

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
    expect(text.length).toBeGreaterThanOrEqual(minLength);
  }

  async expectImageVisibleWithAlt(): Promise<void> {
    await expect(this.topicImage).toBeVisible({ timeout: t(10000) });
    const src = await this.topicImage.getAttribute('src');
    const alt = await this.topicImage.getAttribute('alt');
    expect(src, 'topic image must have non-empty src').toBeTruthy();
    expect(alt, 'topic image must have non-empty alt for a11y').toBeTruthy();
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

  // --- Sheets list ---

  async getSheetCount(): Promise<number> {
    return await this.sheets.count();
  }

  /** A sheet block has `.sheetTitle a`, `.storyBody`, and `.authorByLine`. */
  async expectSheetsHaveMetadata(): Promise<void> {
    const count = await this.sheets.count();
    expect(count, 'should render at least one sheet').toBeGreaterThan(0);
    const sample = Math.min(count, 3);
    for (let i = 0; i < sample; i++) {
      const sheet = this.sheets.nth(i);
      await expect(sheet.locator('.sheetTitle a')).toBeVisible({ timeout: t(5000) });
      const title = (await sheet.locator('.sheetTitle a').innerText()).trim();
      expect(title.length, `sheet ${i} title not empty`).toBeGreaterThan(0);
      await expect(sheet.locator('.authorName a').first()).toBeVisible({ timeout: t(5000) });
    }
  }

  async firstSheetTitle(): Promise<string> {
    await expect(this.sheets.first()).toBeVisible({ timeout: t(15000) });
    return (await this.sheets.first().locator('.sheetTitle a').innerText()).trim();
  }

  async firstNSheetTitles(n: number): Promise<string[]> {
    await expect(this.sheets.first()).toBeVisible({ timeout: t(15000) });
    const titles = await this.sheets.locator('.sheetTitle a').allInnerTexts();
    return titles.slice(0, n).map(s => s.trim());
  }

  /** Click the first sheet's title; assert URL transitions to `/sheets/<id>`. */
  async clickFirstSheetAndExpectNavigation(): Promise<void> {
    const link = this.sheets.first().locator('.sheetTitle a');
    const href = await link.getAttribute('href');
    expect(href, 'first sheet must have an href').toMatch(/^\/sheets\/\d+/);
    await Promise.all([
      this.page.waitForURL(/\/sheets\/\d+/, { timeout: t(20000) }),
      link.click(),
    ]);
  }

  /**
   * Anonymous users must never see draft/unpublished markers in the list.
   * (Drafts are author-only; publication-status filtering is server-side.)
   */
  async expectNoDraftMarkers(): Promise<void> {
    const draftMatches = await this.page.locator('text=/^(draft|unpublished)$/i').count();
    expect(draftMatches, 'anonymous view should not surface "draft"/"unpublished" markers').toBe(0);
  }

  // --- Sidebar / Related topics ---

  async expectSidebarHasRelatedSection(): Promise<void> {
    await expect(this.relatedSection.first()).toBeVisible({ timeout: t(10000) });
    const links = this.relatedSection.locator('a[href^="/topics/"]');
    const count = await links.count();
    expect(count, 'sidebar should expose related topic links').toBeGreaterThanOrEqual(3);
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

  async clickAlphabetLetterAndExpectUrl(baseUrl: string, letter: string): Promise<void> {
    const link = this.page.locator(`a[href="/topics/all/${letter}"]`).first();
    await expect(link).toBeVisible({ timeout: t(10000) });
    await Promise.all([
      this.page.waitForURL(new RegExp(`/topics/all/${letter}(\\?|$)`), { timeout: t(20000) }),
      link.click(),
    ]);
    await expect(this.page.locator('.TOCCardsWrapper')).toBeVisible({ timeout: t(15000) });
  }

  // --- Sort UI (filter strip) ---
  //
  // Source: TopicPage.jsx `setupAdditionalTabs` adds a filter tab (icon only)
  // that toggles `showFilterHeader`. When true, `FilterableList` renders its
  // `.filter-bar-new` block which contains `.filter-sort-wrapper .sort-option`
  // spans (one per `sortOptions[]` value — for sheets that's
  // `['Relevance', 'Views', 'Newest']`). The selected option carries `.active`.

  private get filterTab(): Locator {
    return this.panel.locator('.tab.filter');
  }

  private get filterBarNew(): Locator {
    return this.panel.locator('.filter-bar-new');
  }

  private sortOption(label: string): Locator {
    // `.filter-sort-wrapper .sort-option` — exact text match.
    return this.panel.locator('.filter-sort-wrapper .sort-option').filter({ hasText: new RegExp(`^${label}$`) });
  }

  /** Open the sort/filter strip by clicking the filter tab. */
  async openFilterStrip(): Promise<void> {
    await expect(this.filterTab).toBeVisible({ timeout: t(5000) });
    await this.filterTab.click();
    await expect(this.filterBarNew).toBeVisible({ timeout: t(5000) });
  }

  /** Click a sort option by label ("Relevance" | "Views" | "Newest"). */
  async clickSortOption(label: string): Promise<void> {
    const opt = this.sortOption(label);
    await expect(opt).toBeVisible({ timeout: t(5000) });
    await opt.click();
  }

  /** Assert the active sort option matches `label`. */
  async expectActiveSortOption(label: string): Promise<void> {
    const active = this.panel.locator('.filter-sort-wrapper .sort-option.active');
    await expect(active).toHaveText(new RegExp(`^${label}$`), { timeout: t(5000) });
  }

  /** Assert the URL's `sort=` param matches `label`. */
  async expectSortUrlParam(label: string, page: Page = this.page): Promise<void> {
    await expect(page).toHaveURL(new RegExp(`[?&]sort=${label}(?:&|$)`), { timeout: t(10000) });
  }

  // --- /topics landing page (TrendingTopics, AZ link) ---
  //
  // Source: TopicsPage.jsx (Voices module branch) — sidebar modules are
  // `[{ type: "TrendingTopics" }, { type: "JoinTheConversation" }]`.
  // The TrendingTopics module wraps a `.topic-landing-sidebar-list` in a
  // `[data-anl-feature_name="Trending"]` ancestor (NavSidebar.jsx:650).

  private get trendingBlock(): Locator {
    return this.page.locator('[data-anl-feature_name="Trending"]');
  }

  /** Visit Voices `/topics` landing page; wait for trending block. */
  async openLandingPage(baseUrl: string): Promise<void> {
    await this.page.goto(`${baseUrl}/topics`);
    await hideAllModalsAndPopups(this.page);
    await expect(this.trendingBlock).toBeVisible({ timeout: t(15000) });
  }

  async expectTrendingTopicsList(minCount = 5, maxCount = 15): Promise<void> {
    const links = this.trendingBlock.locator('.topic-landing-sidebar-list a[href^="/topics/"]');
    const n = await links.count();
    expect(n, 'Trending Topics list should have 5–15 entries').toBeGreaterThanOrEqual(minCount);
    expect(n).toBeLessThanOrEqual(maxCount);
    // First link should also be visible (data fetched, not just module mounted)
    await expect(links.first()).toBeVisible({ timeout: t(10000) });
  }

  /** Click the first trending topic; assert URL transitions to that topic. */
  async clickFirstTrendingTopic(): Promise<{ href: string }> {
    const link = this.trendingBlock.locator('.topic-landing-sidebar-list a[href^="/topics/"]').first();
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/topics\//);
    await Promise.all([
      this.page.waitForURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: t(20000) }),
      link.click(),
    ]);
    return { href: href! };
  }

  // --- Misc helpers ---

  async expectTitleStillInDom(): Promise<void> {
    // Topic content is short — the h1 stays in DOM even when scrolled past.
    await expect(this.title).toBeAttached({ timeout: t(5000) });
  }
}
