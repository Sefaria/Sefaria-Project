import { test, expect, Page } from '@playwright/test';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, enterPortal, readRepoJson } from '../developers-entry';

// The portal's own MCP server (PLAN §2.10). JSON-RPC over POST goes only to the portal under test
// (mcpRequest refuses live), and never calls tools/call (C7 McpMethod).
test.describe('Developers MCP, English', () => {
  let pm: PageManager;
  let page: Page;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterPortal(context, DOC_PAGES.welcome));
  });

  test('DEV-MCP-001: A plain GET of /mcp shows the notice; asking for an event stream is refused', async () => {
    const copy = pm.onDevelopersCopyPage();
    const plain = await copy.httpGet('/mcp');
    expect(plain.status).toBe(200);
    expect(plain.headers['content-type']).toMatch(/^text\/html/);
    expect(plain.body).toBe('This URL can only be accessed with a MCP client.');
    expect((await copy.httpGet('/mcp', { accept: 'text/event-stream' })).status).toBe(405);
  });

  test('DEV-MCP-002: initialize negotiates the protocol and names the server', async () => {
    const result = await pm.onDevelopersCopyPage().mcpRequest('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'sefaria-e2e', version: '1' },
    });
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toMatch(/^application\/json/);
    const message = JSON.parse(result.body);
    expect(message).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: '2025-06-18', serverInfo: { name: 'org.sefaria/developers' } },
    });
    expect(message.result.capabilities.tools).toBeDefined();
  });

  test('DEV-MCP-003: An unknown protocol version is answered with one the server supports', async () => {
    const result = await pm.onDevelopersCopyPage().mcpRequest('initialize', {
      protocolVersion: '1999-01-01',
      capabilities: {},
      clientInfo: { name: 'sefaria-e2e', version: '1' },
    });
    const message = JSON.parse(result.body);
    expect(message.result.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(message.result.protocolVersion).not.toBe('1999-01-01');
  });

  test("DEV-MCP-004: tools/list returns the four tools with live's names, titles and input schemas", async () => {
    const result = await pm.onDevelopersCopyPage().mcpRequest('tools/list', {}, 2);
    const tools = JSON.parse(result.body).result.tools as { name: string; title?: string; inputSchema: unknown }[];
    expect(tools.map((tool) => tool.name)).toEqual([
      'list-endpoints',
      'get-endpoint',
      'search-endpoints',
      'execute-request',
    ]);
    const live = readRepoJson<{ result?: { tools: typeof tools }; tools?: typeof tools }>(
      'docs/dev-portal/research/site/machine/mcp-tools-list.json'
    );
    const liveTools = live.result?.tools ?? live.tools ?? [];
    for (const tool of liveTools) {
      const ours = tools.find((t) => t.name === tool.name);
      expect(ours?.title, tool.name).toBe(tool.title);
      expect(ours?.inputSchema, tool.name).toEqual(tool.inputSchema);
    }
  });

  test('DEV-MCP-005: ping answers an empty result', async () => {
    const result = await pm.onDevelopersCopyPage().mcpRequest('ping', {}, 7);
    expect(JSON.parse(result.body)).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
  });

  test('DEV-MCP-006: notifications/initialized is accepted without a body', async () => {
    const result = await pm.onDevelopersCopyPage().mcpRequest('notifications/initialized');
    expect(result.status).toBe(202);
    expect(result.body).toBe('');
  });

  test('DEV-MCP-007: /mcp sets no cookie and behaves the same with a session cookie', async ({ context }) => {
    const copy = pm.onDevelopersCopyPage();
    const anonymous = await copy.mcpRequest('tools/list', {}, 3);
    expect(anonymous.headers['set-cookie']).toBeUndefined();
    const host = new URL(page.url()).hostname;
    await context.addCookies([{ name: 'sessionid', value: 'e2e-not-a-session', domain: host, path: '/' }]);
    const withCookie = await copy.mcpRequest('tools/list', {}, 3);
    expect(withCookie.status).toBe(anonymous.status);
    expect(withCookie.body).toBe(anonymous.body);
  });
});
