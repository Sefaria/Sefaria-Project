import { Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { t } from '../../globals';
import { CopyPageAction, HttpResult, McpMethod, developersUrl, notImplemented } from './developersCommon';

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

  // ---- The menu ---------------------------------------------------------------------------

  /** Open the "Copy Page" menu; returns its entries in order. */
  async openMenu(): Promise<CopyPageAction[]> {
    return notImplemented('DevelopersCopyPage.openMenu');
  }

  async closeMenu(): Promise<void> {
    return notImplemented('DevelopersCopyPage.closeMenu');
  }

  /** True if any of the first three entries shows a coloured dot (D-5: none may). */
  async menuHasColouredDots(): Promise<boolean> {
    return notImplemented('DevelopersCopyPage.menuHasColouredDots');
  }

  /** "Copy Markdown": returns the clipboard text afterwards (grants clipboard permission). */
  async copyMarkdown(): Promise<string> {
    return notImplemented('DevelopersCopyPage.copyMarkdown');
  }

  /** "View as Markdown": returns the tab it opens, on `<path>.md` (caller closes it). */
  async viewAsMarkdown(): Promise<Page> {
    return notImplemented('DevelopersCopyPage.viewAsMarkdown');
  }

  /**
   * "Open in ChatGPT" / "Open in Claude": returns the URL the new tab is opened at. The
   * external site is never loaded (the popup's navigation is aborted).
   */
  async openInAssistant(assistant: 'ChatGPT' | 'Claude'): Promise<string> {
    return notImplemented('DevelopersCopyPage.openInAssistant');
  }

  /** "Connect to Cursor" / "Connect to VS Code": returns the deep link (cursor:… / vscode:…). */
  async connectTo(client: 'Cursor' | 'VS Code'): Promise<string> {
    return notImplemented('DevelopersCopyPage.connectTo');
  }

  /** "Copy MCP Config": returns the clipboard text (JSON). */
  async copyMcpConfig(): Promise<string> {
    return notImplemented('DevelopersCopyPage.copyMcpConfig');
  }

  /** "Copy MCP Command": returns the clipboard text. */
  async copyMcpCommand(): Promise<string> {
    return notImplemented('DevelopersCopyPage.copyMcpCommand');
  }

  // ---- The hidden agent banner ------------------------------------------------------------

  /** The "For AI agents" banner: its text, whether it is the first content in body, and hidden. */
  async agentBanner(): Promise<{ text: string; isFirstInBody: boolean; isVisuallyHidden: boolean }> {
    return notImplemented('DevelopersCopyPage.agentBanner');
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
