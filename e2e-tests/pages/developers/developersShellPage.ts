import { expect, Locator, Page } from '@playwright/test';
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
} from './developersCommon';

/**
 * A stand-in for gtag.js, served only when the real script cannot be fetched (an offline sandbox or a
 * local run). It reads the same `dataLayer` commands the real library does and sends each event as a
 * GA4 `g/collect` hit, which captureAnalytics() then intercepts. Like the real library, a `config`
 * command without `send_page_view: false` sends an automatic page_view, so a missing flag still
 * shows up as a duplicate.
 */
const GTAG_STANDIN = `(() => {
  const ids = [];
  const send = (id, name, params) => {
    const q = new URLSearchParams({ v: '2', tid: id, en: name, dl: location.href, dt: document.title });
    for (const [key, value] of Object.entries(params || {})) {
      if (key === 'page_location') q.set('dl', String(value));
      else if (key === 'page_title') q.set('dt', String(value));
      else if (key !== 'send_to') q.set((typeof value === 'number' ? 'epn.' : 'ep.') + key, String(value));
    }
    fetch('https://www.google-analytics.com/g/collect?' + q.toString(), { method: 'POST', keepalive: true }).catch(() => {});
  };
  const run = (args) => {
    const [command, a, b] = Array.from(args);
    if (command === 'config') {
      ids.push(a);
      if (!b || b.send_page_view !== false) send(a, 'page_view', {});
    } else if (command === 'event') {
      const targets = b && b.send_to ? [].concat(b.send_to) : ids;
      for (const id of targets) send(id, a, b);
    }
  };
  const layer = (window.dataLayer = window.dataLayer || []);
  layer.forEach(run);
  const push = layer.push.bind(layer);
  layer.push = (...items) => { items.forEach(run); return push(...items); };
})();`;

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

  // ---- Locators (accessible names from contract C6) ----------------------------------------

  private get header() {
    return this.page.getByRole('banner');
  }

  private get primaryNav() {
    return this.page.getByRole('navigation', { name: 'Primary navigation' });
  }

  private get main() {
    return this.page.getByRole('main');
  }

  private get sidebar() {
    return this.page.getByRole('navigation', { name: 'Secondary navigation' });
  }

  private get sidebarFilter() {
    return this.page.getByRole('searchbox', { name: 'Filter pages' });
  }

  private get pagination() {
    return this.page.getByRole('navigation', { name: 'Pagination Controls' });
  }

  private get feedbackComment() {
    return this.page.getByRole('textbox', { name: 'Leave an optional comment…' });
  }

  private get mobileMenuButton() {
    return this.header.getByRole('button', { name: 'Toggle navigation menu' });
  }

  /** C6 MobileSubnav: the header button named by the page title (it has no aria-label of its own). */
  private get mobileSubnavButton() {
    return this.header.locator('button[aria-expanded]:not([aria-label])').first();
  }

  private discordLink(placement: DiscordPlacement) {
    // Several "Join our Discord" links share one name; the C8 placement attribute tells them apart.
    return this.page
      .getByRole('link', { name: 'Join our Discord' })
      .and(this.page.locator(`[data-discord-cta="${placement}"]`));
  }

  private async linkInfo(link: Locator): Promise<LinkInfo> {
    return link.evaluate((a) => ({
      name: (a.getAttribute('aria-label') || (a as HTMLElement).innerText || '').trim(),
      href: a.getAttribute('href') ?? '',
      opensInNewTab: a.getAttribute('target') === '_blank',
    }));
  }

  private async isApple(): Promise<boolean> {
    return this.page.evaluate(() => /mac|iphone|ipad|ipod/i.test(navigator.platform));
  }

  private async clickAndWaitForUrlChange(link: Locator): Promise<void> {
    const before = this.page.url();
    await link.click();
    await this.page.waitForURL((url) => url.toString() !== before, { timeout: t(15000) });
    await this.page.waitForLoadState('domcontentloaded');
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
    const links = this.primaryNav.getByRole('link');
    await expect(links.first()).toBeVisible({ timeout: t(10000) });
    return (await links.allInnerTexts()).map((text) => text.trim());
  }

  /** Where a header link goes and whether it opens a new tab. */
  async headerLink(name: HeaderLink): Promise<LinkInfo> {
    return this.linkInfo(this.primaryNav.getByRole('link', { name, exact: true }));
  }

  /** Click a same-tab header link and wait for the navigation. */
  async clickHeaderLink(name: HeaderLink): Promise<void> {
    await this.clickAndWaitForUrlChange(this.primaryNav.getByRole('link', { name, exact: true }));
  }

  /** Click a header link that opens a new tab; returns the new page (caller closes it). */
  async clickHeaderLinkInNewTab(name: HeaderLink): Promise<Page> {
    const popup = this.page.context().waitForEvent('page', { timeout: t(15000) });
    await this.primaryNav.getByRole('link', { name, exact: true }).click();
    return popup;
  }

  /** The header tab marked active (aria-current), or null on pages with none. */
  async activeHeaderTab(): Promise<HeaderLink | null> {
    await expect(this.primaryNav).toBeVisible({ timeout: t(10000) });
    const current = this.primaryNav.locator('a[aria-current="page"]');
    if ((await current.count()) === 0) return null;
    return (await current.first().innerText()).trim() as HeaderLink;
  }

  /** Open the product switcher ("links menu") and return its items. */
  async openLinksMenu(): Promise<LinkInfo[]> {
    await this.header.getByRole('button', { name: 'Open links menu' }).click();
    const panel = this.page.getByRole('dialog', { name: 'Links menu' });
    await expect(panel.getByRole('link').first()).toBeVisible({ timeout: t(5000) });
    const items: LinkInfo[] = [];
    for (const link of await panel.getByRole('link').all()) items.push(await this.linkInfo(link));
    return items;
  }

  async closeLinksMenu(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('dialog', { name: 'Links menu' })).toBeHidden({ timeout: t(5000) });
  }

  /** The key hint in the header search field: "⌘K" on macOS, "CTRL-K" elsewhere. */
  async searchKeyHint(): Promise<string> {
    const kbd = this.header.getByRole('button', { name: /^Search/ }).locator('kbd');
    await expect(kbd).toBeVisible({ timeout: t(10000) });
    return (await kbd.innerText()).trim();
  }

  /** Tab to the "Jump to Content" skip link and activate it. */
  async useSkipLink(): Promise<void> {
    const skip = this.page.getByRole('link', { name: 'Jump to Content' });
    await expect(skip).toBeAttached({ timeout: t(10000) });
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await this.page.keyboard.press('Tab');
    await expect(skip).toBeFocused({ timeout: t(5000) });
    await this.page.keyboard.press('Enter');
  }

  /** True when focus is inside the main content landmark. */
  async isFocusInMainContent(): Promise<boolean> {
    return this.page.evaluate(() => {
      const main = document.querySelector('main');
      const active = document.activeElement;
      return !!main && !!active && active !== document.body && main.contains(active);
    });
  }

  // ---- Mobile header (≤ 768px) ------------------------------------------------------------

  /** Open the "Toggle navigation menu" drawer and return its link names. */
  async openMobileNav(): Promise<string[]> {
    await this.mobileMenuButton.click();
    await expect(this.mobileMenuButton).toHaveAttribute('aria-expanded', 'true', { timeout: t(5000) });
    const drawerId = await this.mobileMenuButton.getAttribute('aria-controls');
    const links = this.page.locator(`[id="${drawerId}"]`).getByRole('link');
    await expect(links.first()).toBeVisible({ timeout: t(5000) });
    return links.evaluateAll((anchors) =>
      anchors.map((a) =>
        (
          (a as HTMLElement).innerText ||
          a.querySelector('img')?.getAttribute('alt') ||
          a.getAttribute('aria-label') ||
          ''
        ).trim()
      )
    );
  }

  /** Close the drawer with Escape (the drawer covers its own toggle once open). */
  async closeMobileNav(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.mobileMenuButton).toHaveAttribute('aria-expanded', 'false', { timeout: t(5000) });
  }

  /** True when the mobile drawer is open. */
  async isMobileNavOpen(): Promise<boolean> {
    return (await this.mobileMenuButton.getAttribute('aria-expanded')) === 'true';
  }

  /** Open the sidebar dropdown under the mobile header; returns its button label (page title). */
  async openMobileSubnav(): Promise<string> {
    await expect(this.mobileSubnavButton).toBeVisible({ timeout: t(10000) });
    await this.mobileSubnavButton.click();
    await expect(this.mobileSubnavButton).toHaveAttribute('aria-expanded', 'true', { timeout: t(5000) });
    return (await this.mobileSubnavButton.innerText()).trim();
  }

  async closeMobileSubnav(): Promise<void> {
    await this.mobileSubnavButton.click();
    await expect(this.mobileSubnavButton).toHaveAttribute('aria-expanded', 'false', { timeout: t(5000) });
  }

  // ---- Sidebar shared by docs and reference (PLAN §6.2 A) ---------------------------------

  /** Every visible sidebar row, in order. */
  async sidebarItems(): Promise<SidebarItem[]> {
    await expect(this.sidebar.getByRole('link').first()).toBeVisible({ timeout: t(10000) });
    return this.sidebar.getByRole('link').evaluateAll((anchors) => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      return anchors
        .filter((a) => (a as HTMLElement).getClientRects().length > 0)
        .map((a) => {
          const nav = a.closest('nav');
          let lists = 0;
          for (let el = a.parentElement; el && el !== nav; el = el.parentElement) if (el.tagName === 'UL') lists += 1;
          const row = a.closest('li') ?? a.parentElement ?? a;
          const pill = Array.from(a.querySelectorAll('span'))
            .map((s) => (s.textContent ?? '').trim().toUpperCase())
            .find((text) => methods.includes(text));
          const textEl = a.querySelector('[class*="link__text"], [class*="Link-text"]') as HTMLElement | null;
          const href = a.getAttribute('href') ?? '';
          return {
            name: (a.getAttribute('aria-label') || textEl?.innerText || (a as HTMLElement).innerText || '').trim(),
            href,
            depth: Math.max(0, lists - 1),
            method: (pill ?? null) as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | null,
            deprecated: !!row.querySelector('button[aria-label^="Deprecated"]'),
            external: a.getAttribute('target') === '_blank' || /^https?:/.test(href),
            active: a.getAttribute('aria-current') === 'page',
          };
        });
    });
  }

  /** Section headings as rendered (e.g. "WELCOME", "SEFARIA API"). */
  async sidebarSectionHeadings(): Promise<string[]> {
    const headings = this.sidebar.getByRole('heading', { level: 2 });
    await expect(headings.first()).toBeVisible({ timeout: t(10000) });
    // innerText applies the CSS text-transform, so this is the heading as the visitor sees it.
    return (await headings.allInnerTexts()).map((text) => text.trim());
  }

  /** Names of the groups that are currently expanded. */
  async openSidebarGroups(): Promise<string[]> {
    await expect(this.sidebar).toBeVisible({ timeout: t(10000) });
    const labels = await this.sidebar
      .getByRole('button', { name: /^Hide subpages for / })
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? ''));
    return labels.map((label) => label.replace(/^Hide subpages for /, ''));
  }

  /** Click a group's "Show/Hide subpages for X" toggle. */
  async toggleSidebarGroup(name: string): Promise<void> {
    const toggle = this.sidebar
      .getByRole('button', { name: new RegExp(`^(Show|Hide) subpages for ${escapeRegExp(name)}$`) })
      .first();
    const before = await toggle.getAttribute('aria-expanded');
    await toggle.click();
    await expect(toggle).not.toHaveAttribute('aria-expanded', before ?? '', { timeout: t(5000) });
  }

  /** Click a sidebar row by its name (same-tab rows only). */
  async clickSidebarItem(name: string): Promise<void> {
    await this.clickAndWaitForUrlChange(this.sidebar.getByRole('link', { name, exact: true }).first());
  }

  /** Click an external link row; returns the new tab (caller closes it). */
  async clickExternalSidebarItem(name: string): Promise<Page> {
    const popup = this.page.context().waitForEvent('page', { timeout: t(15000) });
    await this.sidebar.getByRole('link', { name, exact: true }).first().click();
    return popup;
  }

  async filterSidebar(text: string): Promise<void> {
    await this.sidebarFilter.fill(text);
  }

  async clearSidebarFilter(): Promise<void> {
    await this.sidebarFilter.fill('');
  }

  /** Press Cmd-/ (macOS) or Ctrl-/ to focus the filter. */
  async focusSidebarFilterWithShortcut(): Promise<void> {
    await expect(this.sidebar).toBeVisible({ timeout: t(10000) });
    await this.page.keyboard.press((await this.isApple()) ? 'Meta+/' : 'Control+/');
  }

  async isSidebarFilterFocused(): Promise<boolean> {
    if ((await this.sidebarFilter.count()) === 0) return false;
    return this.sidebarFilter.evaluate((el) => el === document.activeElement);
  }

  /** "Hide sidebar navigation". */
  async collapseSidebar(): Promise<void> {
    await this.page.getByRole('button', { name: 'Hide sidebar navigation' }).click();
    await expect(this.page.getByRole('button', { name: 'Show sidebar navigation' })).toBeVisible({ timeout: t(5000) });
  }

  async expandSidebar(): Promise<void> {
    await this.page.getByRole('button', { name: 'Show sidebar navigation' }).click();
    await expect(this.page.getByRole('button', { name: 'Hide sidebar navigation' })).toBeVisible({ timeout: t(5000) });
  }

  async isSidebarCollapsed(): Promise<boolean> {
    const show = this.page.getByRole('button', { name: 'Show sidebar navigation' });
    const hide = this.page.getByRole('button', { name: 'Hide sidebar navigation' });
    await expect(show.or(hide).first()).toBeVisible({ timeout: t(10000) });
    return show.isVisible();
  }

  /** The sidebar's bounding box; null when it is not rendered (mobile, collapsed). */
  async sidebarBox(): Promise<Box | null> {
    const sidebar = this.sidebar.first();
    if ((await sidebar.count()) === 0 || !(await sidebar.isVisible())) return null;
    return sidebar.boundingBox();
  }

  /** Scroll the article by `pixels` and return the sidebar's top before and after. */
  async scrollArticleAndMeasureSidebarTop(pixels: number): Promise<{ before: number; after: number }> {
    await expect(this.sidebar).toBeVisible({ timeout: t(10000) });
    const before = await this.sidebar.evaluate((el) => el.getBoundingClientRect().top);
    await this.page.evaluate((y) => window.scrollBy(0, y), pixels);
    await expect.poll(() => this.page.evaluate(() => window.scrollY), { timeout: t(5000) }).toBeGreaterThan(0);
    const after = await this.sidebar.evaluate((el) => el.getBoundingClientRect().top);
    return { before, after };
  }

  // ---- Page chrome (PLAN §6.2 F) ----------------------------------------------------------

  private get h1() {
    return this.main.getByRole('heading', { level: 1 }).first();
  }

  /** The page's h1. */
  async pageTitle(): Promise<string> {
    await expect(this.h1).toBeVisible({ timeout: t(10000) });
    return (await this.h1.innerText()).trim();
  }

  /** Number of h1 headings on the page (DEV-A11Y: exactly one). Added by W14. */
  async h1Count(): Promise<number> {
    await expect(this.page.getByRole('heading', { level: 1 }).first()).toBeAttached({ timeout: t(10000) });
    return this.page.getByRole('heading', { level: 1 }).count();
  }

  /** Landmarks present on the page as role → accessible names (C6 page skeleton). Added by W14. */
  async landmarks(): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    for (const role of ['banner', 'main', 'navigation', 'contentinfo', 'complementary', 'article'] as const) {
      const names: string[] = [];
      for (const el of await this.page.getByRole(role).all()) {
        names.push(((await el.getAttribute('aria-label')) ?? (await el.getAttribute('id')) ?? '').trim());
      }
      if (names.length) out[role] = names;
    }
    return out;
  }

  /** The grey excerpt under the title, or null. */
  async pageExcerpt(): Promise<string | null> {
    await expect(this.h1).toBeVisible({ timeout: t(10000) });
    const excerpt = this.page.locator('article#content [class*="excerpt"]').first();
    if ((await excerpt.count()) === 0) return null;
    return (await excerpt.innerText()).trim() || null;
  }

  /** The "Updated N ago" text. */
  async updatedText(): Promise<string> {
    const line = this.main.getByText(/^\s*Updated\b/).first();
    await expect(line).toBeVisible({ timeout: t(10000) });
    return (await line.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The "Pagination Controls" links; either side may be absent. */
  async prevNextLinks(): Promise<{ previous: LinkInfo | null; next: LinkInfo | null }> {
    await expect(this.pagination).toBeAttached({ timeout: t(10000) });
    const previous = this.pagination.getByRole('link', { name: /^Previous Page: / });
    const next = this.pagination.getByRole('link', { name: /^Next Page: / });
    return {
      previous: (await previous.count()) ? await this.linkInfo(previous) : null,
      next: (await next.count()) ? await this.linkInfo(next) : null,
    };
  }

  async clickPrevious(): Promise<void> {
    await this.clickAndWaitForUrlChange(this.pagination.getByRole('link', { name: /^Previous Page: / }));
  }

  async clickNext(): Promise<void> {
    await this.clickAndWaitForUrlChange(this.pagination.getByRole('link', { name: /^Next Page: / }));
  }

  /** Answer "Did this page help you?"; opens the comment box and "Vote" button. */
  async answerFeedback(answer: 'Yes' | 'No'): Promise<void> {
    const name = answer === 'Yes' ? 'Yes, this page helped me' : 'No, this page did not help me';
    const button = this.page.getByRole('button', { name });
    await button.scrollIntoViewIfNeeded({ timeout: t(10000) });
    await button.click();
    await expect(this.feedbackComment).toBeVisible({ timeout: t(5000) });
  }

  async isFeedbackCommentBoxVisible(): Promise<boolean> {
    return this.feedbackComment.isVisible();
  }

  async fillFeedbackComment(text: string): Promise<void> {
    await this.feedbackComment.fill(text);
  }

  /** Click "Vote". Never on live; call interceptFeedback() first on any sandbox. */
  async submitFeedbackVote(): Promise<void> {
    if (new URL(this.page.url()).hostname === 'developers.sefaria.org') {
      throw new Error('submitFeedbackVote never votes on live developers.sefaria.org');
    }
    await this.page.getByRole('button', { name: 'Vote' }).click();
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
    await expect(this.h1.or(this.page.getByRole('heading', { level: 1 }).first())).toBeVisible({ timeout: t(10000) });
    const link = this.discordLink(placement);
    if ((await link.count()) === 0) return null;
    return this.linkInfo(link.first());
  }

  /** Click it; returns the new tab with the Formstack signup form (caller closes it). */
  async clickDiscordButton(placement: DiscordPlacement): Promise<Page> {
    const link = this.discordLink(placement).first();
    await link.scrollIntoViewIfNeeded({ timeout: t(10000) });
    // The signup form is never loaded for real: the new tab's request is answered locally.
    await this.page
      .context()
      .route('**/*formstack.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Formstack</title>' })
      );
    const popup = this.page.context().waitForEvent('page', { timeout: t(15000) });
    await link.click();
    const tab = await popup;
    await tab.waitForLoadState('domcontentloaded', { timeout: t(15000) }).catch(() => undefined);
    return tab;
  }

  // ---- 404 ---------------------------------------------------------------------------------

  /** True when the portal's 404 page is shown. Status is asserted on the navigation response. */
  async isNotFoundPage(): Promise<boolean> {
    const heading = this.page.getByRole('heading', { level: 1, name: 'Page Not Found' });
    try {
      await expect(heading).toBeVisible({ timeout: t(10000) });
    } catch {
      return false;
    }
    return (await this.page.title()) === '404 Not Found';
  }

  // ---- Analytics (DEV-GA) -----------------------------------------------------------------

  /**
   * Intercept GA4 hits (`**\/g/collect*`), answer them 204 so nothing reaches Google, and
   * decode each event: `en` is the name, `ep.*` / `epn.*` are parameters (`dt` and `dl` are
   * reported as `page_title` and `page_location`). Call before the navigation whose events you
   * need. When gtag.js itself cannot be fetched (an offline sandbox), a stand-in that sends the
   * same hits is served instead.
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
          else if (key === 'dt') params.page_title = value;
          else if (key === 'dl') params.page_location = value;
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
    await this.page.route('**/gtag/js*', async (route) => {
      try {
        const response = await route.fetch({ timeout: t(5000) });
        if (response.ok()) return route.fulfill({ response });
      } catch {
        // offline: fall through to the stand-in
      }
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: GTAG_STANDIN });
    });
    return capture;
  }

  // ---- Accessibility (DEV-A11Y) -----------------------------------------------------------

  // ---- Security (DEV-SEC) -------------------------------------------------------------------

  /**
   * Record every `securitypolicyviolation` in this page from the next navigation on (PLAN §6.7 S-4).
   * Read them with cspViolations(). Added by W14.
   */
  async trackCspViolations(): Promise<void> {
    await this.page.addInitScript(() => {
      const w = window as unknown as { __dpCspViolations: string[] };
      w.__dpCspViolations = [];
      document.addEventListener(
        'securitypolicyviolation',
        (e) => w.__dpCspViolations.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`),
        true
      );
    });
  }

  /** The CSP violations recorded in the current document since trackCspViolations(). Added by W14. */
  async cspViolations(): Promise<string[]> {
    return this.page.evaluate(() => (window as unknown as { __dpCspViolations?: string[] }).__dpCspViolations ?? []);
  }

  /** Whether hostile markup with this id became a real element anywhere in the document. Added by W14. */
  async hasElementWithId(id: string): Promise<boolean> {
    return (await this.page.locator(`[id="${id}"]`).count()) > 0;
  }

  /** Whether a script set the given global (a hostile payload's marker). Added by W14. */
  async globalIsSet(name: string): Promise<boolean> {
    return this.page.evaluate((key) => (window as unknown as Record<string, unknown>)[key] !== undefined, name);
  }

  /** The page's localStorage and sessionStorage as JSON text. Added by W14. */
  async storageSnapshot(): Promise<{ local: string; session: string }> {
    return this.page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
  }

  /** Give keyboard focus to a control by its role and accessible name. Added by W14. */
  async focusControl(role: 'button' | 'link', name: string): Promise<void> {
    const control = this.page.getByRole(role, { name, exact: true }).first();
    await expect(control).toBeVisible({ timeout: t(10000) });
    await control.focus();
  }

  /** The accessible name (aria-label, else text) of the focused element, '' for the body. Added by W14. */
  async focusedName(): Promise<string> {
    return this.page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return '';
      return (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').trim();
    });
  }

  /** Text alternatives of the status dots (role="img") on the page. Added by W14. */
  async statusDotNames(): Promise<string[]> {
    return this.page
      .getByRole('img')
      .evaluateAll((imgs) =>
        imgs.filter((i) => i.tagName !== 'IMG' && i.tagName !== 'svg').map((i) => i.getAttribute('aria-label') ?? '')
      );
  }

  /** Run axe (WCAG 2.0, 2.1 and 2.2 A/AA) on the page, or on `include` selectors; returns the violations. */
  async axeViolations(
    options: { include?: string[]; exclude?: string[]; disableRules?: string[] } = {}
  ): Promise<{ id: string; impact: string | null; help: string; targets: string[] }[]> {
    let builder = new AxeBuilder({ page: this.page }).withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'wcag22a',
      'wcag22aa',
    ]);
    for (const selector of options.include ?? []) builder = builder.include(selector);
    for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
    if (options.disableRules?.length) builder = builder.disableRules(options.disableRules);
    // axe runs inside each frame by injecting its script, which a sandbox without allow-scripts (the HTML
    // blocks, PLAN §2.12) forbids, so the run would wait on those frames forever. Their content is the
    // author's HTML; on such pages axe checks the page itself (and the frames' titles) only.
    const scriptless = await this.page.locator('iframe[sandbox]:not([sandbox*="allow-scripts"])').count();
    if (scriptless > 0) builder = builder.setLegacyMode(true);
    const results = await builder.analyze();
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
