import { expect, Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { t } from '../../globals';
import { HttpMethod, SearchResult, SearchTab } from './developersCommon';

const SECTION_TAB: Record<string, SearchTab> = {
  docs: 'Docs',
  reference: 'API Reference',
  custom_pages: 'Pages',
  page: 'Pages',
  pages: 'Pages',
};

/**
 * The search modal (DEV-SRCH; PLAN §2.9 and §6.2 H): opened by Cmd/Ctrl-K or the header field,
 * tabs with counts, method badges, highlighted snippets, 15 results per page, keyboard.
 * Names from contract C6 "Search" (devportal-ui/src/search/SearchDialog.tsx).
 */
export class DevelopersSearchPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  private get dialog() {
    return this.page.getByRole('dialog', { name: 'Search' });
  }

  private get input() {
    return this.dialog.getByRole('searchbox', { name: 'Search' });
  }

  private get resultLinks() {
    return this.dialog.getByRole('list', { name: 'Search results' }).getByRole('link');
  }

  private get pager() {
    return this.dialog.getByRole('navigation', { name: 'Search results pages' });
  }

  /** Press Cmd-K (macOS) or Ctrl-K and wait for the modal. */
  async openWithShortcut(): Promise<void> {
    await expect(this.page.getByRole('banner')).toBeVisible({ timeout: t(10000) });
    const apple = await this.page.evaluate(() => /mac|iphone|ipad|ipod/i.test(navigator.platform));
    await this.page.keyboard.press(apple ? 'Meta+k' : 'Control+k');
    await expect(this.input).toBeVisible({ timeout: t(10000) });
  }

  /** Click the header search field (or the search icon on mobile) and wait for the modal. */
  async openByClick(): Promise<void> {
    await this.page
      .getByRole('banner')
      .getByRole('button', { name: /^Search/ })
      .click();
    await expect(this.input).toBeVisible({ timeout: t(10000) });
  }

  async isOpen(): Promise<boolean> {
    return this.dialog.isVisible();
  }

  /** Close with Escape. */
  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.dialog).toBeHidden({ timeout: t(5000) });
  }

  /** Close with the dialog's "Close" button. Added by W14. */
  async closeWithButton(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(this.dialog).toBeHidden({ timeout: t(5000) });
  }

  /** The empty state's text ("Start typing to search…"), or null when results are shown. */
  async emptyStateText(): Promise<string | null> {
    if ((await this.resultLinks.count()) > 0) return null;
    const panel = this.dialog.getByRole('tabpanel');
    await expect(panel).toBeVisible({ timeout: t(5000) });
    const text = (await panel.innerText()).trim();
    return text || null;
  }

  /** Replace the query and wait for the results to settle. */
  async search(query: string): Promise<void> {
    await this.input.fill(query);
    const panel = this.dialog.getByRole('tabpanel');
    await expect(panel).not.toHaveText(/^\s*Searching…\s*$/, { timeout: t(15000) });
    if (query.trim()) {
      await expect(this.resultLinks.first().or(panel.getByText(/^No search results for/))).toBeVisible({
        timeout: t(15000),
      });
    }
  }

  /** The tabs in order with their counts. */
  async tabs(): Promise<{ name: SearchTab; count: number }[]> {
    const tabs = this.dialog.getByRole('tab');
    await expect(tabs.first()).toBeVisible({ timeout: t(5000) });
    const raw = await tabs.evaluateAll((buttons) =>
      buttons.map((b) => {
        const count = b.querySelector('[class*="count"]');
        const label = (b.textContent ?? '').replace(count?.textContent ?? '', '').trim();
        return { label, count: count ? Number((count.textContent ?? '0').trim()) : null };
      })
    );
    const counted = raw.filter((tab) => tab.count !== null).reduce((sum, tab) => sum + (tab.count ?? 0), 0);
    return raw.map((tab) => ({ name: tab.label as SearchTab, count: tab.count ?? counted }));
  }

  async selectTab(tab: SearchTab): Promise<void> {
    const button = this.dialog.getByRole('tab', { name: new RegExp(`^${tab}( \\d+)?$`) });
    await button.click();
    await expect(button).toHaveAttribute('aria-selected', 'true', { timeout: t(5000) });
  }

  async activeTab(): Promise<SearchTab> {
    const selected = this.dialog.locator('[role="tab"][aria-selected="true"]');
    return (await selected.evaluate((b) => {
      const count = b.querySelector('[class*="count"]');
      return (b.textContent ?? '').replace(count?.textContent ?? '', '').trim();
    })) as SearchTab;
  }

  /** Results on the current page of the active tab. */
  async results(): Promise<SearchResult[]> {
    if ((await this.resultLinks.count()) === 0) return [];
    const rows = await this.resultLinks.evaluateAll((links) =>
      links.map((a) => {
        const snippet = document.getElementById(a.getAttribute('aria-describedby') ?? '');
        const method = a.querySelector('[data-method]');
        return {
          title: a.getAttribute('aria-label') ?? '',
          path: a.getAttribute('href') ?? '',
          section: a.getAttribute('data-section') ?? '',
          method: method ? (method.textContent ?? '').trim().toUpperCase() : null,
          snippet: (snippet?.textContent ?? '').trim(),
          highlighted: Array.from(snippet?.querySelectorAll('mark') ?? []).map((m) => (m.textContent ?? '').trim()),
        };
      })
    );
    return rows.map((row) => ({
      ...row,
      section: SECTION_TAB[row.section] ?? (row.section as SearchTab),
      method: row.method as HttpMethod | null,
    }));
  }

  /** "Back · 1 of N · Next" as numbers; null when there is one page. */
  async pageIndicator(): Promise<{ current: number; total: number } | null> {
    if ((await this.pager.count()) === 0) return null;
    const text = await this.pager.innerText();
    const m = text.match(/(\d+)\s+of\s+(\d+)/);
    return m ? { current: Number(m[1]), total: Number(m[2]) } : null;
  }

  async nextPage(): Promise<void> {
    const before = await this.pageIndicator();
    await this.pager.getByRole('button', { name: 'Next' }).click();
    await expect
      .poll(async () => (await this.pageIndicator())?.current, { timeout: t(5000) })
      .not.toBe(before?.current);
  }

  async previousPage(): Promise<void> {
    const before = await this.pageIndicator();
    await this.pager.getByRole('button', { name: 'Back' }).click();
    await expect
      .poll(async () => (await this.pageIndicator())?.current, { timeout: t(5000) })
      .not.toBe(before?.current);
  }

  /** Press an arrow key `times` times in the modal. */
  async pressArrow(direction: 'Down' | 'Up', times = 1): Promise<void> {
    for (let i = 0; i < times; i += 1) await this.input.press(`Arrow${direction}`);
  }

  /** Index (0-based) of the highlighted result, or -1. */
  async activeResultIndex(): Promise<number> {
    return this.resultLinks.evaluateAll((links) => links.findIndex((a) => a.getAttribute('data-active') === 'true'));
  }

  /** Press Enter on the highlighted result and wait for the navigation. */
  async openActiveResult(): Promise<void> {
    const before = this.page.url();
    await this.input.press('Enter');
    await this.page.waitForURL((url) => url.toString() !== before, { timeout: t(15000) });
  }

  /** Click result `index` and wait for the navigation. */
  async chooseResult(index: number): Promise<void> {
    const before = this.page.url();
    await this.resultLinks.nth(index).click();
    await this.page.waitForURL((url) => url.toString() !== before, { timeout: t(15000) });
  }

  /** True if an "Ask AI" control exists anywhere in the modal (it must not). */
  async hasAskAi(): Promise<boolean> {
    await expect(this.dialog).toBeVisible({ timeout: t(5000) });
    return (await this.dialog.getByText(/Ask AI/i).count()) > 0;
  }

  /** True when focus is in the modal's search field. Added by W14. */
  async isInputFocused(): Promise<boolean> {
    return this.input.evaluate((el) => el === document.activeElement);
  }
}
