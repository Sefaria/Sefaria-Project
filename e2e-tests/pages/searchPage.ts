import { Page, expect } from "@playwright/test"
import { t } from "../globals"
import { HelperBase } from "./helperBase"

/**
 * Tab order is fixed by the `tabs` array in static/js/SearchPage.jsx:428.
 * Indexing by position rather than by visible label keeps the page object
 * interface-language-invariant (CLAUDE.md §2.15) — the labels are i18n'd
 * ("Books" / "ספרים"), the order is not.
 */
const TAB_INDEX = { sources: 0, books: 1, authors: 2, topics: 3 } as const;
export type SearchTabId = keyof typeof TAB_INDEX;

export class SearchPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    async searchFor(criteria: string){

        const searchBox = this.page.getByRole('banner').getByRole('combobox')

        await searchBox.click()
        await searchBox.fill(criteria)
        await searchBox.press('Enter')

        // Wait for search results page to load by checking for the results heading
        await this.page.waitForLoadState('domcontentloaded')

        // Verify we're on the search results page with the expected content
        await expect(this.page.getByRole('heading').first()).toContainText(criteria)
    }

    async validateVirtualKeyboardForEnglish(character: string){
        await this.page.getByRole('banner').getByRole('combobox').click()
        await this.page.getByRole('img', { name: 'Display virtual keyboard' }).click();
        await this.page.getByRole('cell', { name: character, exact: true }).click();
        await expect(this.page.getByRole('banner').getByRole('combobox')).toHaveValue(character)
    }

    // ---------------------------------------------------------------------
    // Locators — tabbed search results page (SearchPage.jsx)
    // ---------------------------------------------------------------------

    /**
     * The scroll container. `.readerNavMenu .content` carries `overflow-y: scroll`
     * (s2.css:1345), and `InfiniteScroll` binds its listener to the nearest
     * `.content` ancestor (InfiniteScroll.jsx:41) — so this element is both the
     * page-content root and the thing that must scroll to page in more results.
     */
    private get searchContent() {
        return this.page.locator('.content.searchContent');
    }

    private get tabs() {
        return this.searchContent.getByRole('tab');
    }

    private get resultCards() {
        return this.searchContent.locator('.searchResultCard');
    }

    private get resultCardNameCells() {
        // One <span class="int-en"> OR <span class="int-he"> per card — InterfaceText
        // renders a single span (Misc.jsx:115), so textContent is unambiguous.
        return this.searchContent.locator('.searchResultCard-name');
    }

    /**
     * The sort control's trigger. `aria-label` is always `Sort by <English name>`
     * (SearchSortDropdown.jsx:84). Scoping by `role=button` is what separates the
     * trigger from the option rows, which reuse the identical aria-label text on
     * `<tr>` elements (Misc.jsx:518).
     */
    private get sortTrigger() {
        return this.searchContent.getByRole('button', { name: /^Sort by / });
    }

    private get sortOptionList() {
        return this.searchContent.locator('.dropdown-option-list');
    }

    private get filterSidebar() {
        return this.page.locator('.searchFilters');
    }

    // ---------------------------------------------------------------------
    // Tabs
    // ---------------------------------------------------------------------

    /** Click a results tab and wait for it to actually become the selected one. */
    async selectTab(tab: SearchTabId) {
        const target = this.tabs.nth(TAB_INDEX[tab]);
        await expect(target).toBeVisible({ timeout: t(20000) });
        await target.click();
        await expect(target).toHaveAttribute('aria-selected', 'true', { timeout: t(10000) });
    }

    // ---------------------------------------------------------------------
    // Results
    // ---------------------------------------------------------------------

    /**
     * Wait for actual result cards, not just the panel wrapper — the panel renders
     * immediately and streams results in (CLAUDE.md §2.11).
     */
    async waitForResultCards(expectedCount?: number) {
        await expect(this.resultCards.first()).toBeVisible({ timeout: t(20000) });
        if (expectedCount !== undefined) {
            await expect(this.resultCards).toHaveCount(expectedCount, { timeout: t(20000) });
        }
    }

    async resultCardCount(): Promise<number> {
        return this.resultCards.count();
    }

    /** Card titles in render order — the observable output of a sort or filter. */
    async resultCardNames(): Promise<string[]> {
        const names = await this.resultCardNameCells.allTextContents();
        return names.map(n => n.trim());
    }

    // ---------------------------------------------------------------------
    // Sheet results ("Sheets With <ref>")
    // ---------------------------------------------------------------------

    /**
     * Sheet hits render as `.result.sheetResult` (SearchSheetResult.jsx:43), not
     * as the `.searchResultCard` used by the entity tabs — different component,
     * different class. Same `.content.searchContent` wrapper, though, because
     * `SheetsWithRefLayout` copied it from SearchPage.jsx.
     */
    private get sheetResults() {
        return this.searchContent.locator('.result.sheetResult');
    }

    /** Wait for at least one sheet result to actually render (CLAUDE.md §2.11). */
    async waitForSheetResults() {
        await expect(this.searchContent).toBeVisible({ timeout: t(20000) });
        await expect(this.sheetResults.first()).toBeVisible({ timeout: t(30000) });
    }

    async sheetResultCount(): Promise<number> {
        return this.sheetResults.count();
    }

    // ---------------------------------------------------------------------
    // Sort dropdown
    // ---------------------------------------------------------------------

    private async openSortDropdown() {
        const trigger = this.sortTrigger;
        await expect(trigger).toBeVisible({ timeout: t(15000) });
        if (await trigger.getAttribute('aria-expanded') !== 'true') {
            await trigger.click();
        }
        await expect(trigger).toHaveAttribute('aria-expanded', 'true', { timeout: t(5000) });
    }

    /**
     * The English sort-option names offered on the active tab, in menu order.
     * Read from each row's `aria-label` rather than its visible text: the option
     * table hardcodes BOTH an `.int-en` and an `.int-he` span (Misc.jsx:523-524)
     * and hides one with CSS, so textContent would concatenate the two languages.
     */
    async sortOptionNames(): Promise<string[]> {
        await this.openSortDropdown();
        const rows = this.sortOptionList.getByRole('row');
        await expect(rows.first()).toBeVisible({ timeout: t(5000) });
        const labels = await rows.evaluateAll(els => els.map(el => el.getAttribute('aria-label') || ''));
        return labels.map(l => l.replace(/^Sort by /, ''));
    }

    /** Open the sort menu and pick an option by its English name. */
    async setSort(optionName: string) {
        await this.openSortDropdown();
        const option = this.sortOptionList.getByRole('row', { name: `Sort by ${optionName}`, exact: true });
        await expect(option).toBeVisible({ timeout: t(5000) });
        await option.click();
        await expect(this.sortTrigger).toHaveAttribute('aria-expanded', 'false', { timeout: t(5000) });
    }

    async currentSortLabel(): Promise<string> {
        const label = await this.sortTrigger.getAttribute('aria-label');
        return (label || '').replace(/^Sort by /, '');
    }

    // ---------------------------------------------------------------------
    // Books-tab category filter
    // ---------------------------------------------------------------------

    /**
     * Toggle a top-level category checkbox in the Books sidebar.
     *
     * The `<input type="checkbox">` is `display: none` (s2.css:4376) so the styled
     * `<label>` is the real click target. Its `aria-label` is assembled in code as
     * plain English (SearchFilters.jsx:265) and never passed through `Sefaria._()`,
     * which makes it a safe anchor in either interface language. The element is
     * pinned to `label[...]` because the adjacent `.searchFilterTitle` span carries
     * the identical aria-label.
     */
    async toggleBookCategoryFilter(category: string) {
        const label = this.filterSidebar.locator(
            `label[aria-label="Press enter to toggle search filter for ${category}."]`
        );
        await expect(label).toBeVisible({ timeout: t(15000) });
        await label.click();
    }

    // ---------------------------------------------------------------------
    // Infinite scroll
    // ---------------------------------------------------------------------

    /**
     * Drive the infinite-scroll trigger by scrolling the results container to the
     * bottom. The synthetic `scroll` dispatch makes the trigger deterministic even
     * if the container happens to already be at its maximum offset — jQuery's
     * `.on('scroll')` binding is a plain `addEventListener`, so it fires.
     *
     * `times > 1` emits several scroll events back-to-back with no await between
     * them, which is how a broken in-flight guard would show up as duplicate
     * network calls.
     */
    async scrollResultsToBottom(times = 1) {
        await this.searchContent.evaluate((el: HTMLElement, n: number) => {
            for (let i = 0; i < n; i++) {
                el.scrollTop = el.scrollHeight;
                el.dispatchEvent(new Event('scroll'));
            }
        }, times);
    }

    // ---------------------------------------------------------------------
    // NoSearchResults null state (NoSearchResults.jsx)
    // Renders inside the active tab panel when hits === 0 (entity tabs) or
    // totalResults.getValue() === 0 (sources tab).
    // ---------------------------------------------------------------------

    private get nullState() {
        return this.searchContent.locator('.noSearchResults');
    }

    /** Wait for the NoSearchResults component to appear in the active tab. */
    async waitForNullState(): Promise<void> {
        await expect(this.nullState).toBeVisible({ timeout: t(25000) });
    }

    /** href of the CTA link in the null state (e.g. "/texts", "/people", "/topics"). */
    async nullStateCtaHref(): Promise<string | null> {
        const cta = this.nullState.locator('.noSearchResults-cta');
        await expect(cta).toBeVisible({ timeout: t(5000) });
        return cta.getAttribute('href');
    }

    /** Full text content of the heading (includes the interpolated search query). */
    async nullStateHeadingText(): Promise<string> {
        const heading = this.nullState.locator('.noSearchResults-heading');
        await expect(heading).toBeVisible({ timeout: t(5000) });
        return (await heading.textContent()) ?? '';
    }

    /**
     * href values of the two caption links in render order:
     *   [0] report-bug link
     *   [1] contact-us link
     */
    async nullStateCaptionLinkHrefs(): Promise<string[]> {
        const links = this.nullState.locator('a.noSearchResults-captionLink');
        await expect(links.first()).toBeVisible({ timeout: t(5000) });
        return links.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
    }
}
