// The strings behind the eight Copy Page actions (SITE_ATLAS §2 "Page-level AI actions"; PLAN Phase 4). Captured
// from live's menu with a browser (GET only, 2026-11-18) and from ReadMe's hub bundle that builds them; the
// captured values are in __fixtures__/live-copy-page.json and CopyPage.test.tsx asserts equality for live's origin.
import type { CopyPageAction } from '../../analytics';

/** The MCP server's name in the config, the deep links and the command (live: the ReadMe subdomain). */
export const MCP_SERVER_NAME = 'sefaria';

/** Live's prompt, with the page's `.md` URL as a Markdown link. */
export function promptFor(assistant: 'ChatGPT' | 'Claude', markdownUrl: string): string {
  return `Hi ${assistant}! Can you please read [this page](${markdownUrl}) and prepare to answer questions about it?`;
}

export function chatGptUrl(markdownUrl: string): string {
  return `https://chat.openai.com/?q=${encodeURIComponent(promptFor('ChatGPT', markdownUrl))}`;
}

export function claudeUrl(markdownUrl: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(promptFor('Claude', markdownUrl))}`;
}

/** UTF-8-safe base64 (the URL is ASCII in practice; `btoa` alone would throw on anything else). */
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Cursor's MCP install deep link: the server config as base64 JSON. */
export function cursorDeepLink(mcpUrl: string, name: string = MCP_SERVER_NAME): string {
  const config = base64(JSON.stringify({ type: 'http', url: mcpUrl }));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(name)}&config=${config}`;
}

/** VS Code's MCP install deep link: the server as URL-encoded JSON. */
export function vscodeDeepLink(mcpUrl: string, name: string = MCP_SERVER_NAME): string {
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name, type: 'http', url: mcpUrl }))}`;
}

/** "Copy MCP Config": an `mcpServers` block, pretty-printed with two spaces. */
export function mcpConfig(mcpUrl: string, name: string = MCP_SERVER_NAME): string {
  return JSON.stringify({ mcpServers: { [name]: { type: 'http', url: mcpUrl } } }, null, 2);
}

/** "Copy MCP Command". */
export function mcpCommand(mcpUrl: string): string {
  return `npx add-mcp "${mcpUrl}"`;
}

/** Menu labels, in live's order (C6 `CopyPageMenu`). The split button's left half is "Copy Page". */
export const MENU_LABELS: Record<Exclude<CopyPageAction, 'copy_markdown'>, string> = {
  open_chatgpt: 'Open in ChatGPT',
  open_claude: 'Open in Claude',
  connect_cursor: 'Connect to Cursor',
  connect_vscode: 'Connect to VS Code',
  copy_mcp_config: 'Copy MCP Config',
  copy_mcp_command: 'Copy MCP Command',
  view_markdown: 'View as Markdown',
};

/** Live's UI strings (research/reference/data/i18n-en.json, `common.ai.*`, `common.copyToClipboard.*`). */
export const STRINGS = {
  copyPage: 'Copy Page',
  copied: 'Copied',
  menuButton: 'Copy Page options',
  mcpHeader: 'MCP',
  mcpCopied: 'Copied to clipboard!',
  copyFailed: 'Failed to copy to clipboard.',
  noMarkdown: 'No markdown content available to copy.',
  openFailed: 'Failed to open as markdown',
  appNotFound: (app: string) => `${app} does not appear to be installed.`,
  downloadApp: (app: string) => `Download ${app}`,
} as const;

export const APP_DOWNLOADS = {
  Cursor: 'https://www.cursor.com/',
  'VS Code': 'https://code.visualstudio.com/',
} as const;
