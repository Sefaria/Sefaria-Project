# API keys e2e suites

Playwright suites for the API key gateway (Envoy ext_authz + the Go auth service) and the developer settings UI.
They run against exactly two targets: the local Docker stack (`auth-service/dev/local-stack/`) or the
`apikeys-pipeline` cauldron. Names, ports, accounts and the manifest format are fixed in [CONTRACT.md](CONTRACT.md);
the case list is [`../test-plans/sc-47260-api-keys.md`](../test-plans/sc-47260-api-keys.md).

The projects `apikeys-setup` and `apikeys` exist only when `APIKEYS_TARGET` is set **and** the manifest exists, so
CI and a plain `npx playwright test` never run them.

## Run locally

```bash
auth-service/dev/local-stack/up.sh                       # the stack owner starts it; suites never restart it
python scripts/dev/seed_api_keys_e2e.py --target local --reset --manifest-stdout > e2e-tests/.apikeys-e2e.json
APIKEYS_TARGET=local npx playwright test --project=apikeys
APIKEYS_TARGET=local npx playwright test --project=apikeys e2e-tests/api-keys/_smoke.spec.ts   # scaffold check
APIKEYS_TARGET=local npx playwright test --project=apikeys --grep-invert @known-gap            # only what should pass today
```

Two runs at once (say local and cauldron) must not share a session directory: give each its own with
`APIKEYS_AUTH_DIR=e2e-tests/api-keys/.auth-local` (any path; relative to the repo root). The setup writes into a
temporary directory and swaps it in at the end, so a run already in progress never reads a half-written one.

The seed script and the setup both read the shared password from `APIKEYS_E2E_PASSWORD_FILE` (default
`.claude/scratch/api-keys-e2e/password`). On the cauldron, use `e2e-tests/api-keys/cauldron/run.sh`, which
preflights, seeds through the web pod, runs with at most 2 workers and always tears down.

## What the scaffold gives a spec

Import `test` and `expect` from `./fixtures` (or `../fixtures`).

| Fixture / helper | What it does |
|---|---|
| `manifest` | The parsed manifest. Key values are secrets: never print them; `maskSecrets()` / `maskKey()` from `env.ts` |
| `target` | `{name, hasEcho, hasNginx, hasStripOffListener, hasFlagOffServer, hasRegistry, hasMailbox, mocks, canReadNginxLog, canSwapEnvoyConfig}`. Skip with `test.skip(!target.hasEcho, '…')` |
| `account(suite, role, {host?, lang?})` | A logged-in `{account, context, page}`; closed after the test. `host: 'flagoff.gateway.test'` moves the session to another local host |
| `gw` | Node-side gateway calls: `gw.get(path, {key, origin, authorization, host, listener})` → `{status, code, error, help, headers, json, echoHeaders}`. `key` is `{suite, name}` from the manifest or a literal string. Redirects are not followed. Infra statuses are retried once |
| `pageFetch(page, path, {method, body})` | A same-origin call from the page with the browser's cookies and CSRF token (Node-side requests carry no browser cookies locally) |
| `registry.ts` | `readRegistry(target)`, `waitForVersionBump(target, before, fallbackProbe)` |
| `mail.ts` | `latestConfirmationLink(target, email, {since})` from Mailpit (local only) |
| `infra.ts` | `withInfraRetry`, `classifyResponse`; infra outcomes are annotated `infra`, never asserted |
| `gateway.ts` | `addressFor`, `browserOrigin`, `describe(result)` (a safe one-line summary for assertion messages) |
| `../pages/developerSettingsPage.ts` | Page object for `/settings/developer`, also on `PageManager.onDeveloperSettingsPage()` |

## Rules that keep results honest

- Chromium treats 10080 as an unsafe port (`net::ERR_UNSAFE_PORT`); the project's launch args allow 10080 and
  10081. A spec that launches its own browser must pass `--explicitly-allowed-ports=10080,10081` too.
- Browser pages use `*.gateway.test` through a resolver launch arg. Node-side calls go to `127.0.0.1` with an
  explicit `Host`. Never send `localhost` or `127.0.0.1` as the Host in a header, CORS or cookie test:
  `CORSDebugMiddleware` would add permissive CORS headers.
- Assert status **and** `code`. Put `describe(result)` in the assertion message, never the raw headers.
- Traces are off by default because they record request headers (`x-api-key`). `APIKEYS_TRACE=1` turns them on
  for a local debugging run; delete the results afterwards.
- On the cauldron: at most 2 workers (the setup refuses more), `www.` host only, `@example.com` accounts only, and
  never touch rows the seed did not create.

Tier is the `tier` column of the project's row in `powered_by_projectlimits` (no row means developer). It is set through `set_project_tier` in the local-stack drills, or the admin ProjectLimits inline. Every key of a project shares that tier and the project's counters. The project table keeps the metadata and the key table keeps the keys. Raw SQL that deletes a project must delete its limits row first, because the FK is deferred and refuses the delete at commit.

## Files

`env.ts` (targets, manifest, masking), `fixtures.ts`, `session.ts` (login, contexts), `gateway.ts`, `registry.ts`,
`mail.ts`, `infra.ts`, `auth.setup.ts`, `_smoke.spec.ts`. Git-ignored: `.auth*/`, `results/`, and the manifest
`e2e-tests/.apikeys-e2e.json`.
