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
and `APIKEYS_PR` the pull request whose merge commit the images must match (default 3774); both runner and `demo.sh` derive every host and
resource name from them.

## Before the master merge

One entrypoint runs everything the phase 1 release plan asks of this suite before #3774 merges, and prints one summary
table (step, PASS/FAIL/SKIP, counts, log). Logs go to the git-ignored `e2e-tests/api-keys/results/release-checks/<run>/`.
Known gaps (`@known-gap` Playwright titles, `GAP` drill lines) are counted, never failures. Exit status 0 means no step
failed.

Prerequisites: Docker, `helm`, Node with the repo's `node_modules`, Chromium for Playwright (`npx playwright install
chromium`), a Python with the repo's requirements and PyYAML in `APIKEYS_STACK_PYTHON` (default: the checkout's
`.venv`), Mongo with the Sefaria text data where `sefaria/local_settings.py` points (pages need it), and Redis on
127.0.0.1:6379 (`/api/find-refs` queues a Celery task; B3 and N-B4 answer 500 without a broker). On Linux the
stack binds Django to the docker0 address so its containers can reach it (`APIKEYS_STACK_DJANGO_BIND` overrides); `psql`
falls back to the `postgres:18` image when the host has none.

```bash
# 1. No stack, no cluster (about 2 min): per-env renders, gate-script tests, provisioning test, feature matrix.
e2e-tests/api-keys/run-release-checks.sh static

# 2. Everything that runs on this machine (about 60-90 min on a dev box): static, then the local stack up, smoke
#    (revoke-to-deny time), seed, the A-series in enforce and in observe, every stack drill (F1-F5, E1-E3, N-CR8,
#    N-E3-N-E5, N-F1-N-F2, B9, D-1-D-3, N-M7, N-M9, N-M14), the Playwright api-keys suite, demo.sh, teardown to 0 rows.
#    SKIP_SLOW_DRILLS=1 leaves out N-M9 and N-M14; PLAYWRIGHT_WORKERS (default 2).
e2e-tests/api-keys/run-release-checks.sh local

# 3. The cauldron, read-only (no go-ahead needed; kubectl context gke_development-205018_us-east1-b_cluster-1 and
#    `gh` logged in): preflight that the images are #3774's merge commit, the fixture-free Playwright cases (gateway,
#    paths, nginx log, spoofed stamp), the unkeyed A-series in the cauldron's auth mode, passive latency (F5),
#    a snapshot before and after that must not change.
APIKEYS_CAULDRON=apisplit e2e-tests/api-keys/run-release-checks.sh cauldron

# 4. The cauldron, seeded: only with Yotam's go-ahead (cauldron/SAFETY.md). Adds the keyed suite: revoke-to-deny on
#    the cluster (A9a, A9b), the keyed nginx log check (N-LOG1), the keyed A-series; teardown leaves 0 rows.
APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_SEEDING=apisplit e2e-tests/api-keys/run-release-checks.sh cauldron-seeded

# Owner-approved cauldron drills, outside the entrypoint:
APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_MUTATING_ON=apisplit e2e-tests/api-keys/cauldron/run.sh drill-f1   # F1 on the cluster
APIKEYS_CAULDRON=apisplit e2e-tests/api-keys/cauldron/run.sh verify-off   # E4, after authService.enabled=false is applied

# 5. Local perf numbers (about 12 min, Docker only, no cluster): added latency with and without ext_authz, the auth
#    service's own p99, revoke-to-deny with NOTIFY and with LISTEN broken, one versus two replicas. See "Performance".
e2e-tests/api-keys/run-release-checks.sh perf

# 6. The perf cauldron (release plan D6: a dedicated cauldron Brendan approved; never apisplit or a shared one):
APIKEYS_CAULDRON=<perf-name> APIKEYS_PERF_CAULDRON=<perf-name> APIKEYS_PERF_BASE=http://<envoy service> \
  APIKEYS_PERF_KEY_FILE=<file> e2e-tests/api-keys/run-release-checks.sh perf-cauldron
```

What a pass looks like:

| Step                                                                                   | Expected                                                                                                               |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `render-check (staging, preprod, prod)`                                                | each env renders with the flag off (no auth objects, no header strip) and on (32 assertions each)                      |
| `policy-gate tests`, `provision-cluster-registry tests`, `render-check negative tests` | every `ok:`; the scripts themselves run against a cluster later (below)                                                |
| `feature matrix --strict`                                                              | `0 error(s)` (it resolves against phase 1 with the merged sub-PRs)                                                     |
| `smoke`                                                                                | S1-S4 pass; S4 prints the revoke-to-deny time (well under 2 s)                                                         |
| `a-series (enforce)` / `(observe)`                                                     | 0 FAIL: enforce denies only `/api/knn-search`; observe never denies and stamps `observed:<code>`                       |
| drills                                                                                 | 0 FAIL each; the GAP lines are the known gaps listed in the release plan (N-CR8 readiness, F4, N-E4, N-E5, D-2, N-M14) |
| `playwright apikeys (local)`                                                           | `0 failed`; failures titled `@known-gap` are counted separately                                                        |
| `seed: --teardown leaves 0 rows`                                                       | `leftovers: 0`                                                                                                         |
| `perf cauldron runner guard tests` (static, perf)                                      | every `ok:`: each refusal makes no cluster call; every call past the guards names the dev context                      |
| `drill perf-latency` / `perf-revoke` / `perf-replicas` (perf)                          | 0 FAIL each; the added p50/p99, the auth service's p99 and the revoke times are printed under the row                  |

The cluster-side gates, run by hand at each promotion (all read-only except the provisioning create path):

```bash
CTX=<cluster context> NS=preprod ENV=preprod auth-service/scripts/policy-gate.sh       # after every flag flip; also NS=default ENV=production on prod
auth-service/scripts/crd-gate.sh <cluster context>                                     # once per cluster before the first enabled: true
CTX=<cluster context> auth-service/scripts/provision-cluster-registry.sh --verify      # the reader role's grants, before enabled: true
```

## Performance

The release plan's "Performance measured" items, with the k6 scripts in `auth-service/k6/` (ported from the POC to
the phase 1 contract: ext_authz over gRPC, `x-api-key`, the gated path `/api/knn-search`, observe and enforce). Local
numbers come from one host and never replace the perf-cauldron run (D6); they show the shape and catch regressions.

| Script (in `auth-service/dev/local-stack/scenarios/`) | Measures                                                                                                                                                                                                                     | Gate                                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `perf-latency.sh` (PERF-L)                            | `arms.js` at 20/s per arm for 120 s per mode, enforce then observe: the drill Envoy with ext_authz (:20080) against its listener without it (:20083), echo upstream; then `authsvc-direct.js` (gRPC Check, 200/s, 1000 keys) | every status as the contract says; no ext_authz error or fail-open; Check p99 under the 200 ms ext_authz timeout; added p99 under a loose 25 ms local budget |
| `perf-revoke.sh` (PERF-R)                             | `revoke_timing.py`, 1000 keys loaded: 20 trials create, 200, revoke, 401 with 5 ms polling; then `PG_NOTIFY_CHANNEL` empty and 3 revokes on the 60 s periodic reload                                                         | NOTIFY p50 <= 250 ms, max <= 2 s, code `api_key_invalid`; fallback: no LISTEN backend, every revoke within 65 s, none fast                                   |
| `perf-replicas.sh` (PERF-N)                           | `replicas.js`, 300 sequential pairs (valid key, unknown key) with one replica, then two                                                                                                                                      | same decisions on both replicas, no 429 (rate limiting is off), both replicas take Checks, circuit-breaker thresholds 1024 and never open                    |

Each prints its numbers as `info` lines next to the targets: the cluster baseline from the POC (+1.30 ms p50 / +3.02 ms
p99 on a Varnish hit), the ~50 ms NOTIFY target and the 60 s periodic reload. JSON results go to the run's
`results/release-checks/<run>/perf-*/` (or `.claude/scratch/apikeys-d11/perf/` when a script runs alone). "hit" means a
key found in the auth service's in-memory registry: phase 1 has no response cache, so every request is a Check call.
In enforce, "miss" is Envoy's local 401, so it has no "added" figure there. Envoy's own histogram
(`cluster.authsvc.upstream_rq_time`) records whole milliseconds.

Last full run (`run-release-checks.sh perf`, 2026-11-09, this repo's dev server, phase 1 head): in enforce, ext_authz
added p50 +0.63 ms / p99 +2.31 ms (no key) and +0.72 / +2.59 ms (found key); in observe +0.78 / +3.00 ms and +0.85 /
+3.76 ms. The auth service's own gRPC p99 was 0.79 ms at 200/s with 1000 keys (Envoy's view of the Check: p99 1.08 ms).
Revoke-to-deny over 20 trials: p50 57.7 ms, max 61.0 ms (reload 3.1 ms at 1029 keys); with LISTEN broken, 60.0 s each.
Two replicas split the Checks 300/301 with the same decisions and no 429.

**On the perf cauldron** (`perf/run-perf-cauldron.sh`, not yet run: it needs the cauldron D6 asks for). It refuses
before any cluster call unless `APIKEYS_CAULDRON` names a cauldron whose name contains `perf` and is not apisplit,
authpoc, api-keys-poc or apikeys-pipeline, `APIKEYS_PERF_CAULDRON` repeats it, and the kube context is the dev
cluster; rate is capped at 50/s per arm and 3 arms, duration at 180 s, trials at 20. `test-perf-guards.sh` proves the
guards with a fake `kubectl`.

1. `plan`: prints the Job it would create, with no cluster call.
2. `latency` with the flag off (the baseline), then, after the cauldron owner switches `authService.enabled` on in the
   cauldrons repo, `latency` again. Each run is a k6 Job (ConfigMap, Secret with the key, Job; all three deleted by
   label on exit) against the gateway's in-cluster Envoy Service on `/api/texts/Genesis.1` (a Varnish hit), like the
   POC. Then `compare results/perf-runs/<off>/latency-flag-off.json results/perf-runs/<on>/latency-flag-on.json`.
   A run's file is `latency-flag-<flag>.json` only when it is complete (every arm sampled, only expected statuses, the
   Job succeeded); otherwise `.failed.json`, which `compare` refuses, as it refuses runs on different cauldrons, rates,
   durations or arm sets. With the flag on, the hit arm must come back without `x-sefaria-key-status: not_accepted`
   (on the ungated path a stale key would still get 200).
3. `revoke` (flag on, enforce): the seeder resets the e2e fixtures in a web pod, `revoke_trials_pod.py` times create,
   allow, revoke, 401 on the pod's own clock (the key never leaves the pod), and the seeder tears down to 0 leftovers.
   The fixture rows show on every cauldron that shares the cauldron's `sefaria_auth` while the run lasts, as with
   `cauldron/run.sh seeded`.

## What the scaffold gives a spec

Import `test` and `expect` from `./fixtures` (or `../fixtures`).

| Fixture / helper                        | What it does                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `manifest`                              | The parsed manifest. Key values are secrets: never print them; `maskSecrets()` / `maskKey()` from `env.ts`                                                                                                                                                                     |
| `target`                                | `{name, hasEcho, hasNginx, hasStripOffListener, hasFlagOffServer, hasRegistry, hasMailbox, mocks, canReadNginxLog, canSwapEnvoyConfig}`. Skip with `test.skip(!target.hasEcho, '…')`                                                                                           |
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

## Feature matrix

`features.json` is the machine-checked list of every API key feature (`F-AREA-NN`) and edge case (`F-AREA-NN.eN`), each with a
scenario, the expected behaviour, a severity (P0 gateway decisions, migrations, writer atomicity, fail-open behaviour; P1 default;
P2 UI and documentation limits) and the checks that prove it. `check_features.py` reads it and fails when a check does not exist.

```bash
python3 e2e-tests/api-keys/check_features.py --strict      # exit 0: every edge case has a resolvable check; MISSING lines say what is wrong
python3 e2e-tests/api-keys/check_features.py --summary     # counts by status and area, planned cases by tracking id
python3 -m unittest discover -s e2e-tests/api-keys/tests -t .   # the validator's own tests
```

"Resolves" means the cited test, section, drill marker or file pattern exists (a `demo` check also needs a `prove` line for that id); it does
not mean the check passed. The validator executes nothing: drills, demo sections and Playwright specs are run separately, and pytest classes
that need Postgres skip on SQLite, so run them with `bash e2e-tests/api-keys/checks/run-checks.sh pytest` (Postgres).

The POC refs resolve against the one remote branch matching `refs.poc_glob`; pass `--poc-ref REF` (or `API_KEYS_POC_REF`) to name it,
and `--offline-poc` only when the branch is not fetched (poc refs then count as unverified, not proven). Never write a Shortcut id in
`features.json`.

**Statuses.** `on_branch`: provable on this branch by a test, drill, file check or demo section that exists now. `poc_only`: provable
only on the POC branch (the check carries `"scope": "poc"`). `planned`: not built yet; the edge case carries `tracking` (the follow-up id)
and `planned_check` (one sentence naming the proof), and needs no `checks`. A status on an edge case overrides its feature's.

**Known gaps.** A row with `"known_gap": true` cites the test that asserts the desired behaviour and fails today (a `known_gap` test name,
`@pytest.mark.failing`, a Go `knowngaps` build tag, `@known-gap` in a Playwright title, a drill tagged `[KG]`). A known-gap test is never proof
of an edge case that is not a known gap.

**Add an edge case.** Append an object to the feature's `edge_cases` with the next free `.eN` (never renumber: other documents cite the ids),
a `scenario`, an `expected`, a `severity` and `checks` (kinds: `pytest`, `gotest`, `playwright`, `demo`, `drill`, `shell`, `file`,
`checks_json`; ref forms are in `check_features.py`). A `demo` check names a `section_*` of `auth-service/scripts/demo.sh` whose body
has a `prove <id>` line for that feature or edge id. Run the validator and fix every `MISSING` line.

**PR rule.** A PR that adds a test under the `must_map` glob (`powered_by/tests/*api_project*_test.py`: the API project model,
migration, writer, listing and edge-case tests) must map it: cite it from the edge case it proves, or `--strict` fails with
"test matched by must_map is not referenced by any check". Test classes ending in `Test` or `TestCase` count, as well as `Test*` classes
and module functions. Edge cases that only a new test can prove go in `powered_by/tests/feature_edges_api_project_test.py`.

## Files

`env.ts` (targets, manifest, masking), `fixtures.ts`, `session.ts` (login, contexts), `gateway.ts`, `registry.ts`,
`mail.ts`, `infra.ts`, `auth.setup.ts`, `_smoke.spec.ts`; `perf/` (the perf-cauldron runner, its guard tests and
the in-pod revoke trials). Git-ignored: `.auth*/`, `results/`, and the manifest
`e2e-tests/.apikeys-e2e.json`.
