# API keys e2e: shared contract

This file fixes the names, ports and formats that the local stack (`auth-service/dev/local-stack/`), the seed script
(`scripts/dev/seed_api_keys_e2e.py`), the Playwright scaffold (`e2e-tests/api-keys/`) and every suite agree on. Change
it only together with every consumer. Case IDs (`A2b`, `N-C9`, ...) refer to the API keys Phase 1 test matrix.

## 1. Targets

Exactly two targets exist. Anything else, including any live or staging host, is refused by the config, the seed
script and every helper.

| `APIKEYS_TARGET` | Browser base URL | API requests go to | Workers |
|---|---|---|---|
| `local` | `http://www.gateway.test:10080` | `http://127.0.0.1:10080` with `Host: www.gateway.test:10080` | 4 (max) |
| `cauldron` | `https://www.<cauldron>.cauldron.sefaria.org` (default cauldron `apisplit`, or `$APIKEYS_CAULDRON`) | the same URL (real DNS) | 2 (max), `retries: 1`, `ignoreHTTPSErrors` |

Always use the `www.` host. The bare cauldron host answers 301 to everything except gateway denials.

## 2. Local stack

Compose project `sefaria-apikeys-stack`. Every published port binds to `127.0.0.1`. Nothing collides with the
supabase stack (54321-54324), brew Postgres (5432), Mongo (27017), Redis (6379), Django (8000), node or Vite (5173).

| Port | Service | Notes |
|---|---|---|
| 55432 | `pg` (`postgres:18`) | DB `sefaria_auth`, superuser `postgres`/`postgres` (local only) |
| 18080 | `authsvc` HTTP | `/readyz`, `/metrics`, `/internal/registry` |
| 19090 | `authsvc` gRPC | ext_authz `Check`; reflection on |
| 10080 | `envoy`, strip **on** | mirrors the cluster HTTPS listener |
| 10081 | `envoy`, strip **off** | mirrors the cluster's merged port-80 listener (N-A2, N-A3) |
| 19000 | `envoy` admin | stats, `config_dump` |
| 18088 | `nginx`, direct | the chart's nginx without Envoy in front (what merge-queue Playwright sees) |
| 8100 | host Django, flag **on** | `DEVELOPER_SETTINGS_ENABLED=true` |
| 8101 | host Django, flag **off** | same DB; for N-C5, C9-style browser checks |
| 18025 / 11025 | `mailpit` UI+API / SMTP | |

Containers reach host Django through `host.docker.internal` (with `extra_hosts: host.docker.internal:host-gateway`).
This works with Django bound to `127.0.0.1` on Docker Desktop (checked 2026-10-13).

### Hostnames and routing

| Host (port 10080 or 10081) | Envoy routes to | Use |
|---|---|---|
| `www.gateway.test` | `nginx` → Django :8100 | everything that mirrors the cluster |
| `voices.gateway.test` | `nginx` → Django :8100 | voices module, cross-module requests |
| `gateway.test` | `nginx` (bare host, 301 to `https://www.`) | bare-host shape only |
| `echo.gateway.test` | `echo` | what the upstream receives (A1, A7, N-A3, N-A6) |
| `direct.gateway.test` | Django :8100, **no nginx** | telling nginx effects apart from Django ones (CORS) |
| `flagoff.gateway.test` | Django :8101, no nginx | flag-off browser pass |

Envoy virtual hosts match both `host` and `host:*`. ext_authz runs on every route, as on the cluster.

**Never send `localhost` or `127.0.0.1` as the Host** in a test that asserts headers, CORS or cookies.
`CORSDebugMiddleware` adds permissive CORS headers whenever the Host contains either string and `DEBUG` is on, which
hides the real CORS gap. `DEBUG` stays on locally (runserver needs it for static files on `direct.`/`flagoff.`), so
the Host rule is what keeps results honest.

How each client reaches `*.gateway.test` without `/etc/hosts`:
- **Browser pages:** launch arg `--host-resolver-rules=MAP *.gateway.test 127.0.0.1`.
- **Node-side requests** (`request`, `context.request`, the `gw` fixture) do **not** use the browser's resolver. They
  call `http://127.0.0.1:<port>` and set `Host: <name>.gateway.test:<port>` explicitly. Checked on Playwright 1.56.1:
  both `extraHTTPHeaders` and per-request `headers` pass `Host` through unchanged.
- **Node-side requests carry no browser cookies** (the cookie jar is keyed by URL host, and the URL is `127.0.0.1`).
  Logged-in Django calls (`/api/developer/*`, `/api/profile`) are made from the page with `page.evaluate(fetch)`,
  which also gives real `Origin`, `Referer` and CSRF behaviour. Gateway calls with a key need no cookies.
- **curl:** `curl --resolve www.gateway.test:10080:127.0.0.1 http://www.gateway.test:10080/...` (keeps the port in
  `Host`).

### nginx: required, rendered from the chart

Decision: the local stack **includes nginx**, and it is required, not a stretch goal. On the cluster every request
goes Envoy → nginx → Varnish → Django, and nginx is what adds `Access-Control-Allow-Origin: *` when Django did not,
and what writes the `apiClassification` access log. Without it, local results for C8, A8, N-A4, N-D7 and N-E1 would
not match the cluster. Varnish is left out (it only caches and sits behind Envoy, so it cannot change a gateway
decision).

The config is rendered from `helm-chart/sefaria/conf/nginx.template.conf.tpl` (Helm via a container, since the host
has no `helm`; root domain `gateway.test`, codes `en`/`he`, the chart's `voices` module, instrumentation off), then
env-substituted the way the chart's entrypoint does. Allowed local deviations, each applied by a visible `sed` in
`up.sh` and listed in the stack README:
1. `varnishupstream` points at `host.docker.internal:8100` instead of Varnish on 8040.
2. In the proxied `location` blocks, `Host $host` becomes `Host $http_host` and `X-Forwarded-Proto https` becomes
   `X-Forwarded-Proto $scheme`. The local stack is plain HTTP on port 10080; keeping the chart's values would make
   Django build `https://www.gateway.test/...` links (confirmation mail, absolute redirects) that do not resolve.
3. `user www-data;` becomes the image's user, and `SEARCH_HOST` points at a resolvable container (nginx refuses to
   start on an unresolvable upstream). Search paths are not under test.

Everything else, the CORS map, `add_header ... always`, the log format and the module redirects, stays byte-identical
to the render. Re-render whenever the template changes.

### Django settings wrapper

`auth-service/dev/local-stack/django_settings.py`, used as `PYTHONPATH=auth-service/dev/local-stack
DJANGO_SETTINGS_MODULE=django_settings` (pytest: `--ds=django_settings`). Never replace the worktree's
`sefaria/local_settings.py`: it is a symlink into another checkout, and migrating through it changes that checkout's
SQLite file. The wrapper imports `sefaria.settings` and then sets:

| Setting | Value |
|---|---|
| `DATABASES["default"]` | Postgres `127.0.0.1:55432`, `sefaria_auth`, `postgres`/`postgres` |
| `ALLOWED_HOSTS` | `+= [".gateway.test"]` |
| `CSRF_TRUSTED_ORIGINS` | `+= http://{www,voices,direct,flagoff}.gateway.test:{10080,10081}` |
| `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` | `False` |
| `SESSION_COOKIE_DOMAIN`, `CSRF_COOKIE_DOMAIN` | `None` |
| `DEVELOPER_SETTINGS_ENABLED` | env `DEVELOPER_SETTINGS_ENABLED` (`true`/`false`), set per process (8100 on, 8101 off) |
| `DEVELOPER_SETTINGS_MOCKS` | env `DEVELOPER_SETTINGS_MOCKS`, default `false` |
| `EMAIL_BACKEND` | SMTP to `127.0.0.1:11025` (mailpit), no TLS |
| `DOMAIN_MODULES` | `library: http://www.gateway.test:10080`, `voices: http://voices.gateway.test:10080`, for `en` and `he` |

After `migrate`, `auth_user_id_seq` restarts at `2_100_000_000`, so any account created through the UI stays above
the real Mongo profiles and outside the fixture band.

## 3. Fixture identity

### Id band and markers

| Thing | Value |
|---|---|
| User ids | `2_098_000_001` .. `2_098_000_999` (floor asserted on every delete). Do not use `2_099_000_001`..`007` (another suite) |
| User emails | `apikeys-e2e-<suite>-<role>@example.com`, lower-case (`role` lower-cased, e.g. `apikeys-e2e-gateway-deletedproject@example.com`) |
| Username | `_email_to_username(email)`, so the account can log in |
| Password | one shared value read from the file named by `APIKEYS_E2E_PASSWORD_FILE`; never argv, never logged |
| Project marker | `notes = "E2E api-keys <runId> (temporary)"` on every fixture project |
| Project flags | `is_published=False`, `consent_to_display=False`, always |
| `runId` | `YYYYMMDDTHHMMZ-<target>`, UTC, e.g. `20261013T2310Z-local` |
| Stack sentinel | local only: user `2_098_000_901`, project notes `E2E api-keys stack sentinel (local only)`. Keeps the registry non-empty. Seed `--teardown` leaves it unless `--include-sentinel`. Never created on the cauldron |

Teardown order: keys, then projects by marker, then users by the exact id list, then `purge_test_profiles`. A leftover
count (users in band, projects matching `E2E api-keys % (temporary)`, their keys) is printed last and must be 0.

### Accounts

`id = 2_098_000_000 + n`. Suites own their accounts; a mutating test never touches another suite's account. State
codes are the account states F1-F13 from the UI journeys research (F1 unconfirmed, F3 confirmed, F4/F5 SSO
verified/unverified, F7 set up with 0 projects, F8 with a project, F9 unclaimed listing, F12 Hebrew, F13 plain user).

| n | Suite | Role | State | Fixtures |
|---|---|---|---|---|
| 001 | gateway | `open` | F8 | key `open`, no origins |
| 002 | gateway | `restricted` | F8 | key `restricted`, origins `["https://site-a.example.com"]` |
| 003 | gateway | `revoked` | F8 | key `revoked`, revoked |
| 004 | gateway | `deletedProject` | F8 | key `deletedProject`, project soft-deleted through `delete_project` |
| 005 | gateway | `full5` | F8 | keys `full5.1`..`full5.5` |
| 101 | onboarding | `unverified` | F1 | |
| 102 | onboarding | `unverifiedResend` | F1 | |
| 103 | onboarding | `expiredLink` | F2 | expired link via `--mint-expired-link` |
| 104 | onboarding | `ssoVerified` | F4 | Google `SocialAccount`, `email_verified: true` |
| 105 | onboarding | `ssoUnverified` | F5 | Google `SocialAccount`, `email_verified: false` |
| 201 | projects | `setUp` | F7 | |
| 202 | projects | `listingOwner` | F9 | one unclaimed listing (`owner=None`, `creator_email` = this account), marked |
| 203 | projects | `otherAccount` | F7 | |
| 301 | keys | `setUp` | F8 | project, 0 keys |
| 302 | keys | `twoTabs` | F8 | project, keys `twoTabs.1`..`twoTabs.4` |
| 401 | account | `password` | F13 | |
| 402 | account | `hebrew` | F12 + F13 | |
| 403 | account | `gauth` | F13 | Google `SocialAccount` |
| 404 | account | `toDelete` | F8 | key `toDelete` (N-M6) |
| 501 | callers | `mobile` | F13 | |
| 502 | callers | `eval` | F13 | |
| 503 | callers | `legacy` | F13 | legacy Mongo key via `--legacy-key` (B10) |
| 601 | a11y | `setUp` | F8 + F9 | project with key `a11y.1`, one unclaimed listing |
| 602 | a11y | `hebrew` | F12 + F8 | project with key `a11yHe.1` |
| 701 | scenarios | `legacyBody` | F13 | legacy Mongo key (B9) |
| 702 | scenarios | `tierOwner` | F8 | key `tierOwner` (N-A11, E1) |
| 901 | stack | `sentinel` | F8 | local only, see above |

Website origins for restricted keys and browser CORS pages: `https://site-a.example.com` (the key's website) and
`https://site-b.example.com` (another site). Specs serve both with `page.route`; nothing is fetched from them.

Tier is the `tier_id` column of the profile's live row in `api_project` (one per profile; `api_tier` holds the seeded tiers developer, partner and internal, and `api_tier_meter_limit` the monthly limits per tier). The local-stack drills set it through `set_project_tier`. Every key of a project shares that tier and the project's counters. The profile table `powered_by_project` keeps the metadata, the key table keeps the keys, and each key points at its `api_project` row. Raw SQL that deletes a profile must delete its `api_project` row, and that row's keys, first, because the FK from `api_project` to the profile is deferred and refuses the delete at commit.

## 4. Manifest

`e2e-tests/.apikeys-e2e.json` (override: `APIKEYS_MANIFEST`). Git-ignored, written by `--manifest-stdout`, never
committed, never pasted into logs or reports. Fields not listed here may be added; none may be renamed.

```json
{
  "schemaVersion": 1,
  "target": "local",
  "baseURL": "http://www.gateway.test:10080",
  "runId": "20261013T2310Z-local",
  "marker": "E2E api-keys 20261013T2310Z-local (temporary)",
  "createdAt": "2026-10-13T23:10:04Z",
  "passwordFile": "<path from APIKEYS_E2E_PASSWORD_FILE>",
  "accounts": [
    {"suite": "gateway", "role": "open", "id": 2098000001,
     "email": "apikeys-e2e-gateway-open@example.com", "state": "F8", "why": "A1: valid unrestricted key"}
  ],
  "projects": [
    {"suite": "gateway", "role": "open", "id": 0, "name": "...", "kind": "developer", "deleted": false}
  ],
  "keys": [
    {"suite": "gateway", "name": "open", "id": 0, "projectId": 0, "value": "sfr_...",
     "allowedOrigins": [], "revoked": false}
  ],
  "legacyKeys": [
    {"suite": "callers", "role": "legacy", "value": "...", "mongoId": "..."}
  ]
}
```

- `projects[].kind` is `developer` or `listing`.
- `keys[].value` and `legacyKeys[].value` are secrets: helpers mask them to the first 4 characters in every message,
  annotation, attachment and trace. Identify keys by `suite` + `name` in output.

## 5. Environment variables

| Variable | Used by | Default / rule |
|---|---|---|
| `APIKEYS_TARGET` | config, seed (`--target`), helpers | required, `local` or `cauldron` |
| `APIKEYS_MANIFEST` | seed, fixtures | `e2e-tests/.apikeys-e2e.json` |
| `APIKEYS_E2E_PASSWORD_FILE` | seed, `auth.setup.ts` | `.claude/scratch/api-keys-e2e/password` under the repo root (git-ignored); must exist |
| `APIKEYS_RUN_ID` | seed | generated when unset |
| `APIKEYS_WORKERS` | config | local 4; cauldron 2, and values above 2 are clamped |
| `APIKEYS_REGISTRY_URL` | `registry.ts` | local `http://127.0.0.1:18080`; cauldron only when set (port-forward `svc/auth-service-<cauldron> 18081:8080`, default `apisplit` or `$APIKEYS_CAULDRON` → `http://127.0.0.1:18081`), otherwise the helper falls back to polling the gateway. Replaces the plan's `REGISTRY_URL` |
| `APIKEYS_MAILPIT_URL` | `mail.ts` | local `http://127.0.0.1:18025`; unset on the cauldron (no mailbox) |
| `APIKEYS_KUBE_CONTEXT` | cauldron scripts | must equal `gke_development-205018_us-east1-b_cluster-1`; anything else is refused |
| `DEVELOPER_SETTINGS_ENABLED`, `DEVELOPER_SETTINGS_MOCKS` | Django wrapper | per process, see §2 |
| `AUTH_MODE`, `GATED_PATHS`, `RELOAD_INTERVAL`, `PG_NOTIFY_CHANNEL` | compose → `authsvc` | `enforce`, `/api/knn-search`, `60s`, `sefaria_apikeys` |

Process env wins over `e2e-tests/.env`. Do not create an `e2e-tests/.env` in the worktree.

## 6. Target capabilities

The `target` fixture exposes these flags; a spec that needs a missing one calls `test.skip(!flag, '<reason>')`.

| Flag | local | cauldron |
|---|---|---|
| `hasEcho` | yes | no |
| `hasNginx` | yes | yes |
| `hasStripOffListener` (10081) | yes | no (read-only kubectl instead) |
| `hasFlagOffServer` | yes | no |
| `hasRegistry` | yes | only with `APIKEYS_REGISTRY_URL` |
| `hasMailbox` | yes | no |
| `mocks` | value of `DEVELOPER_SETTINGS_MOCKS` on :8100 (default no) | yes |
| `canReadNginxLog` | `docker compose -p sefaria-apikeys-stack logs nginx` | `kubectl logs` (read-only) |
| `canSwapEnvoyConfig` | only through the stack owner | no |

## 7. Test conventions

- Titles start with the case ID: `A2b: unknown key on an ungated path is let through as anonymous`.
- A test that asserts desired behaviour which fails today stays failing: no `test.fail()`, no `xfail`, no
  `it.failing`. Its title carries `@known-gap <decision-id>` (e.g. `@known-gap D2`, `@known-gap N-D7`) so runs can
  filter with `--grep` / `--grep-invert`.
- Assert the status **and** the JSON `code` (`api_key_required`, `api_key_invalid`, `origin_not_allowed`), not only
  "not 4xx".
- 502, 503, 504, the KEDA splash page, `ERR_CONTENT_LENGTH_MISMATCH` and `Sefaria is not defined` are infra: annotate,
  retry once, never report as a product failure.
- Suites never restart the stack and never touch rows they did not seed.
- Playwright projects `apikeys-setup` and `apikeys` are opt-in (`--project=apikeys`) and are not part of the default
  run. Output goes to `e2e-tests/api-keys/results/` and storage states to `e2e-tests/api-keys/.auth/`, both
  git-ignored.
