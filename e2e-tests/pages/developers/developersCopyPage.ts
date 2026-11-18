import { expect, Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { t } from '../../globals';
import { CopyPageAction, HttpResult, McpMethod, developersUrl } from './developersCommon';

/** The external assistants are never loaded: their tab's first request is recorded and aborted. */
const ASSISTANT_HOSTS = /^https:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai)\//;

/**
 * The Copy Page menu and the rest of the agent surface (DEV-AI, DEV-MCP; PLAN §2.10 and
 * §6.2 I): the eight menu actions, the hidden "For AI agents" banner, and plain HTTP checks of
 * `.md` pages, `Accept` negotiation, `llms` files, `Link` headers, discovery files and `/mcp`.
 * The HTTP helpers use the page's request context, so they share its cookies.
 */
export class DevelopersCopyPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ---- Locators (contract C6 "Article header and right rail") --------------------------------

  private get copyButton() {
    return this.page.getByRole('button', { name: 'Copy Page', exact: true }).first();
  }

  private get optionsButton() {
    return this.page.getByRole('button', { name: 'Copy Page options' }).first();
  }

  private get menu() {
    return this.page.getByRole('menu').filter({ has: this.page.getByRole('menuitem', { name: 'View as Markdown' }) });
  }

  private item(name: string) {
    return this.menu.getByRole('menuitem', { name, exact: true });
  }

  private async ensureMenuOpen(): Promise<void> {
    // After an action the menu closes (and a deep link may still be settling), so retry the toggle.
    await expect(async () => {
      if (!(await this.menu.isVisible())) await this.optionsButton.click();
      await expect(this.menu).toBeVisible({ timeout: t(2000) });
    }).toPass({ timeout: t(10000) });
  }

  private async grantClipboard(): Promise<void> {
    await this.page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'])
      .catch(() => undefined);
  }

  private async readClipboard(previous: string | null): Promise<string> {
    await expect
      .poll(() => this.page.evaluate(() => navigator.clipboard.readText()), { timeout: t(5000) })
      .not.toBe(previous ?? '\u0000');
    return this.page.evaluate(() => navigator.clipboard.readText());
  }

  private async clipboardNow(): Promise<string> {
    return this.page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  }

  // ---- The menu ---------------------------------------------------------------------------

  /** Open the "Copy Page" menu; returns its entries in order. */
  async openMenu(): Promise<CopyPageAction[]> {
    await expect(this.optionsButton).toBeVisible({ timeout: t(10000) });
    await this.ensureMenuOpen();
    await expect(this.optionsButton).toHaveAttribute('aria-expanded', 'true', { timeout: t(5000) });
    const items = (await this.menu.getByRole('menuitem').allInnerTexts()).map((text) => text.trim());
    // The split button's left half is the first action, "Copy Markdown" (brief §4.5).
    return ['Copy Markdown', ...items.filter((name) => name !== 'Copy Markdown')] as CopyPageAction[];
  }

  async closeMenu(): Promise<void> {
    // The keyboard path (Escape from inside the menu) is DEV-A11Y-052; this closes it as a pointer user does.
    await this.optionsButton.click();
    await expect(this.menu).toBeHidden({ timeout: t(5000) });
  }

  /** True while the menu is open. Added by W14. */
  async isMenuOpen(): Promise<boolean> {
    return this.menu.isVisible();
  }

  /** True if any of the first three entries shows a coloured dot (D-5: none may). */
  async menuHasColouredDots(): Promise<boolean> {
    await this.ensureMenuOpen();
    return this.menu.getByRole('menuitem').evaluateAll((items) =>
      items.slice(0, 3).some((item) =>
        Array.from(item.querySelectorAll('*')).some((el) => {
          const style = getComputedStyle(el);
          const round = parseFloat(style.borderRadius) > 0 || style.borderRadius.includes('%');
          const small = (el as HTMLElement).offsetWidth > 0 && (el as HTMLElement).offsetWidth <= 12;
          const coloured = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
          return round && small && coloured;
        })
      )
    );
  }

  /** "Copy Markdown": returns the clipboard text afterwards (grants clipboard permission). */
  async copyMarkdown(): Promise<string> {
    await this.grantClipboard();
    const previous = await this.clipboardNow();
    await this.copyButton.click();
    return this.readClipboard(previous);
  }

  /** "View as Markdown": returns the tab it opens, on `<path>.md` (caller closes it). */
  async viewAsMarkdown(): Promise<Page> {
    await this.ensureMenuOpen();
    const popup = this.page.context().waitForEvent('page', { timeout: t(15000) });
    await this.item('View as Markdown').click();
    const tab = await popup;
    await tab.waitForLoadState('domcontentloaded', { timeout: t(15000) });
    return tab;
  }

  /**
   * "Open in ChatGPT" / "Open in Claude": returns the URL the new tab is opened at. The
   * external site is never loaded (the popup's navigation is aborted).
   */
  async openInAssistant(assistant: 'ChatGPT' | 'Claude'): Promise<string> {
    const context = this.page.context();
    let opened = '';
    await context.route(ASSISTANT_HOSTS, async (route) => {
      opened = opened || route.request().url();
      await route.abort();
    });
    await this.ensureMenuOpen();
    const popup = context.waitForEvent('page', { timeout: t(15000) });
    await this.item(`Open in ${assistant}`).click();
    const tab = await popup;
    await expect
      .poll(() => opened || (tab.url() === 'about:blank' ? '' : tab.url()), { timeout: t(10000) })
      .not.toBe('');
    const url = opened || tab.url();
    await tab.close().catch(() => undefined);
    return url;
  }

  /** "Connect to Cursor" / "Connect to VS Code": returns the deep link (cursor:… / vscode:…). */
  async connectTo(client: 'Cursor' | 'VS Code'): Promise<string> {
    await this.ensureMenuOpen();
    const item = this.item(`Connect to ${client}`);
    const href = await item.getAttribute('href');
    if (href) return href;
    // The page follows the deep link by script (window.location); the browser reports it as a request it
    // cannot load, which is where it is read. Nothing outside the browser is opened.
    const links: string[] = [];
    const record = (request: { url(): string }) => {
      if (/^(cursor|vscode(-insiders)?):/.test(request.url())) links.push(request.url());
    };
    this.page.on('request', record);
    try {
      await item.click();
      await expect.poll(() => links.length, { timeout: t(5000) }).toBeGreaterThan(0);
    } finally {
      this.page.off('request', record);
    }
    return links[0];
  }

  /** "Copy MCP Config": returns the clipboard text (JSON). */
  async copyMcpConfig(): Promise<string> {
    await this.grantClipboard();
    const previous = await this.clipboardNow();
    await this.ensureMenuOpen();
    await this.item('Copy MCP Config').click();
    return this.readClipboard(previous);
  }

  /** "Copy MCP Command": returns the clipboard text. */
  async copyMcpCommand(): Promise<string> {
    await this.grantClipboard();
    const previous = await this.clipboardNow();
    await this.ensureMenuOpen();
    await this.item('Copy MCP Command').click();
    return this.readClipboard(previous);
  }

  // ---- The hidden agent banner ------------------------------------------------------------

  /** The "For AI agents" banner: its text, whether it is the first content in body, and hidden. */
  async agentBanner(): Promise<{ text: string; isFirstInBody: boolean; isVisuallyHidden: boolean }> {
    // aria-hidden by design (C6 AgentBanner), so it has no role: its text is the anchor.
    const banner = this.page
      .locator('body > *')
      .filter({ hasText: /^For AI agents/ })
      .first();
    await expect(banner).toBeAttached({ timeout: t(10000) });
    return banner.evaluate((el) => {
      const first = Array.from(document.body.children).find(
        (c) => !['SCRIPT', 'NOSCRIPT', 'STYLE', 'LINK'].includes(c.tagName)
      );
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        text: (el.textContent ?? '').trim(),
        isFirstInBody: first === el,
        isVisuallyHidden:
          (el as HTMLElement).hidden !== false ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          rect.width <= 1 ||
          rect.height <= 1 ||
          style.clipPath !== 'none' ||
          style.clip !== 'auto',
      };
    });
  }

  // ---- HTTP checks ------------------------------------------------------------------------

  /** GET a path on the developers host without rendering it. Redirects are not followed by default. */
  async httpGet(path: string, options: { accept?: string; followRedirects?: boolean } = {}): Promise<HttpResult> {
    const response = await this.page.request.get(developersUrl(path), {
      headers: options.accept ? { Accept: options.accept } : undefined,
      maxRedirects: options.followRedirects ? 20 : 0,
      timeout: t(30000),
    });
    return {
      url: response.url(),
      status: response.status(),
      headers: response.headers(),
      body: await response.text(),
    };
  }

  /**
   * POST JSON to a portal path without a CSRF token and return the status (DEV-SEC: such a POST must be
   * refused before it writes anything). Refuses to run against live. Added by W14.
   */
  async postWithoutCsrf(path: string, body: Record<string, unknown>): Promise<number> {
    const url = developersUrl(path);
    if (new URL(url).hostname === 'developers.sefaria.org') {
      throw new Error('postWithoutCsrf never POSTs to live developers.sefaria.org');
    }
    const response = await this.page.request.post(url, { data: body, maxRedirects: 0, timeout: t(30000) });
    return response.status();
  }

  /** The `Link` header of a path, as rel → target (the markdown alternate is keyed "alternate"). */
  async linkRelations(path: string): Promise<Record<string, string>> {
    const { headers } = await this.httpGet(path);
    const relations: Record<string, string> = {};
    for (const part of (headers['link'] ?? '').split(/,(?=\s*<)/)) {
      const target = part.match(/<([^>]+)>/)?.[1];
      const rel = part.match(/rel="?([^";]+)"?/)?.[1];
      if (target && rel) relations[rel.trim()] = target;
    }
    return relations;
  }

  /**
   * Send one JSON-RPC message to the portal's own `/mcp`. Refuses to run against live
   * developers.sefaria.org (live is GET-only), and `tools/call` is not an allowed method.
   */
  async mcpRequest(method: McpMethod, params: Record<string, unknown> = {}, id = 1): Promise<HttpResult> {
    const url = developersUrl('/mcp');
    if (new URL(url).hostname === 'developers.sefaria.org') {
      throw new Error('mcpRequest never POSTs to live developers.sefaria.org');
    }
    const message = method.startsWith('notifications/')
      ? { jsonrpc: '2.0', method, params }
      : { jsonrpc: '2.0', id, method, params };
    const response = await this.page.request.post(url, {
      headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
      data: message,
      maxRedirects: 0,
      timeout: t(30000),
    });
    return {
      url: response.url(),
      status: response.status(),
      headers: response.headers(),
      body: await response.text(),
    };
  }
}
