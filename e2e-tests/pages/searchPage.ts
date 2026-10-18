import { Page, expect } from "@playwright/test"
import { t } from "../globals"
import { HelperBase } from "./helperBase"
import { sefariaString, escapeRegExp } from "../support/assistantStrings"

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

    /**
     * The visible category rows as `{category: count}`.
     *
     * Each row renders its title and its `(N)` count inside one `.searchFilterTitle`
     * span (SearchFilters.jsx), separated by a non-breaking space. N is the number
     * the API reported in `categoryCounts` — how many books match the query in that
     * category across the whole result set, not how many are currently on screen.
     */
    async bookCategoryCounts(): Promise<Record<string, number>> {
        const texts = await this.filterSidebar.locator('.searchFilterTitle').allTextContents();
        const counts: Record<string, number> = {};
        texts.forEach((text) => {
            const match = text.trim().match(/^(.*?)\s*\((\d+)\)$/);
            if (match) { counts[match[1].trim()] = Number(match[2]); }
        });
        return counts;
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
     * The body text under the heading, with non-breaking spaces turned into normal
     * spaces and runs of spaces collapsed — so a design that keeps two words together
     * with a non-breaking space still compares equal to the translation string.
     */
    async nullStateBodyText(): Promise<string> {
        const body = this.nullState.locator('.noSearchResults-body');
        await expect(body).toBeVisible({ timeout: t(5000) });
        const text = (await body.textContent()) ?? '';
        return text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    }

    /**
     * Every button-like control in the null state other than the two caption links
     * ("Report a bug" / "contact us"), as hrefs. The Browse CTA is an `<a>` styled as a
     * button, so it counts; a real `<button>` would be listed as "(button)". A link inside
     * the body text (the assistant's name, LA-NULL-16) is part of the sentence, not a
     * button, so it doesn't count either.
     */
    async nullStateButtonHrefs(): Promise<string[]> {
        await expect(this.nullState).toBeVisible({ timeout: t(5000) });
        const links = await this.nullState.getByRole('link').evaluateAll((els) =>
            els.filter((el) => !el.closest('.noSearchResults-caption, .noSearchResults-body')).map((el) => el.getAttribute('href') ?? ''));
        const buttons = await this.nullState.getByRole('button').count();
        return [...links, ...Array(buttons).fill('(button)')];
    }

    /**
     * How many lines of the body text `phrase` is spread over (1 = it never breaks).
     * Measured with a DOM Range around the phrase: a Range returns one box per line it
     * touches, so boxes at different heights mean the phrase wrapped. Returns 0 when the
     * phrase isn't in the body at all.
     */
    async nullStateLinesUsedBy(phrase: string): Promise<number> {
        const body = this.nullState.locator('.noSearchResults-body');
        await expect(body).toBeVisible({ timeout: t(5000) });
        return body.evaluate((el, wanted) => {
            const norm = (s: string) => s.replace(/ /g, ' ');
            // Join every text node, remembering where each one starts.
            const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            const pieces: { node: Text; start: number }[] = [];
            let all = '';
            let node: Node | null;
            while ((node = walker.nextNode())) {
                pieces.push({ node: node as Text, start: all.length });
                all += norm(node.textContent || '');
            }
            const from = all.indexOf(norm(wanted));
            if (from < 0) return 0;
            const to = from + wanted.length;
            const at = (offset: number) => {
                const piece = [...pieces].reverse().find((p) => p.start <= offset)!;
                return { node: piece.node, offset: offset - piece.start };
            };
            const range = el.ownerDocument.createRange();
            const a = at(from);
            const b = at(to);
            range.setStart(a.node, a.offset);
            range.setEnd(b.node, b.offset);
            const tops = new Set(Array.from(range.getClientRects())
                .filter((r) => r.width > 0)
                .map((r) => Math.round(r.top)));
            return tops.size;
        }, phrase);
    }

    /**
     * "Library Assistant" (עוזר הספרייה) in the body text — a link when the assistant is
     * on (LA-NULL-16). Found by its name, read by translation key. The page may join the
     * two words with a non-breaking space, so any space between them matches.
     */
    private get nullStateAssistantLink() {
        const words = sefariaString('header.library_assistant', this.language).split(/\s+/).map(escapeRegExp);
        return this.nullState.locator('.noSearchResults-body')
            .getByRole('link', { name: new RegExp(`^\\s*${words.join('\\s+')}\\s*$`) });
    }

    async expectNullStateAssistantLink(): Promise<void> {
        await expect(this.nullStateAssistantLink).toBeVisible({ timeout: t(5000) });
    }

    /** LA-NULL-16: the assistant link's text color, and whether it is underlined. */
    async nullStateAssistantLinkLook(): Promise<{ color: string; underlined: boolean }> {
        await this.expectNullStateAssistantLink();
        return this.nullStateAssistantLink.evaluate((el) => {
            const cs = getComputedStyle(el);
            return { color: cs.color, underlined: cs.textDecorationLine.includes('underline') };
        });
    }

    /** LA-NULL-17: click the assistant's name in the body text. */
    async clickNullStateAssistantLink(): Promise<void> {
        await this.expectNullStateAssistantLink();
        await this.nullStateAssistantLink.click();
    }

    /**
     * LA-NULL-16: which line of the body text (1 = the first line) each of these is on:
     *  - `orLine`: the last `orWord` ("or" / "או") before `phrase`
     *  - `afterOrLine`: the first word after that `orWord`
     *  - `phraseLine`: the start of `phrase` (the assistant's name)
     * Every character's height on screen tells the lines apart. Returns null when
     * `phrase`, or an `orWord` before it, isn't in the text.
     */
    private async nullStateLinesAroundLastOr(orWord: string, phrase: string): Promise<{ orLine: number; afterOrLine: number; phraseLine: number } | null> {
        const body = this.nullState.locator('.noSearchResults-body');
        await expect(body).toBeVisible({ timeout: t(5000) });
        return body.evaluate((el, [or, wanted]) => {
            const norm = (s: string) => s.replace(/ /g, ' ');
            // Join every text node, remembering where each one starts.
            const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            const pieces: { node: Text; start: number }[] = [];
            let all = '';
            let node: Node | null;
            while ((node = walker.nextNode())) {
                pieces.push({ node: node as Text, start: all.length });
                all += norm(node.textContent || '');
            }
            const phraseAt = all.lastIndexOf(norm(wanted));
            if (phraseAt < 0) return null;
            const orMatch = [...all.slice(0, phraseAt).matchAll(new RegExp(`(^|\\s)${or}(?=\\s)`, 'g'))].pop();
            if (!orMatch) return null;
            const orAt = orMatch.index! + orMatch[1].length;
            let afterOrAt = orAt + or.length;
            while (afterOrAt < all.length && /\s/.test(all[afterOrAt])) afterOrAt++;

            // Height on screen of the character at `offset` in the joined text.
            const topOf = (offset: number): number | null => {
                const piece = [...pieces].reverse().find((p) => p.start <= offset)!;
                const range = el.ownerDocument.createRange();
                range.setStart(piece.node, offset - piece.start);
                range.setEnd(piece.node, offset - piece.start + 1);
                const rect = Array.from(range.getClientRects()).find((r) => r.width > 0);
                return rect ? rect.top : null;
            };
            // Every line's height, from every visible character; lines closer than 4px are the same line.
            const lineTops: number[] = [];
            for (let i = 0; i < all.length; i++) {
                if (/\s/.test(all[i])) continue;
                const top = topOf(i);
                if (top !== null && !lineTops.some((l) => Math.abs(l - top) < 4)) lineTops.push(top);
            }
            lineTops.sort((a, b) => a - b);
            const lineOf = (offset: number) => {
                const top = topOf(offset);
                return top === null ? 0 : lineTops.findIndex((l) => Math.abs(l - top) < 4) + 1;
            };
            return { orLine: lineOf(orAt), afterOrLine: lineOf(afterOrAt), phraseLine: lineOf(phraseAt) };
        }, [orWord, phrase] as const);
    }

    /**
     * LA-NULL-16: the body text breaks right after its last `orWord` ("or" / "או"), so the
     * words after it, including the assistant's name, start the next line.
     */
    async expectLineBreakAfterLastOr(orWord: string): Promise<void> {
        const name = sefariaString('header.library_assistant', this.language);
        const lines = await this.nullStateLinesAroundLastOr(orWord, name);
        expect(lines, `the text should have "${orWord}" before "${name}"`).not.toBeNull();
        expect(lines!.afterOrLine, `the line should break right after the last "${orWord}"`).toBe(lines!.orLine + 1);
        expect(lines!.phraseLine, `"${name}" should be on the line that starts after "${orWord}"`).toBe(lines!.afterOrLine);
    }

    /** LA-NULL-19: scroll everything that holds the empty-search box all the way down. */
    async scrollNullStateToBottom(): Promise<void> {
        await expect(this.nullState).toBeVisible({ timeout: t(5000) });
        await this.nullState.evaluate((el) => {
            for (let box: HTMLElement | null = el.parentElement; box; box = box.parentElement) {
                if (box.scrollHeight > box.clientHeight + 1) box.scrollTop = box.scrollHeight;
            }
            window.scrollTo(0, el.ownerDocument.documentElement.scrollHeight);
        });
    }

    /** LA-NULL-19: where, from the top of the window, the last line of text in the empty-search box ends. */
    async nullStateTextBottom(): Promise<number> {
        const content = this.nullState.locator('.noSearchResults-content');
        await expect(content).toBeVisible({ timeout: t(5000) });
        return content.evaluate((el) => {
            const range = el.ownerDocument.createRange();
            range.selectNodeContents(el);
            const lines = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
            return Math.max(...lines.map((r) => r.bottom));
        });
    }

    // ---------------------------------------------------------------------
    // Running a search
    // ---------------------------------------------------------------------

    /**
     * Type into Sefaria's header search box (desktop header) and press Enter, the
     * way a visitor does — the page changes without a full reload. The box's
     * accessible name is read by translation key, so this works in Hebrew too.
     */
    async submitHeaderSearch(query: string): Promise<void> {
        const box = this.page.locator('div.header[role="banner"]').getByRole('combobox', {
            name: sefariaString('common.search_for_texts_or_keywords_here', this.language),
        });
        await expect(box).toBeVisible({ timeout: t(10000) });
        await box.click();
        await box.fill(query);
        await box.press('Enter');
        await expect(this.page).toHaveURL(/\/search\?/, { timeout: t(15000) });
    }

    /** Search again from the search box at the top of the search results page itself. */
    async submitSearchFromResultsPage(query: string): Promise<void> {
        const box = this.searchContent.getByRole('search').getByRole('textbox', {
            name: sefariaString('common.search_for_texts_or_keywords_here', this.language),
        });
        await expect(box).toBeVisible({ timeout: t(10000) });
        await box.fill(query);
        await box.press('Enter');
        await expect(this.page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(query)}`), { timeout: t(15000) });
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
