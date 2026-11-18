import { test, expect, Page } from '@playwright/test';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, ENDPOINTS, enterPortal } from '../developers-entry';

// The Copy Page split button and its menu (brief §4.5; C6 CopyPageButton / CopyPageMenu; SITE_ATLAS
// "Page-level AI actions"): each of the eight actions does what live's does, on a docs page and on an
// endpoint page. The assistants' sites and the editors are never opened for real.
const MENU = [
  'Copy Markdown',
  'Open in ChatGPT',
  'Open in Claude',
  'Connect to Cursor',
  'Connect to VS Code',
  'Copy MCP Config',
  'Copy MCP Command',
  'View as Markdown',
];

/** A deep link's readable text: URL-decoded, plus Cursor's base64 `config` parameter decoded. */
function decodeDeepLink(link: string): string {
  let text = decodeURIComponent(link);
  const config = new URL(link).searchParams.get('config');
  if (config) text += Buffer.from(config, 'base64').toString('utf8');
  return text;
}

for (const [label, path] of [
  ['docs page', DOC_PAGES.welcome],
  ['endpoint page', ENDPOINTS.texts.path],
] as const) {
  test.describe(`Developers Agent Surface, English (${label})`, () => {
    let page: Page;
    let pm: PageManager;
    const n = label === 'docs page' ? 0 : 1;
    const id = (i: number) => String(20 + i * 2 + n).padStart(3, '0');

    test.beforeEach(async ({ context }) => {
      ({ page, pm } = await enterPortal(context, path));
    });

    test(`DEV-AI-${id(0)}: The Copy Page menu offers the eight actions in live's order, with no coloured dots`, async () => {
      const copy = pm.onDevelopersCopyPage();
      expect(await copy.openMenu()).toEqual(MENU);
      expect(await copy.menuHasColouredDots()).toBe(false);
      await copy.closeMenu();
      expect(await copy.isMenuOpen()).toBe(false);
    });

    test(`DEV-AI-${id(1)}: "Copy Page" copies the page's Markdown`, async () => {
      const copy = pm.onDevelopersCopyPage();
      const markdown = await copy.copyMarkdown();
      expect(markdown).toBe((await copy.httpGet(`${path}.md`)).body);
    });

    test(`DEV-AI-${id(2)}: "View as Markdown" opens the .md version in a new tab`, async () => {
      const tab = await pm.onDevelopersCopyPage().viewAsMarkdown();
      expect(new URL(tab.url()).pathname).toBe(encodeURI(`${path}.md`));
      await tab.close();
    });

    test(`DEV-AI-${id(3)}: "Open in ChatGPT" and "Open in Claude" ask the assistant to read the .md page`, async () => {
      const copy = pm.onDevelopersCopyPage();
      const md = `${new URL(page.url()).origin}${path}.md`;
      const chatgpt = new URL(await copy.openInAssistant('ChatGPT'));
      expect(chatgpt.origin).toMatch(/^https:\/\/(chat\.openai\.com|chatgpt\.com)$/);
      expect(chatgpt.searchParams.get('q')).toBe(
        `Hi ChatGPT! Can you please read [this page](${md}) and prepare to answer questions about it?`
      );
      const claude = new URL(await copy.openInAssistant('Claude'));
      expect(`${claude.origin}${claude.pathname}`).toBe('https://claude.ai/new');
      expect(claude.searchParams.get('q')).toBe(
        `Hi Claude! Can you please read [this page](${md}) and prepare to answer questions about it?`
      );
    });

    test(`DEV-AI-${id(4)}: "Connect to Cursor" and "Connect to VS Code" are deep links to this host's /mcp`, async ({
      context,
    }) => {
      const copy = pm.onDevelopersCopyPage();
      const mcp = `${new URL(page.url()).origin}/mcp`;
      const cursor = await copy.connectTo('Cursor');
      expect(cursor).toMatch(/^cursor:/);
      expect(decodeDeepLink(cursor)).toContain(mcp);
      // Headless Chromium stops delivering pointer and key input to a tab that navigated to a scheme no app
      // handles (cursor:, vscode:), even after a reload of that tab (a plain page doing the same shows it too).
      // Start VS Code in a fresh tab.
      ({ page, pm } = await enterPortal(context, path));
      const vscode = await pm.onDevelopersCopyPage().connectTo('VS Code');
      expect(vscode).toMatch(/^vscode(-insiders)?:/);
      expect(decodeDeepLink(vscode)).toContain(mcp);
    });

    test(`DEV-AI-${id(5)}: "Copy MCP Config" and "Copy MCP Command" copy this host's /mcp`, async () => {
      const copy = pm.onDevelopersCopyPage();
      const mcp = `${new URL(page.url()).origin}/mcp`;
      const config = JSON.parse(await copy.copyMcpConfig());
      expect(JSON.stringify(config)).toContain(mcp);
      const command = await copy.copyMcpCommand();
      expect(command).toContain(mcp);
    });
  });
}
