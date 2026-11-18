import { Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { SearchResult, SearchTab, notImplemented } from './developersCommon';

/**
 * The search modal (DEV-SRCH; PLAN §2.9 and §6.2 H): opened by Cmd/Ctrl-K or the header field,
 * tabs with counts, method badges, highlighted snippets, 15 results per page, keyboard.
 */
export class DevelopersSearchPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  /** Press Cmd-K (macOS) or Ctrl-K and wait for the modal. */
  async openWithShortcut(): Promise<void> {
    return notImplemented('DevelopersSearchPage.openWithShortcut');
  }

  /** Click the header search field (or the search icon on mobile) and wait for the modal. */
  async openByClick(): Promise<void> {
    return notImplemented('DevelopersSearchPage.openByClick');
  }

  async isOpen(): Promise<boolean> {
    return notImplemented('DevelopersSearchPage.isOpen');
  }

  /** Close with Escape. */
  async close(): Promise<void> {
    return notImplemented('DevelopersSearchPage.close');
  }

  /** The empty state's text ("Start typing to search…"), or null when results are shown. */
  async emptyStateText(): Promise<string | null> {
    return notImplemented('DevelopersSearchPage.emptyStateText');
  }

  /** Replace the query and wait for the results to settle. */
  async search(query: string): Promise<void> {
    return notImplemented('DevelopersSearchPage.search');
  }

  /** The tabs in order with their counts. */
  async tabs(): Promise<{ name: SearchTab; count: number }[]> {
    return notImplemented('DevelopersSearchPage.tabs');
  }

  async selectTab(tab: SearchTab): Promise<void> {
    return notImplemented('DevelopersSearchPage.selectTab');
  }

  async activeTab(): Promise<SearchTab> {
    return notImplemented('DevelopersSearchPage.activeTab');
  }

  /** Results on the current page of the active tab. */
  async results(): Promise<SearchResult[]> {
    return notImplemented('DevelopersSearchPage.results');
  }

  /** "Back · 1 of N · Next" as numbers; null when there is one page. */
  async pageIndicator(): Promise<{ current: number; total: number } | null> {
    return notImplemented('DevelopersSearchPage.pageIndicator');
  }

  async nextPage(): Promise<void> {
    return notImplemented('DevelopersSearchPage.nextPage');
  }

  async previousPage(): Promise<void> {
    return notImplemented('DevelopersSearchPage.previousPage');
  }

  /** Press an arrow key `times` times in the modal. */
  async pressArrow(direction: 'Down' | 'Up', times?: number): Promise<void> {
    return notImplemented('DevelopersSearchPage.pressArrow');
  }

  /** Index (0-based) of the highlighted result, or -1. */
  async activeResultIndex(): Promise<number> {
    return notImplemented('DevelopersSearchPage.activeResultIndex');
  }

  /** Press Enter on the highlighted result and wait for the navigation. */
  async openActiveResult(): Promise<void> {
    return notImplemented('DevelopersSearchPage.openActiveResult');
  }

  /** Click result `index` and wait for the navigation. */
  async chooseResult(index: number): Promise<void> {
    return notImplemented('DevelopersSearchPage.chooseResult');
  }

  /** True if an "Ask AI" control exists anywhere in the modal (it must not). */
  async hasAskAi(): Promise<boolean> {
    return notImplemented('DevelopersSearchPage.hasAskAi');
  }
}
