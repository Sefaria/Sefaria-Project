import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BrowserContext, expect, Locator, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { HelperBase } from '../helperBase';
import { t } from '../../globals';
import { Box, developersUrl, GalleryCard, GalleryFacet, GallerySort, GalleryView, LinkInfo } from './developersCommon';

// ---- The API snapshot ---------------------------------------------------------------------------
// The gallery's own Playwright suite ran against a snapshot of GET /api/powered-by so its counts are
// deterministic; DEV-GAL keeps that. `serveGalleryFixture` answers the (read-only) API request from the
// snapshot. The @sanity/@pr journeys (DEV-GAL-001, -002) run against the real data instead.

/** The gallery's API snapshot, the same file the standalone dev server and the Vitest suite use. */
export const GALLERY_FIXTURE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'devportal-ui',
  'src',
  'gallery',
  'lib',
  '__fixtures__',
  'projects.json'
);

export type GalleryRow = Record<string, unknown> & { id: number; project_name: string };

/** Rows of the snapshot (a fresh copy each call). */
export function galleryFixtureRows(): GalleryRow[] {
  return (JSON.parse(readFileSync(GALLERY_FIXTURE_PATH, 'utf8')) as { projects: GalleryRow[] }).projects;
}

/** Ids of snapshot projects the suites use. Names are checked by the specs, so a refresh cannot change them silently. */
export const GALLERY_PROJECTS = {
  todaysDaf: 155,
  talmudNavigator: 143,
  torahMcp: 141,
  /** Flagged is_buggy in the snapshot. */
  dafQuiz: 51,
} as const;

/** A published project that fills every section of the project page. */
export function richGalleryProject(): GalleryRow {
  const row = galleryFixtureRows().find(
    (p) =>
      p.is_published === true &&
      Boolean(p.project_why) &&
      Boolean(p.project_source_code) &&
      Array.isArray(p.sefaria_tools_used) &&
      p.sefaria_tools_used.length > 0
  );
  if (!row) throw new Error('the gallery snapshot has no rich project');
  return row;
}

/**
 * Before the first navigation: answer `GET /api/powered-by` from the snapshot (optionally changed, e.g. to
 * feature projects), and keep GA4 offline. Only reads are served; nothing reaches a write endpoint.
 */
export async function serveGalleryFixture(
  context: BrowserContext,
  change?: (rows: GalleryRow[]) => void
): Promise<void> {
  const rows = galleryFixtureRows();
  change?.(rows);
  const body = JSON.stringify({ projects: rows });
  await context.route('**/api/powered-by', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body })
      : route.fulfill({ status: 405, body: '' })
  );
  await context.route(/googletagmanager\.com|google-analytics\.com/, (route) => route.abort());
}

const FACET_PREFIX: Record<Exclude<GalleryFacet, 'Category'>, string> = {
  Topics: '',
  Language: 'Language: ',
  'Sefaria resources': 'Resource: ',
  'Built with': 'Built with: ',
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Interactive elements the touch-target check measures (the gallery's own rule: at least 44x44). */
const INTERACTIVE = 'button, a[href], input, select, [role=radio]';

/**
 * The "Powered by Sefaria" gallery under `/powered-by` (DEV-GAL; brief §4.8, PLAN §2.14):
 * browse with search, filters, known-issues switch, sort, view, featured band, project pages.
 * All browse state lives in the URL; read it with `page.url()`.
 */
export class DevelopersGalleryPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ---- Locators -----------------------------------------------------------------------------

  private get exploreButton() {
    return this.page.getByRole('button', { name: /^Explore [\d,]+ projects$/ });
  }

  private get summary() {
    return this.page.getByText(/^(Showing [\d,]+ of [\d,]+ projects|[\d,]+ projects? match(es)?)/);
  }

  private get searchBox() {
    return this.page.getByRole('searchbox', { name: 'Search projects' });
  }

  private get results() {
    return this.page.locator('[data-result-index]');
  }

  private get sheet() {
    return this.page.getByRole('dialog', { name: 'Filters' });
  }

  private get sidebar() {
    return this.page.getByRole('complementary', { name: 'Filters' });
  }

  private get galleryBar() {
    return this.page.getByRole('navigation', { name: 'Powered by Sefaria' });
  }

  private get featuredBand() {
    return this.page.locator('section[aria-labelledby="featured-heading"]');
  }

  private get cta() {
    return this.page.getByRole('complementary', { name: 'Open this project' });
  }

  private get h1() {
    return this.page.getByRole('heading', { level: 1 });
  }

  /** The sheet while it is open, else the sidebar. */
  private async filterScope(): Promise<Locator> {
    return (await this.sheet.isVisible()) ? this.sheet : this.sidebar;
  }

  private sectionHeader(scope: Locator, facet: GalleryFacet): Locator {
    return scope.getByRole('button', { name: new RegExp(`^${escapeRegExp(facet)}( · \\d+)?$`) });
  }

  private filterOption(scope: Locator, facet: GalleryFacet, value: string): Locator {
    const name = new RegExp(`^${escapeRegExp(value)}\\b`);
    return facet === 'Category'
      ? scope.getByRole('radio', { name })
      : scope.getByRole('group', { name: facet }).getByRole('checkbox', { name });
  }

  private async cardInfo(link: Locator): Promise<GalleryCard> {
    return link.evaluate((el) => {
      const anchor = el as HTMLAnchorElement;
      const href = anchor.getAttribute('href') ?? '';
      const card = anchor.closest('article, tr, li') ?? anchor;
      return {
        id: href.match(/\/projects\/(\d+)/)?.[1] ?? '',
        title: (anchor.innerText || anchor.textContent || '').split('\n')[0]!.trim(),
        href,
        knownIssuesBadge: card.querySelector('[role="img"][aria-label="Known issues"]') !== null,
      };
    });
  }

  private async linkInfo(link: Locator): Promise<LinkInfo> {
    await expect(link).toBeVisible({ timeout: t(10000) });
    return {
      name: ((await link.getAttribute('aria-label')) ?? (await link.innerText())).trim(),
      href: (await link.getAttribute('href')) ?? '',
      opensInNewTab: (await link.getAttribute('target')) === '_blank',
    };
  }

  // ---- Navigation ---------------------------------------------------------------------------

  /** Go to a gallery path after the test's first entry, e.g. `open('/powered-by?bugs=1')`. */
  async open(path = '/powered-by'): Promise<void> {
    await this.page.goto(developersUrl(path), { waitUntil: 'domcontentloaded' });
  }

  // ---- Browse -----------------------------------------------------------------------------

  /** Wait until the project list has loaded (from /api/powered-by). */
  async waitForProjects(): Promise<void> {
    await expect(this.exploreButton).toBeVisible({ timeout: t(30000) });
  }

  /** Cards currently shown, in order. */
  async projectCards(): Promise<GalleryCard[]> {
    const links = await this.results.all();
    return Promise.all(links.map((link) => this.cardInfo(link)));
  }

  /** Number of results currently shown (cards, table rows or list rows). */
  async shownResultCount(): Promise<number> {
    return this.results.count();
  }

  /** The result count the page announces ("N projects"). */
  async resultCount(): Promise<number> {
    const text = await this.resultSummary();
    const total = text.match(/of ([\d,]+) projects/)?.[1] ?? text.match(/^([\d,]+) projects? match/)?.[1];
    if (!total) throw new Error(`no result count in "${text}"`);
    return Number(total.replace(/,/g, ''));
  }

  /** The announced summary: "Showing 24 of 122 projects · newest first" or "14 projects match". */
  async resultSummary(): Promise<string> {
    await expect(this.summary).toBeVisible({ timeout: t(15000) });
    return (await this.summary.innerText()).trim();
  }

  /** The hero button's count ("Explore N projects"): every visible project. */
  async heroProjectCount(): Promise<number> {
    await this.waitForProjects();
    const label = (await this.exploreButton.innerText()).trim();
    return Number(label.replace(/[^\d]/g, ''));
  }

  /** "Show more": appends the next batch; returns the title of the card that gets focus. */
  async showMore(): Promise<string> {
    const before = await this.results.count();
    await this.page.getByRole('button', { name: 'Show more projects' }).click();
    await expect.poll(() => this.results.count(), { timeout: t(10000) }).toBeGreaterThan(before);
    const focused = this.page.locator(`[data-result-index="${before}"]`);
    await expect(focused).toBeFocused({ timeout: t(10000) });
    return (await this.cardInfo(focused)).title;
  }

  /** Whether "Show more projects" is offered. */
  async canShowMore(): Promise<boolean> {
    return this.page.getByRole('button', { name: 'Show more projects' }).isVisible();
  }

  /** The `data-result-index` of the focused result, or null when focus is elsewhere. */
  async focusedResultIndex(): Promise<number | null> {
    const value = await this.page.evaluate(() => document.activeElement?.getAttribute('data-result-index') ?? null);
    return value === null ? null : Number(value);
  }

  async search(query: string): Promise<void> {
    await this.searchBox.fill(query);
    await expect.poll(() => new URL(this.page.url()).searchParams.get('q'), { timeout: t(10000) }).toBe(query);
  }

  async clearSearch(): Promise<void> {
    await this.searchBox.fill('');
    await expect.poll(() => new URL(this.page.url()).searchParams.get('q'), { timeout: t(10000) }).toBeNull();
  }

  /** The search box's current value. */
  async searchValue(): Promise<string> {
    return this.searchBox.inputValue();
  }

  /** Open the result at `index` (0-based); returns its title as the list showed it. */
  async openResult(index: number): Promise<string> {
    const link = this.page.locator(`[data-result-index="${index}"]`);
    const { title } = await this.cardInfo(link);
    await link.click();
    await expect(this.page).toHaveURL(/\/powered-by\/projects\/\d+/, { timeout: t(15000) });
    return title;
  }

  /** Scroll result `index` into view; returns the page's scrollY afterwards. */
  async scrollResultIntoView(index: number): Promise<number> {
    await this.page.locator(`[data-result-index="${index}"]`).scrollIntoViewIfNeeded();
    return this.scrollY();
  }

  /** Whether result `index` is visible. */
  async isResultVisible(index: number): Promise<boolean> {
    return this.page.locator(`[data-result-index="${index}"]`).isVisible();
  }

  /** Titles of the project cards' level-3 headings, in order. */
  async resultHeadings(): Promise<string[]> {
    return this.page.locator('main').getByRole('heading', { level: 3 }).allInnerTexts();
  }

  // ---- Filters ----------------------------------------------------------------------------

  /** Expand a filter section's disclosure. */
  async openFilterSection(facet: GalleryFacet): Promise<void> {
    const scope = await this.filterScope();
    const header = this.sectionHeader(scope, facet);
    if ((await header.count()) === 0) return; // an always-open section (Category in the sidebar)
    if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'true', { timeout: t(5000) });
  }

  async isFilterSectionOpen(facet: GalleryFacet): Promise<boolean> {
    const scope = await this.filterScope();
    const header = this.sectionHeader(scope, facet);
    if ((await header.count()) === 0) return true;
    return (await header.getAttribute('aria-expanded')) === 'true';
  }

  /** A section header's text, e.g. "Language · 1". */
  async filterSectionLabel(facet: GalleryFacet): Promise<string> {
    const scope = await this.filterScope();
    return ((await this.sectionHeader(scope, facet).textContent()) ?? '').trim(); // innerText would be upper-cased by CSS
  }

  /** Check or uncheck a value (or choose a Category). */
  async toggleFilter(facet: GalleryFacet, value: string): Promise<void> {
    await this.openFilterSection(facet);
    const scope = await this.filterScope();
    // click, not check(): in the sidebar the box flips once the URL has updated, a tick after the click
    await this.filterOption(scope, facet, value).click();
  }

  async isFilterChecked(facet: GalleryFacet, value: string): Promise<boolean> {
    await this.openFilterSection(facet);
    return this.filterOption(await this.filterScope(), facet, value).isChecked();
  }

  /** The count shown next to a value. */
  async filterCount(facet: GalleryFacet, value: string): Promise<number> {
    await this.openFilterSection(facet);
    const option = this.filterOption(await this.filterScope(), facet, value);
    const label = (await option.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.innerText ?? '')).trim();
    return Number(label.match(/([\d,]+)\s*$/)?.[1]?.replace(/,/g, '') ?? NaN);
  }

  /** Values listed in a section, in order. */
  async filterValues(facet: GalleryFacet): Promise<string[]> {
    await this.openFilterSection(facet);
    const scope = await this.filterScope();
    const options =
      facet === 'Category' ? scope.getByRole('radio') : scope.getByRole('group', { name: facet }).getByRole('checkbox');
    return options.evaluateAll((els) =>
      els.map((el) => ((el as HTMLInputElement).labels?.[0]?.innerText ?? '').replace(/\s*[\d,]+\s*$/, '').trim())
    );
  }

  /** "Show all" in a long section; returns the values now listed. */
  async showAllInSection(facet: GalleryFacet): Promise<string[]> {
    await this.openFilterSection(facet);
    const scope = await this.filterScope();
    await scope
      .getByRole('group', { name: facet })
      .getByRole('button', { name: /^Show all \d+$/ })
      .click();
    return this.filterValues(facet);
  }

  /** Type into a searchable section's own box (e.g. "Filter topics"); returns the values left. */
  async narrowFilterSection(facet: GalleryFacet, text: string): Promise<string[]> {
    await this.openFilterSection(facet);
    const scope = await this.filterScope();
    await scope.getByRole('searchbox', { name: `Filter ${facet.toLowerCase()}` }).fill(text);
    await expect
      .poll(async () => (await this.filterValues(facet)).every((v) => v.toLowerCase().includes(text.toLowerCase())), {
        timeout: t(5000),
      })
      .toBe(true);
    return this.filterValues(facet);
  }

  /** Active-filter chips, e.g. "Built with: Python". */
  async activeFilterChips(): Promise<string[]> {
    const list = this.page.getByRole('list', { name: 'Active filters' });
    if (!(await list.isVisible())) return [];
    const labels = await list
      .getByRole('button', { name: /^Remove filter: / })
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
    return labels.map((label) => label.replace(/^Remove filter: /, ''));
  }

  async removeFilterChip(label: string): Promise<void> {
    await this.page.getByRole('button', { name: `Remove filter: ${label}`, exact: true }).click();
  }

  /** The chip label for a facet value, as the page writes it ("Language: English", "Gemara"). */
  chipLabel(facet: Exclude<GalleryFacet, 'Category'>, value: string): string {
    return `${FACET_PREFIX[facet]}${value}`;
  }

  /** "Clear all" in the active-filter row (clears the search and the filters, not the switch). */
  async clearAllChips(): Promise<void> {
    await this.page.getByRole('list', { name: 'Active filters' }).getByRole('button', { name: 'Clear all' }).click();
  }

  /** "Clear filters" (also offered by the empty state). */
  async clearFilters(): Promise<void> {
    await this.page.getByRole('button', { name: 'Clear filters' }).click();
  }

  /** The empty state's text, or null when projects are shown. */
  async emptyStateText(): Promise<string | null> {
    const title = this.page.getByText('No projects match that search.');
    if (!(await title.isVisible())) return null;
    return (await title.innerText()).trim();
  }

  /** Wait for the empty state; returns its title. */
  async waitForEmptyState(): Promise<string> {
    const title = this.page.getByText('No projects match that search.');
    await expect(title).toBeVisible({ timeout: t(15000) });
    return (await title.innerText()).trim();
  }

  async setKnownIssuesShown(shown: boolean): Promise<void> {
    const toggle = (await this.filterScope()).getByRole('switch', { name: 'Show projects with known issues' });
    if ((await toggle.isChecked()) !== shown) await toggle.click();
    if (shown) await expect(toggle).toBeChecked({ timeout: t(5000) });
    else await expect(toggle).not.toBeChecked({ timeout: t(5000) });
  }

  async areKnownIssuesShown(): Promise<boolean> {
    const toggle = (await this.filterScope()).getByRole('switch', { name: 'Show projects with known issues' });
    await expect(toggle).toBeAttached({ timeout: t(10000) });
    return toggle.isChecked();
  }

  /** The "Filters" button's label below 1024px ("Filters", "Filters · 3"), or null when it is hidden. */
  async filtersButtonLabel(): Promise<string | null> {
    const button = this.page.getByRole('button', { name: /^Filters( · \d+)?$/ });
    if (!(await button.isVisible())) return null;
    return (await button.innerText()).trim();
  }

  // ---- Mobile filter sheet ----------------------------------------------------------------

  async openFilterSheet(): Promise<void> {
    await this.page.getByRole('button', { name: /^Filters( · \d+)?$/ }).click();
    await expect(this.sheet).toBeVisible({ timeout: t(10000) });
  }

  async isFilterSheetOpen(): Promise<boolean> {
    return this.sheet.isVisible();
  }

  /** The number on the sheet's "Show N projects" button: what applying would show. */
  async filterSheetPendingCount(): Promise<number> {
    const button = this.sheet.getByRole('button', { name: /^Show [\d,]+ projects?$/ });
    await expect(button).toBeVisible({ timeout: t(10000) });
    return Number((await button.innerText()).replace(/[^\d]/g, ''));
  }

  /** The sheet's "Show N projects" button: applies the pending selection. */
  async applyFilterSheet(): Promise<void> {
    await this.sheet.getByRole('button', { name: /^Show [\d,]+ projects?$/ }).click();
    await expect(this.sheet).toBeHidden({ timeout: t(10000) });
  }

  /** Close the sheet without applying (discards the pending selection). */
  async closeFilterSheet(): Promise<void> {
    await this.sheet.getByRole('button', { name: 'Close' }).click();
    await expect(this.sheet).toBeHidden({ timeout: t(10000) });
  }

  // ---- Sort and view ----------------------------------------------------------------------

  private get sortSelect() {
    return this.page.getByRole('combobox', { name: 'Sort' });
  }

  async sortBy(sort: GallerySort): Promise<void> {
    await this.sortSelect.selectOption({ label: sort });
  }

  async currentSort(): Promise<GallerySort> {
    const label = await this.sortSelect.evaluate((el) => {
      const select = el as HTMLSelectElement;
      return select.options[select.selectedIndex]?.text ?? '';
    });
    return label as GallerySort;
  }

  async setView(view: GalleryView): Promise<void> {
    const button = this.page.getByRole('group', { name: 'Show projects as' }).getByRole('button', {
      name: view === 'grid' ? 'Grid' : 'List',
      exact: true,
    });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: t(5000) });
  }

  async currentView(): Promise<GalleryView> {
    const pressed = this.page.getByRole('group', { name: 'Show projects as' }).getByRole('button', { pressed: true });
    return ((await pressed.getAttribute('aria-label')) ?? '').toLowerCase() === 'list' ? 'list' : 'grid';
  }

  // ---- Featured band ----------------------------------------------------------------------

  /** Featured cards (up to 3), or [] when the band is absent. */
  async featuredCards(): Promise<GalleryCard[]> {
    if ((await this.featuredBand.count()) === 0) return [];
    const titles = await this.featuredBand.getByRole('heading', { level: 3 }).getByRole('link').all();
    return Promise.all(titles.map((link) => this.cardInfo(link)));
  }

  /** The band's heading and subtitle, or null when the band is absent. */
  async featuredBandHeading(): Promise<{ heading: string; subtitle: boolean } | null> {
    if ((await this.featuredBand.count()) === 0) return null;
    return {
      heading: (await this.featuredBand.getByRole('heading', { level: 2 }).innerText()).trim(),
      subtitle: await this.featuredBand.getByText('Hand-picked by the Developers on Sefaria team').isVisible(),
    };
  }

  /** Number of topic-tag rows inside the band (featured cards have none). */
  async featuredTagRowCount(): Promise<number> {
    return this.featuredBand.getByTestId('topic-tags').count();
  }

  /** Whether the band ends above the "Browse projects" heading. */
  async isFeaturedAboveBrowse(): Promise<boolean> {
    const band = await this.featuredBand.boundingBox();
    const browse = await this.page.getByRole('heading', { name: 'Browse projects' }).boundingBox();
    return band !== null && browse !== null && band.y + band.height <= browse.y;
  }

  /** Geometry of the band: card boxes, and the scroll region below 900px (null at grid widths). */
  async featuredLayout(): Promise<{
    cards: Box[];
    scrollRegion: { tabIndex: string | null; scrollSnapType: string; overflows: boolean } | null;
  }> {
    await expect(this.featuredBand).toBeVisible({ timeout: t(10000) });
    const cards: Box[] = [];
    for (const item of await this.featuredBand.getByRole('listitem').all()) {
      const box = await item.boundingBox();
      if (box) cards.push(box);
    }
    const region = this.featuredBand.getByRole('region', { name: 'Featured Projects, scrollable' });
    if ((await region.count()) === 0) return { cards, scrollRegion: null };
    return {
      cards,
      scrollRegion: {
        tabIndex: await region.getAttribute('tabindex'),
        scrollSnapType: await region.evaluate((el) => getComputedStyle(el).scrollSnapType),
        overflows: await region.evaluate((el) => el.scrollWidth > el.clientWidth),
      },
    };
  }

  /** Click the first featured card's "Made with" tag by coordinates, as a person would. */
  async clickFeaturedMadeWith(): Promise<void> {
    const label = this.featuredBand.getByText('Made with').first();
    await label.scrollIntoViewIfNeeded();
    const box = await label.boundingBox();
    if (!box) throw new Error('"Made with" has no box');
    await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  /** Open a featured card by its title. */
  async openFeatured(title: string): Promise<void> {
    await this.featuredBand.getByRole('link', { name: title, exact: true }).click();
  }

  /** Whether the band mentions `text` anywhere. */
  async featuredBandContains(text: string): Promise<boolean> {
    return (await this.featuredBand.getByText(text).count()) > 0;
  }

  // ---- Project page -----------------------------------------------------------------------

  /** Open a project from its card (or the arrow of a known-issues card). */
  async openProject(title: string): Promise<void> {
    const arrow = this.page.getByRole('link', { name: `About ${title}`, exact: true });
    if (await arrow.isVisible()) await arrow.click();
    else await this.page.getByRole('link', { name: title, exact: true }).first().click();
    await expect(this.page).toHaveURL(/\/powered-by\/projects\/\d+/, { timeout: t(15000) });
  }

  async projectTitle(): Promise<string> {
    await expect(this.h1).toBeVisible({ timeout: t(15000) });
    return (await this.h1.innerText()).trim();
  }

  /** The known-issues notice on a project page, or null. */
  async knownIssuesNotice(): Promise<string | null> {
    const note = this.page.getByRole('note');
    if ((await note.count()) === 0) return null;
    return (await note.first().innerText()).trim();
  }

  /** The project's primary link (its site or repository). */
  async projectPrimaryLink(): Promise<LinkInfo> {
    const link = this.cta.getByRole('link').first();
    return this.linkInfo(link);
  }

  /** Whether the known-issues notice sits above the "Open anyway" button. */
  async isNoticeAboveOpenAnyway(): Promise<boolean> {
    const note = await this.page.getByRole('note').boundingBox();
    const open = await this.page.getByRole('link', { name: /^Open anyway/ }).boundingBox();
    return note !== null && open !== null && note.y + note.height <= open.y;
  }

  /** The open panel ("Open this project") and its pieces, for the layout checks at each width. */
  async projectCtaLayout(): Promise<{
    position: string;
    panel: Box;
    open: Box;
    heading: Box;
    source: Box | null;
    sourceInPanel: boolean;
    sourceVisible: boolean;
    viewport: { width: number; height: number };
  }> {
    await expect(this.cta).toBeVisible({ timeout: t(15000) });
    const open = this.cta.getByRole('link', { name: /^Open / });
    const sourceInPanel = this.cta.getByRole('link', { name: /View source code/ });
    const [panel, openBox, heading] = await Promise.all([
      this.cta.boundingBox(),
      open.boundingBox(),
      this.h1.boundingBox(),
    ]);
    const inPanel = (await sourceInPanel.count()) > 0;
    return {
      position: await this.cta.evaluate((el) => getComputedStyle(el).position),
      panel: panel!,
      open: openBox!,
      heading: heading!,
      source: inPanel ? await sourceInPanel.boundingBox() : null,
      sourceInPanel: inPanel,
      sourceVisible: await this.page.getByRole('link', { name: /View source code/ }).isVisible(),
      viewport: this.page.viewportSize() ?? { width: 0, height: 0 },
    };
  }

  /** The open panel's box. */
  async projectCtaBox(): Promise<Box> {
    await expect(this.cta).toBeVisible({ timeout: t(15000) });
    return (await this.cta.boundingBox())!;
  }

  /** The "Details" section's box. */
  async projectDetailsBox(): Promise<Box> {
    const details = this.page.locator('section[aria-labelledby="details-heading"]');
    await expect(details).toBeVisible({ timeout: t(10000) });
    return (await details.boundingBox())!;
  }

  /** Whether the open panel offers "Open <name>" (a project without known issues). */
  async hasOpenProjectButton(name: string): Promise<boolean> {
    return (await this.page.getByRole('link', { name: new RegExp(`^Open ${escapeRegExp(name)}`) }).count()) > 0;
  }

  /** Whether the panel offers "Open anyway" (a project with known issues). */
  async hasOpenAnyway(): Promise<boolean> {
    return this.cta.getByRole('link', { name: /^Open anyway/ }).isVisible();
  }

  /** The known-issues notice inside the open panel, or null. */
  async ctaNotice(): Promise<string | null> {
    const note = this.cta.getByRole('note');
    if ((await note.count()) === 0) return null;
    return (await note.innerText()).trim();
  }

  /** "All projects": the breadcrumb on a project page, the back link on the charts page. */
  async clickAllProjects(): Promise<void> {
    await this.page.getByRole('link', { name: 'All projects' }).first().click();
  }

  /** "All projects" on the not-found page. */
  async clickNotFoundAllProjects(): Promise<void> {
    await this.page.getByRole('link', { name: 'All projects' }).last().click();
  }

  /** Browser Back to the gallery. */
  async goBack(): Promise<void> {
    await this.page.goBack();
  }

  /** True when the gallery's "not found" view is shown. */
  async isNotFound(): Promise<boolean> {
    const heading = this.page.getByRole('heading', { level: 1, name: /^(Project|Page) not found$/ });
    try {
      await expect(heading).toBeVisible({ timeout: t(15000) });
      return true;
    } catch {
      return false;
    }
  }

  // ---- Gallery actions moved from its old header (PLAN §2.14 item 5) ----------------------

  private get submitLink() {
    return this.galleryBar.getByRole('link', { name: /^Submit a project/ });
  }

  async submitProjectLink(): Promise<LinkInfo> {
    return this.linkInfo(this.submitLink);
  }

  async donateLink(): Promise<LinkInfo> {
    return this.linkInfo(this.galleryBar.getByRole('link', { name: /^Donate/ }));
  }

  /** The visible words of "Submit a project" ("Submit" below 721px), and its box. */
  async submitProjectLabel(): Promise<{ visibleText: string; box: Box }> {
    await expect(this.submitLink).toBeVisible({ timeout: t(10000) });
    return {
      visibleText: (await this.submitLink.locator('span').first().innerText()).trim(),
      box: (await this.submitLink.boundingBox())!,
    };
  }

  /** Boxes of the gallery bar's first and last items (wordmark or back link, and Donate), and the wordmark. */
  async galleryBarEdges(): Promise<{ first: Box; last: Box; title: Box }> {
    await expect(this.galleryBar).toBeVisible({ timeout: t(10000) });
    const links = this.galleryBar.getByRole('link');
    return {
      first: (await links.first().boundingBox())!,
      last: (await links.last().boundingBox())!,
      title: (await this.galleryBar.getByRole('link', { name: 'Powered by Sefaria', exact: true }).boundingBox())!,
    };
  }

  /** Links in the footer whose href contains `fragment`, and footer text matches of `text`. */
  async footerMentions(fragment: string, text: string): Promise<{ links: number; texts: number }> {
    const footer = this.page.getByRole('contentinfo');
    return {
      links: await footer.locator(`a[href*="${fragment}"]`).count(),
      texts: await footer.getByText(text).count(),
    };
  }

  // ---- Charts (/powered-by/charts) --------------------------------------------------------

  /** Number of charts rendered on the unlisted charts page. */
  async chartCount(): Promise<number> {
    await expect(this.page.getByRole('heading', { level: 1, name: 'Powered by Sefaria in numbers' })).toBeVisible({
      timeout: t(15000),
    });
    await expect(this.page.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: t(15000) });
    return this.page.getByRole('heading', { level: 2 }).count();
  }

  /** Chart titles, in order. */
  async chartTitles(): Promise<string[]> {
    await this.chartCount();
    return this.page.getByRole('heading', { level: 2 }).allInnerTexts();
  }

  /** Number of "Show as table" toggles. */
  async chartTableToggleCount(): Promise<number> {
    return this.page.getByText('Show as table').count();
  }

  /** Whether at least one chart drew an SVG surface. */
  async chartsDrawn(): Promise<boolean> {
    const surface = this.page.locator('.recharts-surface').first();
    await expect(surface).toBeVisible({ timeout: t(15000) });
    return true;
  }

  /** Toggle the table alternative of chart `index`; returns its rows. */
  async chartTable(index: number): Promise<string[][]> {
    await this.chartCount();
    const title = (await this.page.getByRole('heading', { level: 2 }).nth(index).innerText()).trim();
    return this.chartTableByTitle(title);
  }

  /** Toggle the table alternative of the chart titled `title`; returns its rows (cells' text). */
  async chartTableByTitle(title: string): Promise<string[][]> {
    const card = this.page.getByRole('region', { name: title, exact: true });
    await card.getByText('Show as table').click();
    const table = card.getByRole('table');
    await expect(table).toBeVisible({ timeout: t(10000) });
    return table
      .getByRole('row')
      .evaluateAll((rows) =>
        rows.map((row) => [...row.querySelectorAll('th, td')].map((cell) => (cell.textContent ?? '').trim()))
      );
  }

  // ---- Server responses (PLAN §2.14 item 6) ------------------------------------------------

  /** GET a gallery path without rendering it or following redirects. */
  async httpGet(path: string): Promise<{ status: number; location: string | null; body: string }> {
    const response = await this.page.request.get(developersUrl(path), { maxRedirects: 0, timeout: t(30000) });
    return { status: response.status(), location: response.headers()['location'] ?? null, body: await response.text() };
  }

  /** The URLs of every projects-API request the page makes from now on (a live list). */
  recordProjectsRequests(): string[] {
    const urls: string[] = [];
    this.page.on('request', (request) => {
      if (/\/api\/powered-by(\?|$)/.test(new URL(request.url()).pathname + new URL(request.url()).search)) {
        urls.push(request.url());
      }
    });
    return urls;
  }

  // ---- Page-wide checks -------------------------------------------------------------------

  /** `<meta name="robots">` content, or null. */
  async robotsMeta(): Promise<string | null> {
    const meta = this.page.locator('meta[name="robots"]');
    if ((await meta.count()) === 0) return null;
    return meta.last().getAttribute('content');
  }

  /** Number of links whose href contains `fragment` (e.g. "charts"). */
  async linksTo(fragment: string): Promise<number> {
    return this.page.locator(`a[href*="${fragment}"]`).count();
  }

  /** Horizontal page overflow in CSS px (0 or less means no horizontal scroll). */
  async horizontalOverflow(): Promise<number> {
    return this.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  }

  async scrollY(): Promise<number> {
    return this.page.evaluate(() => window.scrollY);
  }

  async scrollTo(top: number): Promise<void> {
    await this.page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  }

  /** Interactive elements in the viewport smaller than 44x44 CSS px (the gallery's touch-target rule). */
  async smallTouchTargets(): Promise<string[]> {
    return this.page.evaluate((selector) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const small: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        // only the gallery's own UI: the portal header is measured by its own suite
        if (!el.closest('.dp-gallery')) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.bottom <= 0 || r.top >= vh || r.right < 0 || r.left > vw) continue;
        if (r.width < 43.5 || r.height < 43.5) {
          const label = (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 30);
          small.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      return small;
    }, INTERACTIVE);
  }

  /** Scroll through the whole page a viewport at a time, collecting small touch targets at each stop. */
  async smallTouchTargetsWhileScrolling(): Promise<string[]> {
    const height = await this.page.evaluate(() => document.documentElement.scrollHeight);
    const step = await this.page.evaluate(() => window.innerHeight);
    const found: string[] = [];
    for (let y = 0; y < height; y += step) {
      await this.scrollTo(y);
      found.push(...(await this.smallTouchTargets()));
    }
    return found;
  }

  /** Expand every facet section and the first "Show all", then bring "Browse projects" into view. */
  async expandEveryFilterSection(): Promise<void> {
    for (const facet of ['Topics', 'Language', 'Sefaria resources', 'Built with'] as const) {
      await this.openFilterSection(facet);
    }
    const scope = await this.filterScope();
    await scope
      .getByRole('button', { name: /^Show all/ })
      .first()
      .click();
    await this.page.getByRole('heading', { name: 'Browse projects' }).scrollIntoViewIfNeeded();
  }

  /** The hero's Talmud quote: its CSS position, and whether it overlaps the hero's copy or buttons. */
  async heroQuoteLayout(): Promise<{ position: string; overlaps: string[] }> {
    const quote = this.page.locator('main figure').first();
    await expect(quote).toBeVisible({ timeout: t(10000) });
    const q = (await quote.boundingBox())!;
    const targets: Array<[string, Locator]> = [
      ['title', this.h1],
      ['lead', this.page.getByText(/hub for Torah innovation/).first()],
      ['explore', this.exploreButton],
      ['build', this.page.getByRole('link', { name: /Build with Sefaria/ }).first()],
    ];
    const overlaps: string[] = [];
    for (const [name, target] of targets) {
      const b = await target.boundingBox();
      if (!b) {
        overlaps.push(`${name}: no box`);
        continue;
      }
      if (q.x < b.x + b.width && b.x < q.x + q.width && q.y < b.y + b.height && b.y < q.y + q.height) {
        overlaps.push(name);
      }
    }
    return { position: await quote.evaluate((el) => getComputedStyle(el).position), overlaps };
  }

  /** Heights of the cards' topic-tag rows. */
  async topicTagRowHeights(): Promise<number[]> {
    return this.page.getByTestId('topic-tags').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  }

  /** axe with the gallery's own rule set (WCAG 2.0, 2.1 and 2.2 A/AA), on the page or one part of it. */
  async axeViolations(
    scope: 'page' | 'gallery-bar' = 'page'
  ): Promise<{ id: string; impact: string | null; help: string; targets: string[] }[]> {
    let builder = new AxeBuilder({ page: this.page }).withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'wcag22aa',
    ]);
    if (scope === 'gallery-bar') builder = builder.include('nav[aria-label="Powered by Sefaria"]');
    const results = await builder.analyze();
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));
  }

  /** A full-page (or viewport) screenshot, for the test report. */
  async screenshot(fullPage: boolean): Promise<Buffer> {
    await this.page.evaluate(() => document.fonts.ready);
    return this.page.screenshot({ fullPage });
  }

  /** Bring "Browse projects" into view. */
  async scrollToBrowse(): Promise<void> {
    await this.page.getByRole('heading', { name: 'Browse projects' }).scrollIntoViewIfNeeded();
  }
}
