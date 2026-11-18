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

| ID  | Spec file | What it asserts | Tags |
| --- | --------- | --------------- | ---- |

Reserved for the `@sanity` / `@pr` core journeys (PLAN §5.2.3):

- `DEV-AI-001`: `/docs/welcome.md` returns Markdown with front matter
- `DEV-AI-002`: `/llms.txt` lists the docs and reference sections
