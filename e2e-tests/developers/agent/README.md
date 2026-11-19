# Developers Agent surface: E2E tests

The agent surface (PLAN §2.10, §6.2 I): `.md` URLs, `Accept: text/markdown` negotiation, the `llms` files, `Link` headers, the discovery files, the hidden "For AI agents" banner, each of the eight Copy Page actions, and the MCP server's `initialize` and `tools/list`.

IDs: `DEV-AI-NNN`, `DEV-MCP-NNN`. Lands in phase 4 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersCopyPage()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/agent/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/agent/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/agent/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Agent surface, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).
- MCP tests use `pm.onDevelopersCopyPage().mcpRequest(...)`, which cannot send `tools/call` and refuses to POST to live developers.sefaria.org.

## Test IDs

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 37 of 37 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID            | Spec file               | What it asserts                                                                             | Tags            | Local run |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------- | --------------- | --------- |
| `DEV-AI-001`  | `agent-surface.spec.ts` | /docs/welcome.md returns Markdown with front matter                                         | `@sanity` `@pr` | passes    |
| `DEV-AI-002`  | `agent-surface.spec.ts` | /llms.txt lists the docs and reference sections                                             | `@sanity` `@pr` | passes    |
| `DEV-AI-003`  | `agent-surface.spec.ts` | A page answers Markdown to Accept: text/markdown, with Vary: Accept                         |                 | passes    |
| `DEV-AI-004`  | `agent-surface.spec.ts` | Every page type answers at <path>.md                                                        |                 | passes    |
| `DEV-AI-005`  | `agent-surface.spec.ts` | An endpoint's .md ends with the OpenAPI slice for that endpoint                             |                 | passes    |
| `DEV-AI-006`  | `agent-surface.spec.ts` | In-portal links in the Markdown are absolute URLs on the request's host                     |                 | passes    |
| `DEV-AI-007`  | `agent-surface.spec.ts` | /docs/llms.txt and /reference/llms.txt list their own section; /llms-full.txt inlines pages |                 | passes    |
| `DEV-AI-008`  | `agent-surface.spec.ts` | llms.txt leaves out hidden pages                                                            |                 | passes    |
| `DEV-AI-009`  | `agent-surface.spec.ts` | Every documentation page sends the five Link relations                                      |                 | passes    |
| `DEV-AI-010`  | `agent-surface.spec.ts` | The four discovery files answer with live's content types                                   |                 | passes    |
| `DEV-AI-011`  | `agent-surface.spec.ts` | The server card names org.sefaria/developers and points at this host's /mcp                 |                 | passes    |
| `DEV-AI-012`  | `agent-surface.spec.ts` | /openapi/sefaria-api.json returns the spec                                                  |                 | passes    |
| `DEV-AI-013`  | `agent-surface.spec.ts` | The hidden "For AI agents" banner is the first content in <body>                            |                 | passes    |
| `DEV-AI-014`  | `agent-surface.spec.ts` | The banner is on every page type                                                            |                 | passes    |
| `DEV-AI-015`  | `agent-surface.spec.ts` | /docs.md redirects to /docs/llms.txt                                                        |                 | passes    |
| `DEV-AI-016`  | `agent-surface.spec.ts` | The sitemap lists visible pages only; robots.txt keeps crawlers off /_portal/               |                 | passes    |
| `DEV-AI-017`  | `agent-surface.spec.ts` | Every slug the main site's static/llms.txt links to exists here                             |                 | passes    |
| `DEV-AI-018`  | `agent-surface.spec.ts` | The homepage sends the four site-wide Link relations                                        |                 | passes    |
| `DEV-AI-020`  | `copy-page.spec.ts`     | The Copy Page menu offers the eight actions in live's order, with no coloured dots          |                 | passes    |
| `DEV-AI-021`  | `copy-page.spec.ts`     | The Copy Page menu offers the eight actions in live's order, with no coloured dots          |                 | passes    |
| `DEV-AI-022`  | `copy-page.spec.ts`     | "Copy Page" copies the page's Markdown                                                      |                 | passes    |
| `DEV-AI-023`  | `copy-page.spec.ts`     | "Copy Page" copies the page's Markdown                                                      |                 | passes    |
| `DEV-AI-024`  | `copy-page.spec.ts`     | "View as Markdown" opens the .md version in a new tab                                       |                 | passes    |
| `DEV-AI-025`  | `copy-page.spec.ts`     | "View as Markdown" opens the .md version in a new tab                                       |                 | passes    |
| `DEV-AI-026`  | `copy-page.spec.ts`     | "Open in ChatGPT" and "Open in Claude" ask the assistant to read the .md page               |                 | passes    |
| `DEV-AI-027`  | `copy-page.spec.ts`     | "Open in ChatGPT" and "Open in Claude" ask the assistant to read the .md page               |                 | passes    |
| `DEV-AI-028`  | `copy-page.spec.ts`     | "Connect to Cursor" and "Connect to VS Code" are deep links to this host's /mcp             |                 | passes    |
| `DEV-AI-029`  | `copy-page.spec.ts`     | "Connect to Cursor" and "Connect to VS Code" are deep links to this host's /mcp             |                 | passes    |
| `DEV-AI-030`  | `copy-page.spec.ts`     | "Copy MCP Config" and "Copy MCP Command" copy this host's /mcp                              |                 | passes    |
| `DEV-AI-031`  | `copy-page.spec.ts`     | "Copy MCP Config" and "Copy MCP Command" copy this host's /mcp                              |                 | passes    |
| `DEV-MCP-001` | `mcp.spec.ts`           | A plain GET of /mcp shows the notice; asking for an event stream is refused                 |                 | passes    |
| `DEV-MCP-002` | `mcp.spec.ts`           | initialize negotiates the protocol and names the server                                     |                 | passes    |
| `DEV-MCP-003` | `mcp.spec.ts`           | An unknown protocol version is answered with one the server supports                        |                 | passes    |
| `DEV-MCP-004` | `mcp.spec.ts`           | tools/list returns the four tools with live's names, titles and input schemas               |                 | passes    |
| `DEV-MCP-005` | `mcp.spec.ts`           | ping answers an empty result                                                                |                 | passes    |
| `DEV-MCP-006` | `mcp.spec.ts`           | notifications/initialized is accepted without a body                                        |                 | passes    |
| `DEV-MCP-007` | `mcp.spec.ts`           | /mcp sets no cookie and behaves the same with a session cookie                              |                 | passes    |
