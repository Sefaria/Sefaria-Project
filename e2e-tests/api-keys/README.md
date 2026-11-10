# API keys e2e suites

Playwright suites for the API key gateway (Envoy ext_authz + the Go auth service) and the developer settings UI.
They run against exactly two targets: the local Docker stack (`auth-service/dev/local-stack/`) or the
default cauldron (`apisplit`, or `$APIKEYS_CAULDRON`). Names, ports, accounts and the manifest format are fixed in [CONTRACT.md](CONTRACT.md);
the case list and the release gates are on the Sefaria wiki (`projects/api-key-program/release-plan-phase1`).

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
preflights, snapshots and runs the fixture-free cases with at most 2 workers. Seeded runs follow the
"Seeded runs" section of `cauldron/SAFETY.md`. `APIKEYS_CAULDRON` names the target cauldron (default `apisplit`)
and `APIKEYS_PR` the pull request whose merge commit the images must match (default 3774); both runner and cauldron scripts derive every host and
resource name from them.

## Before the master merge

One entrypoint runs everything the phase 1 release plan asks of this suite before #3774 merges, and prints one summary
table (step, PASS/FAIL/SKIP, counts, log). Logs go to the git-ignored `e2e-tests/api-keys/results/release-checks/<run>/`.
Known gaps (`@known-gap` Playwright titles, `GAP` drill lines) are counted, never failures. Exit status 0 means no step
failed.

Prerequisites: Docker, `helm`, Node with the repo's `node_modules`, Chromium for Playwright (`npx playwright install
chromium`), a Python with the repo's requirements and PyYAML in `APIKEYS_STACK_PYTHON` (default: the checkout's
`.venv`, else `python3`), Mongo with the Sefaria text data where `sefaria/local_settings.py` points (pages need it), and Redis on
127.0.0.1:6379 (`/api/find-refs` queues a Celery task; B3 and N-B4 answer 500 without a broker). On Linux the
stack binds Django to the docker0 address so its containers can reach it (`APIKEYS_STACK_DJANGO_BIND` overrides); `psql`
falls back to the `postgres:18` image when the host has none.

```bash
# 1. No stack, no cluster (about 2 min): per-env renders, gate-script tests, provisioning test.
e2e-tests/api-keys/run-release-checks.sh static

# 2. Everything that runs on this machine (about 60 min on a dev box): static, then the local stack up, smoke
#    (revoke-to-deny time), seed, the A-series in enforce and in observe, every stack drill (F1-F5, E1-E2, N-CR8,
#    N-E3-N-E5, N-F1-N-F2, B9, N-M7, PERF-R revoke timing), the Playwright api-keys suite, teardown to 0 rows.
#    PLAYWRIGHT_WORKERS (default 2).
e2e-tests/api-keys/run-release-checks.sh local

# 3. The cauldron, read-only (no go-ahead needed; kubectl context gke_development-205018_us-east1-b_cluster-1 and
#    `gh` logged in): preflight that the images are #3774's merge commit, the fixture-free Playwright cases (gateway,
#    paths, nginx log, spoofed stamp), the unkeyed A-series in the cauldron's auth mode, passive latency (F5),
#    a snapshot before and after that must not change.
APIKEYS_CAULDRON=apisplit e2e-tests/api-keys/run-release-checks.sh cauldron

# 4. The cauldron, seeded: only with the cauldron owner's go-ahead (cauldron/SAFETY.md). Adds the keyed suite: revoke-to-deny on
#    the cluster (A9a, A9b), the keyed nginx log check (N-LOG1), the keyed A-series; teardown leaves 0 rows.
APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_SEEDING=apisplit e2e-tests/api-keys/run-release-checks.sh cauldron-seeded

# Owner-approved cauldron drills, outside the entrypoint:
APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_MUTATING_ON=apisplit e2e-tests/api-keys/cauldron/run.sh drill-f1   # F1 on the cluster
APIKEYS_CAULDRON=apisplit e2e-tests/api-keys/cauldron/run.sh verify-off   # E4, after authService.enabled=false is applied

```

What a pass looks like:

| Step                                                                                   | Expected                                                                                                               |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `render-check (staging, preprod, prod)`                                                | each env renders with the flag off (no auth objects, no header strip) and on (32 assertions each)                      |
| `policy-gate tests`, `provision-cluster-registry tests`, `render-check negative tests` | every `ok:`; the scripts themselves run against a cluster later (below)                                                |
| `smoke`                                                                                | S1-S4 pass; S4 prints the revoke-to-deny time (well under 2 s)                                                         |
| `a-series (enforce)` / `(observe)`                                                     | 0 FAIL: enforce denies only `/api/knn-search`; observe never denies and stamps `observed:<code>`                       |
| drills                                                                                 | 0 FAIL each; the GAP lines are the known gaps listed in the release plan                                               |
| `playwright apikeys (local)`                                                           | `0 failed`; failures titled `@known-gap` are counted separately                                                        |
| `seed: --teardown leaves 0 rows`                                                       | `leftovers: 0`                                                                                                         |
| `drill perf-revoke`                                                                    | 0 FAIL; the PERF-R lines print the create-to-allow and revoke-to-deny times under the row                              |

The cluster-side gates, run by hand at each promotion (all read-only except the provisioning create path):

```bash
CTX=<cluster context> NS=preprod ENV=preprod auth-service/scripts/policy-gate.sh       # after every flag flip; also NS=default ENV=production on prod
auth-service/scripts/crd-gate.sh <cluster context>                                     # once per cluster before the first enabled: true
CTX=<cluster context> auth-service/scripts/provision-cluster-registry.sh --verify      # the reader role's grants, before enabled: true
```

## Revoke timing (PERF-R)

`perf-revoke.sh` (in `auth-service/dev/local-stack/scenarios/`, run by the `local` entrypoint) is the one timing drill
left. It runs `revoke_timing.py` on the drill copy of the stack with 1000 keys loaded: 20 trials of create, 200, revoke,
401 with 5 ms polling, then `PG_NOTIFY_CHANNEL` empty and 3 revokes on the 60 s periodic reload. Gates: NOTIFY p50 <=
250 ms, max <= 2 s, code `api_key_invalid`; fallback: no LISTEN backend, every revoke within 65 s, none fast. Its JSON
goes to the run's `results/release-checks/<run>/perf-revoke/`. These are local numbers from one host; they show the
shape and catch regressions, and they never replace a run on a cluster.

## What the scaffold gives a spec

Import `test` and `expect` from `./fixtures` (or `../fixtures`).

| Fixture / helper                        | What it does                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `manifest`                              | The parsed manifest. Key values are secrets: never print them; `maskSecrets()` / `maskKey()` from `env.ts`                                                                                                                                                                     |
| `target`                                | `{name, hasEcho, hasNginx, hasStripOffListener, hasFlagOffServer, hasRegistry, hasMailbox, canReadNginxLog, canSwapEnvoyConfig}`. Skip with `test.skip(!target.hasEcho, '…')`                                                                                           |
| `account(suite, role, {host?, lang?})`  | A logged-in `{account, context, page}`; closed after the test. `host: 'flagoff.gateway.test'` moves the session to another local host                                                                                                                                          |
| `gw`                                    | Node-side gateway calls: `gw.get(path, {key, origin, authorization, host, listener})` → `{status, code, error, help, headers, json, echoHeaders}`. `key` is `{suite, name}` from the manifest or a literal string. Redirects are not followed. Infra statuses are retried once |
| `pageFetch(page, path, {method, body})` | A same-origin call from the page with the browser's cookies and CSRF token (Node-side requests carry no browser cookies locally)                                                                                                                                               |
| `registry.ts`                           | `readRegistry(target)`, `waitForVersionBump(target, before, fallbackProbe)`                                                                                                                                                                                                    |
| `mail.ts`                               | `latestConfirmationLink(target, email, {since})` from Mailpit (local only)                                                                                                                                                                                                     |
| `infra.ts`                              | `withInfraRetry`, `classifyResponse`; infra outcomes are annotated `infra`, never asserted                                                                                                                                                                                     |
| `gateway.ts`                            | `addressFor`, `browserOrigin`, `describe(result)` (a safe one-line summary for assertion messages)                                                                                                                                                                             |
| `../pages/developerSettingsPage.ts`     | Page object for `/settings/developer`, also on `PageManager.onDeveloperSettingsPage()`                                                                                                                                                                                         |

## Rules that keep results honest

- Chromium treats 10080 as an unsafe port (`net::ERR_UNSAFE_PORT`); the project's launch args allow 10080 and 10081. A spec that launches its own browser must pass `--explicitly-allowed-ports=10080,10081` too.
- Browser pages use `*.gateway.test` through a resolver launch arg. Node-side calls go to `127.0.0.1` with an
  explicit `Host`. Never send `localhost` or `127.0.0.1` as the Host in a header, CORS or cookie test:
  `CORSDebugMiddleware` would add permissive CORS headers.
- Assert status **and** `code`. Put `describe(result)` in the assertion message, never the raw headers.
- Traces are off by default because they record request headers (`x-api-key`). `APIKEYS_TRACE=1` turns them on
  for a local debugging run; delete the results afterwards.
- On the cauldron: at most 2 workers (the setup refuses more), `www.` host only, `@example.com` accounts only, and
  never touch rows the seed did not create.

Tier is the `tier_id` column of the profile's live row in `api_project` (one per profile; `api_tier` holds the seeded tiers developer, partner and internal, and `api_tier_meter_limit` the monthly limits per tier). The local-stack drills set it through `set_project_tier`. Every key of a project shares that tier and the project's counters. The profile table `powered_by_project` keeps the metadata, the key table keeps the keys, and each key points at its `api_project` row. Raw SQL that deletes a profile must delete its `api_project` row, and that row's keys, first, because the FK from `api_project` to the profile is deferred and refuses the delete at commit.

## Files

`env.ts` (targets, manifest, masking), `fixtures.ts`, `session.ts` (login, contexts), `gateway.ts`, `registry.ts`,
`mail.ts`, `infra.ts`, `auth.setup.ts`, `_smoke.spec.ts`. Git-ignored: `.auth*/`, `results/`, and the manifest
`e2e-tests/.apikeys-e2e.json`.
