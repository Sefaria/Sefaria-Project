import { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { HelperBase } from '../helperBase';
import { hideAllModalsAndPopups } from '../../utils';
import { t } from '../../globals';
import {
  Box,
  DiscordPlacement,
  Ga4Capture,
  Ga4Event,
  HeaderLink,
  LinkInfo,
  RequestCapture,
  SidebarItem,
  developersUrl,
  interceptRequests,
  notImplemented,
} from './developersCommon';

/**
 * The portal chrome shared by every page (DEV-HDR, and the shared parts of DEV-REF / DEV-DOC /
 * DEV-GA / DEV-A11Y): header, links menu, skip link, mobile drawer and sub-nav, the sidebar
 * shared by docs and reference (PLAN §6.2 A), the page footer (§6.2 F), the Discord buttons,
 * the 404 page, GA4 capture and axe.
 */
export class DevelopersShellPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ---- Navigation --------------------------------------------------------------------------

  /** Navigate within the developers host after the test's first entry (goToPageWithLang). */
  async openPath(path: string): Promise<void> {
    await this.page.goto(developersUrl(path), { waitUntil: 'domcontentloaded', timeout: t(30000) });
    await hideAllModalsAndPopups(this.page);
  }

  // ---- Header (DEV-HDR) --------------------------------------------------------------------

  /** Names of the primary-navigation links, in order. */
  async headerLinkNames(): Promise<string[]> {
    return notImplemented('DevelopersShellPage.headerLinkNames');
  }

  /** Where a header link goes and whether it opens a new tab. */
  async headerLink(name: HeaderLink): Promise<LinkInfo> {
    return notImplemented('DevelopersShellPage.headerLink');
  }

  /** Click a same-tab header link and wait for the navigation. */
  async clickHeaderLink(name: HeaderLink): Promise<void> {
    return notImplemented('DevelopersShellPage.clickHeaderLink');
  }

  /** Click a header link that opens a new tab; returns the new page (caller closes it). */
  async clickHeaderLinkInNewTab(name: HeaderLink): Promise<Page> {
    return notImplemented('DevelopersShellPage.clickHeaderLinkInNewTab');
  }

  /** The header tab marked active (aria-current), or null on pages with none. */
  async activeHeaderTab(): Promise<HeaderLink | null> {
    return notImplemented('DevelopersShellPage.activeHeaderTab');
  }

  /** Open the product switcher ("links menu") and return its items. */
  async openLinksMenu(): Promise<LinkInfo[]> {
    return notImplemented('DevelopersShellPage.openLinksMenu');
  }

  async closeLinksMenu(): Promise<void> {
    return notImplemented('DevelopersShellPage.closeLinksMenu');
  }

  /** The key hint in the header search field: "⌘K" on macOS, "CTRL-K" elsewhere. */
  async searchKeyHint(): Promise<string> {
    return notImplemented('DevelopersShellPage.searchKeyHint');
  }

  /** Tab to the "Jump to Content" skip link and activate it. */
  async useSkipLink(): Promise<void> {
    return notImplemented('DevelopersShellPage.useSkipLink');
  }

  /** True when focus is inside the main content landmark. */
  async isFocusInMainContent(): Promise<boolean> {
    return notImplemented('DevelopersShellPage.isFocusInMainContent');
  }

  // ---- Mobile header (≤ 768px) ------------------------------------------------------------

  /** Open the "Toggle navigation menu" drawer and return its link names. */
  async openMobileNav(): Promise<string[]> {
    return notImplemented('DevelopersShellPage.openMobileNav');
  }

  async closeMobileNav(): Promise<void> {
    return notImplemented('DevelopersShellPage.closeMobileNav');
  }

  /** Open the sidebar dropdown under the mobile header; returns its button label (page title). */
  async openMobileSubnav(): Promise<string> {
    return notImplemented('DevelopersShellPage.openMobileSubnav');
  }

  async closeMobileSubnav(): Promise<void> {
    return notImplemented('DevelopersShellPage.closeMobileSubnav');
  }

  // ---- Sidebar shared by docs and reference (PLAN §6.2 A) ---------------------------------

  /** Every visible sidebar row, in order. */
  async sidebarItems(): Promise<SidebarItem[]> {
    return notImplemented('DevelopersShellPage.sidebarItems');
  }

  /** Section headings as rendered (e.g. "WELCOME", "SEFARIA API"). */
  async sidebarSectionHeadings(): Promise<string[]> {
    return notImplemented('DevelopersShellPage.sidebarSectionHeadings');
  }

  /** Names of the groups that are currently expanded. */
  async openSidebarGroups(): Promise<string[]> {
    return notImplemented('DevelopersShellPage.openSidebarGroups');
  }

  /** Click a group's "Show/Hide subpages for X" toggle. */
  async toggleSidebarGroup(name: string): Promise<void> {
    return notImplemented('DevelopersShellPage.toggleSidebarGroup');
  }

  /** Click a sidebar row by its name (same-tab rows only). */
  async clickSidebarItem(name: string): Promise<void> {
    return notImplemented('DevelopersShellPage.clickSidebarItem');
  }

  /** Click an external link row; returns the new tab (caller closes it). */
  async clickExternalSidebarItem(name: string): Promise<Page> {
    return notImplemented('DevelopersShellPage.clickExternalSidebarItem');
  }

  async filterSidebar(text: string): Promise<void> {
    return notImplemented('DevelopersShellPage.filterSidebar');
  }

  async clearSidebarFilter(): Promise<void> {
    return notImplemented('DevelopersShellPage.clearSidebarFilter');
  }

  /** Press Cmd-/ (macOS) or Ctrl-/ to focus the filter. */
  async focusSidebarFilterWithShortcut(): Promise<void> {
    return notImplemented('DevelopersShellPage.focusSidebarFilterWithShortcut');
  }

  async isSidebarFilterFocused(): Promise<boolean> {
    return notImplemented('DevelopersShellPage.isSidebarFilterFocused');
  }

  /** "Hide sidebar navigation". */
  async collapseSidebar(): Promise<void> {
    return notImplemented('DevelopersShellPage.collapseSidebar');
  }

  async expandSidebar(): Promise<void> {
    return notImplemented('DevelopersShellPage.expandSidebar');
  }

  async isSidebarCollapsed(): Promise<boolean> {
    return notImplemented('DevelopersShellPage.isSidebarCollapsed');
  }

  /** The sidebar's bounding box; null when it is not rendered (mobile, collapsed). */
  async sidebarBox(): Promise<Box | null> {
    return notImplemented('DevelopersShellPage.sidebarBox');
  }

  /** Scroll the article by `pixels` and return the sidebar's top before and after. */
  async scrollArticleAndMeasureSidebarTop(pixels: number): Promise<{ before: number; after: number }> {
    return notImplemented('DevelopersShellPage.scrollArticleAndMeasureSidebarTop');
  }

  // ---- Page chrome (PLAN §6.2 F) ----------------------------------------------------------

  /** The page's h1. */
  async pageTitle(): Promise<string> {
    return notImplemented('DevelopersShellPage.pageTitle');
  }

  /** The grey excerpt under the title, or null. */
  async pageExcerpt(): Promise<string | null> {
    return notImplemented('DevelopersShellPage.pageExcerpt');
  }

  /** The "Updated N ago" text. */
  async updatedText(): Promise<string> {
    return notImplemented('DevelopersShellPage.updatedText');
  }

  /** The "Pagination Controls" links; either side may be absent. */
  async prevNextLinks(): Promise<{ previous: LinkInfo | null; next: LinkInfo | null }> {
    return notImplemented('DevelopersShellPage.prevNextLinks');
  }

  async clickPrevious(): Promise<void> {
    return notImplemented('DevelopersShellPage.clickPrevious');
  }

  async clickNext(): Promise<void> {
    return notImplemented('DevelopersShellPage.clickNext');
  }

  /** Answer "Did this page help you?"; opens the comment box and "Vote" button. */
  async answerFeedback(answer: 'Yes' | 'No'): Promise<void> {
    return notImplemented('DevelopersShellPage.answerFeedback');
  }

  async isFeedbackCommentBoxVisible(): Promise<boolean> {
    return notImplemented('DevelopersShellPage.isFeedbackCommentBoxVisible');
  }

  async fillFeedbackComment(text: string): Promise<void> {
    return notImplemented('DevelopersShellPage.fillFeedbackComment');
  }

  /** Click "Vote". Never on live; call interceptFeedback() first on any sandbox. */
  async submitFeedbackVote(): Promise<void> {
    return notImplemented('DevelopersShellPage.submitFeedbackVote');
  }

  /** Fulfil POST /_portal/feedback locally (200) and record each request. */
  async interceptFeedback(): Promise<RequestCapture> {
    return interceptRequests(this.page, '**/_portal/feedback', {
      status: 200,
      contentType: 'application/json',
      body: '{"ok":true}',
    });
  }

  // ---- Discord buttons (brief §4.7) -------------------------------------------------------

  /** The "Join the Discord" button at a placement on the current page, or null if absent. */
  async discordButton(placement: DiscordPlacement): Promise<LinkInfo | null> {
    return notImplemented('DevelopersShellPage.discordButton');
  }

  /** Click it; returns the new tab with the Formstack signup form (caller closes it). */
  async clickDiscordButton(placement: DiscordPlacement): Promise<Page> {
    return notImplemented('DevelopersShellPage.clickDiscordButton');
  }

  // ---- 404 ---------------------------------------------------------------------------------

  /** True when the portal's 404 page is shown. Status is asserted on the navigation response. */
  async isNotFoundPage(): Promise<boolean> {
    return notImplemented('DevelopersShellPage.isNotFoundPage');
  }

  // ---- Analytics (DEV-GA) -----------------------------------------------------------------

  /**
   * Intercept GA4 hits (`**\/g/collect*`), answer them 204 so nothing reaches Google, and
   * decode each event: `en` is the name, `ep.*` / `epn.*` are parameters. Call before the
   * navigation whose events you need.
   */
  async captureAnalytics(): Promise<Ga4Capture> {
    const capture: { events: Ga4Event[] } = { events: [] };
    const decode = (query: string, shared: URLSearchParams) => {
      const own = new URLSearchParams(query);
      const name = own.get('en') ?? shared.get('en');
      if (!name) return;
      const params: Record<string, string> = {};
      for (const source of [shared, own]) {
        source.forEach((value, key) => {
          const m = key.match(/^epn?\.(.+)$/);
          if (m) params[m[1]] = value;
        });
      }
      capture.events.push({ name, params });
    };
    await this.page.route('**/g/collect*', async (route) => {
      const request = route.request();
      const shared = new URL(request.url()).searchParams;
      const body = request.postData();
      const lines = body ? body.split(/\r?\n/).filter((line) => line.trim()) : [];
      if (lines.length) lines.forEach((line) => decode(line, shared));
      else decode('', shared);
      await route.fulfill({ status: 204, body: '' });
    });
    return capture;
  }

  // ---- Accessibility (DEV-A11Y) -----------------------------------------------------------

  /** Run axe (WCAG 2.1 A/AA) on the page, or on `include` selectors; returns the violations. */
  async axeViolations(
    options: { include?: string[]; exclude?: string[]; disableRules?: string[] } = {}
  ): Promise<{ id: string; impact: string | null; help: string; targets: string[] }[]> {
    let builder = new AxeBuilder({ page: this.page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    for (const selector of options.include ?? []) builder = builder.include(selector);
    for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
    if (options.disableRules?.length) builder = builder.disableRules(options.disableRules);
    const results = await builder.analyze();
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));
  }
}
