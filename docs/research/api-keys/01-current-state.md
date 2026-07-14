# Current State: Sefaria's API Authentication & Identification Surface

> Part of the sc-45692 API-key research (see [00-brief.md](./00-brief.md)). Compiled from a
> code-level audit of Sefaria-Project (commit `66b745fb5`), sefaria-mcp, and Sefaria-Mobile,
> July 2026. All `file:line` citations are against that commit.

## Executive summary

- The public read API (60 documented paths in `docs/openAPI.json`) is **100% unauthenticated**;
  there is no `securitySchemes` block at all, and CORS is wildcard-open at nginx for every route.
- There is exactly **one** existing API-key mechanism: the Mongo `apikeys` collection —
  **plaintext, unhashed, un-indexed, unscoped, one key per user** — checked by copy-pasted inline
  code in ~15 write endpoints, not middleware. A valid key **fully impersonates** the mapped user.
- Auth is fragmented across **five-plus concurrent credential types**: legacy `apikey` param,
  `X-API-Key` header (honored on exactly one endpoint), JWT Bearer (simplejwt, active only on
  DRF-wrapped views), a shared `SEMANTIC_SEARCH_API_TOKEN` bearer, `MOBILE_APP_KEY` shared secret,
  webhook Basic Auth, and session cookies.
- **No rate limiting, throttling, or quota mechanism exists at any layer** (Django, nginx, Varnish,
  Envoy) — nothing to extend; it would be built from scratch.
- **Varnish caches ~15 `/api/*` GET patterns with cache key = URL only** (TTL 1d, grace 10d).
  A header-carried key would not fragment the cache — meaning Django-level metering/enforcement
  never sees cache-hit traffic. This is the single biggest architectural constraint.
- None of the first-party clients (web frontend, Linker, mobile, MCP) sends any deliberate
  identifying signal today beyond default UA/referer/cookies.

---

## 1. The legacy `apikeys` mechanism

### Creation

Keys are minted by a raw Python helper meant for an interactive staff shell (`python -i cli.py`) —
no management command, no admin UI, no self-serve:

```python
# sefaria/utils/user.py:108-121
def generate_api_key(uid):
    """ Save a new random API key for `uid` """
    ...
    key = base64.b64encode(hashlib.sha256(bytes(str(random.getrandbits(256)), encoding='utf-8')).digest(),
                           random.choice([b'rA', b'aZ', b'gQ', b'hH', b'hG', b'aR', b'DD'])).rstrip(b'==').decode('utf-8')
    db.apikeys.delete_many({"uid": uid})
    db.apikeys.insert_one({"uid": uid, "key": key})
```

- One active key per user; regeneration deletes-and-reinserts (no rotation history, no key IDs).
- `reset_all_api_keys()` (`sefaria/utils/user.py:124-129`) exists but is never called anywhere.
- Internal automation holds pre-generated keys as `SEFARIA_API_KEY` / `SEFARIA_BOT_API_KEY` in
  local_settings (undocumented convention; wired in prod via
  `helm-chart/sefaria/templates/configmap/local-settings-file.yaml:194`). Users:
  `scripts/move_draft_text.py`, `scripts/post_sheet.py`, `scripts/move_draft_category.py`,
  `scripts/scheduled/reindex_elasticsearch_cronjob.py`, `scripts/cauldron_links.py`.

### Storage & validation

**Plaintext equality lookup**: `db.apikeys.find_one({"key": key})`. The SHA-256 in generation only
derives random bytes; the digest itself is the transmitted/stored secret. No index or uniqueness
constraint on `apikeys.key` (`sefaria/system/database.py:100-219` has no `apikeys` entry) — every
lookup is a collection scan and nothing prevents duplicate keys.

Validation is copy-pasted per view. The one general helper is used by a single endpoint
(`notes_api` GET) and is the **only place the `X-API-Key` header is honored** — everywhere else the
key must be a POST form param named `apikey`:

```python
# reader/views.py:392-405
def user_credentials(request):
    if request.user.is_authenticated:
        return {"user_type": "session", "user_id": request.user.id}
    else:
        req_key = request.POST.get("apikey", None)
        header_key = request.headers.get("x-api-key", None) #request.META["HTTP_AUTHORIZATION"]?
        key = req_key if req_key else header_key
        ...
        apikey = db.apikeys.find_one({"key": key})
        ...
        return {"user_type": "API", "user_id": apikey["uid"]}
```

### Endpoints accepting `apikey` (full inventory)

| Endpoint (view) | apikey check | Staff check on apikey path? |
|---|---|---|
| `index_sheets_by_timestamp` | `sefaria/views.py:1403-1411` | ✅ |
| `notes_api` GET (via `user_credentials`) | `reader/views.py:2405` | n/a (read) |
| `modify_bulk_text_api` | `reader/views.py:1610-1617` | ❌ |
| `texts_api` POST (save text) | `reader/views.py:1743-1751` | ❌ |
| `complete_version_api` | `reader/views.py:1836-1843` | ❌ |
| `index_api` (via `determine_user_type_and_id`) | `reader/views.py:2013-2023` | ❌ **gap — see below** |
| `links_api` POST | `reader/views.py:2318-2328` | ❌ (DELETE separately staff-gated) |
| `notes_api` POST | `reader/views.py:2429-2437` | ❌ |
| `flag_text_api` | `reader/views.py:2695-2706` | ✅ |
| `category_api` POST | `reader/views.py:2779-2789` | ✅ |
| `terms_api` POST/DELETE | `reader/views.py:2943-2953` | ✅ |
| `updates_api` POST | `reader/views.py:3172-3181` | ✅ |
| `delete_sheet_api` | `sourcesheets/views.py:291-298` | ❌ (owner check) |
| `collections_api` POST (anon branch) | `sourcesheets/views.py:330-338` | ❌ |
| `save_sheet_api` | `sourcesheets/views.py:574-582` | ❌ |

### What a key grants — and a real authorization gap

A key resolves to `{"uid": <int>, "key": <str>}` and the endpoint acts as that user. Moderator-grade
object types (categories, terms, updates, flags, sheet reindex) re-check `is_staff` on the apikey
path; ordinary crowdsourced content writes (texts, links, notes, sheets) deliberately don't.

**Gap:** `index_api` (create/edit book Index records — moderator-grade; the session path requires
staff) does **not** check `is_staff` on the apikey branch:

```python
# reader/views.py:2013-2023
def determine_user_type_and_id(request):
    if request.user.is_staff:
        return ADMIN_TYPE, request.user.id
    else:
        key = request.POST.get("apikey")
        if key:
            apikey = db.apikeys.find_one({"key": key})
            if apikey:
                return CONTENT_TYPE, apikey["uid"]
    return None, None
```

Any valid key belonging to any regular user can create/edit Index records. A privilege-escalation
inconsistency that the replacement system should close.

### Lifecycle holes

No list/label/scope/revoke UI anywhere (no Django-admin registration, no profile page).
`delete_user_account` and `merge_user_accounts` (`sefaria/utils/user.py:16-105`) do **not** clean up
`db.apikeys` — deleted users leave live orphaned keys behind.

---

## 2. The other credential mechanisms (fragmentation inventory)

| Mechanism | Scope | Where |
|---|---|---|
| Session cookie + CSRF | Whole site; same-origin `/api/*` calls from frontend | Django auth; `SESSION_SAVE_EVERY_REQUEST=True` (`sefaria/settings.py:204`); cross-subdomain cookies via `SessionCookieDomainMiddleware` (`sefaria/system/middleware.py:196-226`) |
| Legacy `apikey` / `x-api-key` | ~15 write endpoints (above) | Mongo `apikeys` |
| JWT Bearer (simplejwt 5.3.1) | Login/refresh (`api/login`, `api/login/refresh`), and transparently on every DRF `@api_view` endpoint via `DEFAULT_AUTHENTICATION_CLASSES` (`sefaria/settings.py:197-202`): `all_notes_api`, `portals_api`, `profile_sync_api`, `delete_user_account_api`, `register_api`, `find_refs*`, `websites_api`, sheet-list endpoints | Access 1d / refresh 90d, rotation on (`sefaria/local_settings_example.py:257-263`). Plain user-identity claims — no client_id/scope |
| `SEMANTIC_SEARCH_API_TOKEN` | One endpoint: `POST /api/knn-search` (`api/views.py:241-248`) | Single shared bearer string from settings |
| `MOBILE_APP_KEY` | One endpoint: `/api/register` captcha bypass (`sefaria/forms.py:110-122`) | Single shared secret; mobile fetches it at runtime from Firebase Remote Config (`Sefaria-Mobile/AuthPage.js:43-50`) — extractable via traffic inspection either way |
| Webhook Basic Auth | `rebuild_shared_cache`, `strapi_cache_invalidate` (`sefaria/decorators.py`, `WEBHOOK_USERNAME/PASSWORD`) | Falls back to staff session |
| Chatbot `X-Session-ID` | Chatbot callback path only — `SessionIDAuthMiddleware` (`sefaria/system/middleware.py:319-354`) | AES-GCM encrypted, TTL'd tokens (`sefaria/utils/chatbot.py:45-77`) — the strongest token design in the codebase; good internal prior art |
| Google OAuth2 | Sheet-export-to-Drive only (`sefaria/gauth/`), requires existing session | Not an API auth scheme; there is no "Sign in with Sefaria" OAuth provider |

Notable unauthenticated surfaces worth flagging alongside key work:
- **`strapi_graphql_cache`** (`sefaria/views.py:1421-1520`): `@csrf_exempt`, no auth, accepts arbitrary
  GraphQL and proxies to internal Strapi — an unauthenticated proxy into internal infrastructure.
- **`api/search-wrapper*`** (`reader/views.py:4769-4794`): unthrottled open proxy to Elasticsearch.
- **nginx `/api/search/` path**: ES reverse proxy with regex allowlist and server-side Basic auth
  injection (`nginx.template.conf.tpl:90-100`).

### Decorators / patterns

- `catch_error_as_json`, `sanitize_get_params` (`sefaria/system/decorators.py`) — error shaping, not auth.
- `cors_allow_all` (`sefaria/system/decorators.py:160-182`) — per-view open CORS + csrf_exempt; used
  only on the linker's `find_refs_api` and `async_task_status_api`.
- The de facto write-auth "middleware" is an inlined pattern repeated ~15×: `@csrf_exempt` on the view,
  then branch — session user gets a locally-defined `@csrf_protect` closure; apikey path skips CSRF
  (correct, not cookie-based). Example at `reader/views.py:1743-1759`.
- `staff_member_required` on API-ish admin routes redirects to an HTML login page rather than
  returning JSON 401 — inconsistent for programmatic clients.
- The newer **`api/` app** (v3: `Text`, `RefView`, `KnnSearch`; 320 lines) is the cleanest place to hang
  a coherent auth/error scheme; note it uses a different error envelope (`invalid_input_error`, real
  400s) than the legacy `{"error": ...}`-with-HTTP-200 convention (`sefaria/client/util.py:14-34`).
  Versioning overall is ad hoc (v2/v3 markers sprinkled per endpoint, not a wholesale API version).

---

## 3. Request path & infrastructure

```
Client
  → Envoy Gateway (K8s Gateway API, className "envoy"; TLS; inline Lua already used to set
      X-Original-Forwarded-For from CF-Connecting-IP — templates/gateway/extensionpolicy.yaml;
      BackendTrafficPolicy CRD already vendored, used only for KEDA splash page)
  → nginx (stock nginx.org 1.23.3 + opentracing module only — NO Lua/njs;
      config rendered via envsubst, not Helm — configmap/nginx.yaml:36-39;
      global CORS fallback; JSON access log → stdout → Cloud Logging sink → BigQuery;
      no limit_req anywhere; everything proxied to a single Varnish upstream)
  → Varnish (blue/green Rollouts; VCL in templates/configmap/varnish-config.yaml)
  → Django web pods (gunicorn; Argo Rollouts blue/green)
```

Available substrate: Redis (`django_redis`, DB0 default + DB1 "shared" that Node reads; DB0 also
carries MultiServer pub/sub — counters should get their own namespace/DB), Celery `tasks` workers
(natural home for async usage-event logging), MongoDB primary + Postgres (Django auth).

### The Varnish constraint (critical)

The VCL caches an allowlist of `/api/*` GET patterns — `api/texts` (minus versions/random/layer=),
`api/v3/texts`, `api/links(/bare)`, `api/related` (minus private=1), `api/preview`, `api/counts`,
`api/index/*`, `api/v2/(raw/)index`, `api/regexs`, `api/bulktext`, `linker(.v3).js`, `api/stats`,
`api/find-refs/cache-lookup`, `api/websites/` — stripping Cookie and Accept-Language, and **passes
everything else uncached** (all POSTs, all other GETs: calendars, name, shape, sheets, profile...).

```vcl
# varnish-config.yaml:75-83  — cache key is URL ONLY (Host deliberately excluded)
sub vcl_hash {
    hash_data(req.url);
    return (lookup);
}
# varnish-config.yaml:85-110 — force-cache 1 day, serve stale up to 10 days
set beresp.ttl = 1d;
set beresp.grace = 10d;
```

Consequences for key design:

- A **header-carried key does not fragment the cache**: a cached response is served identically to
  any caller of the same URL, and Django never sees cache hits → per-key metering/limits at the app
  layer undercount, and over-quota keys still get cached content.
- A **query-param key fragments the cache per key** — per-key copies of hot responses (memory blowup)
  and still no per-request Django visibility within the TTL.
- Options: enforce/meter at the edge (Envoy is the only component that sees 100% of traffic and
  already runs Lua; its BackendTrafficPolicy supports rate limiting), add a one-line VCL rule to
  `pass` keyed requests (loses cache benefit for keyed traffic), meter from logs instead of inline
  (nginx sees every request incl. cache hits — but the key must be added to `log_format`), or accept
  undercounting on the ~15 cached GET families.
- For the majority of endpoint families (not on the allowlist) this is moot — they already hit
  Django every time.

### CORS

nginx stamps `Access-Control-Allow-Origin: *` on any response that doesn't set its own
(`nginx.template.conf.tpl:28-35`) — the entire API is already open to cross-origin browser reads.
`Access-Control-Allow-Credentials` is never set, so cookie auth is effectively same-origin-only.
Only `Content-Type` is in `Access-Control-Allow-Headers` (via `cors_allow_all`); **any new custom
key header must be added to the allow-list for cross-origin callers, and cross-origin custom headers
trigger CORS preflight** (extra OPTIONS request per call from linker-type embeds).

### Logging & metering substrate

nginx `log_format structured` (`nginx.template.conf.tpl:24-25`) captures method, URL, status, sizes,
UA, referer, remoteIp (from the Envoy-injected `X-Original-Forwarded-For`), latency. **Absent: Host,
Origin, cookies, any auth/key field.** `host` in the log is the pod hostname, not the request Host.
Logs flow to BigQuery (daily tables since 2020) — the substrate the July 2026 consumer inventory was
built on. Adding a key (or hashed key/key-prefix) field to this log line is a one-line change and
would make BigQuery per-key metering work for **all** traffic including Varnish hits.

No rate limiting exists at any layer; no django-ratelimit/axes in requirements; DRF throttle classes
unconfigured; no ingress rate-limit annotations; Varnish's only abuse control is four hardcoded
UA bans (MegaIndex, Sogou, SemrushBot, YandexBot → synth 403). robots.txt does not disallow `/api/`.

---

## 4. First-party consumers (who needs a key and what kind)

| Consumer | Transport | Identity today | Where a key would go | Secret-capable? |
|---|---|---|---|---|
| **Web frontend** (React SPA) | Same-origin fetch/XHR; cookies ride along; writes add `X-CSRFToken` from a meta tag (`static/js/sefaria/csrf.js:23-32`) | Session cookie, UA | `apiRequestWithBody` headers (`sefaria.js:947-977`) and `_ApiPromise` (`sefaria.js:3689-3697`); or server-injected into the `Sefaria.js` bundle (`sefaria/views.py:381-404`) — but note `data.js` is cached immutable 1y | ❌ browser — publishable only |
| **Node SSR** | **Does not call the API.** Django POSTs props to Node (`reader/views.py:233-282` → `node/server.js:103`); Node reads shared data from Redis DB1. The internal Django→Node hop is itself unauthenticated (cluster-network trust only) | n/a | n/a (separate hardening item if desired) | n/a |
| **Linker v3 embed** | Sefaria JS loaded by third-party sites; visitors' browsers call `find-refs`, `async/{id}`, `websites/{domain}`, `find-refs/report` cross-origin, no credentials (`static/js/linker.v3/main.js:388-476`) | Referer/UA only; calling site self-reports its hostname to `/api/websites/{domain}` | Per-site ID in the embed snippet (`sefaria.link({...})` options) — GA-tracking-ID-style; inherently public | ❌ runs on 3P origins |
| **Sefaria MCP server** | Server-side Python `requests`, bare calls, default `python-requests/x.y` UA (`sefaria-mcp/src/sefaria_mcp/logic.py:14,32-51`) | None | Env-var key + default header on a shared `requests.Session` | ✅ hosted mode; ❌ local-stdio mode (users run it themselves) |
| **Mobile apps** (React Native) | `fetch` with platform-default UA (no custom UA anywhere); JWT Bearer only for logged-in private calls (`Sefaria-Mobile/api.js:779-833`); `mobile_app_key` on register only; offline bundles from separate `readonly.sefaria.org` host | JWT for logged-in; otherwise nothing | Single chokepoint `Api._request` (`api.js:779-790`) + 3 out-of-band Bearer call sites | ❌ decompilable/proxyable — identifier only (or attestation) |
| **Internal scripts/cron** | Server-side, legacy `SEFARIA_BOT_API_KEY` | Legacy apikey | Already keyed; migrate to new scheme | ✅ |
| **sefaria-eval frontend** | Browser fetch hardcoded to prod `www.sefaria.org/api/v3` (`frontend/src/lib/api.ts:910-919`) | None | Example of internally-owned tools indistinguishable from third parties today | ❌ |

---

## 5. User accounts & where self-serve would hang

- Django auth + `emailusernames` (login by email). Registration: web form with reCAPTCHA
  (`SefariaNewUserForm`), or API/mobile JWT registration gated by `MOBILE_APP_KEY`
  (`SefariaNewUserFormAPI`, `sefaria/forms.py:110-122`).
- **No "developer" concept exists** — no profile field, group, or flag. The one existing
  permission-group hook: `UserProfile.has_permission_group` (`sefaria/model/user_profile.py:301-306`,
  used once for an "Editors" group) — a natural mechanism for an "API Developer" flag without
  schema migration.
- `UserProfile` (Mongo `db.profiles`, `sefaria/model/user_profile.py:309+`) holds settings/slug/CRM
  ids; no api_keys field. Account-settings routes exist (`sefaria/urls_library.py:38-40`) to hang a
  "My API keys" page off.

---

## 6. Implications the research must answer to (summary)

1. **Replace, don't extend** the `apikeys` pattern (no hashing/index/scopes/expiry/revocation/audit;
   the `index_api` staff gap; orphaned keys on account deletion).
2. **Consolidate** 5+ credential mechanisms into one coherent scheme (or explicitly justify survivors).
3. Key transport choice interacts with **Varnish (cache-key=URL)** and **CORS preflight** — the
   metering point (edge log vs app inline) is a first-class architectural decision, not a detail.
4. First-vs-third-party differentiation must work with **zero secret-capable first-party clients**
   except server-side services — publishable identifiers + origin/attestation restrictions is the
   relevant industry pattern to evaluate.
5. Self-serve needs an **application/project abstraction** (the story asks to count projects) that
   doesn't exist today, plus lifecycle (rotation, revocation, cleanup on account deletion).
6. Rate limiting/quota starts from zero; Redis/Celery/BigQuery are the available substrate; Envoy
   Gateway is the only layer that sees every request.
