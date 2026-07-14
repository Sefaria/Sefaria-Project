# API Key Research — Shared Brief (sc-45692)

> Context file for all research docs in this folder. Every doc should be written against this
> situation, not as a generic survey. Story: [sc-45692](https://app.shortcut.com/sefaria/story/45692),
> epic "Track off-Platform Data Usage". Deliverable: knowledge to let product make decisions;
> later compiled into an ADR.

## The problem

Sefaria's read API is effectively anonymous. We cannot answer "how many distinct projects
consume our API?" Over the coming months we want to:

1. **Identify** projects consuming the API — most likely via API keys, with developer self-serve issuance.
2. **Differentiate first-party** (Sefaria website, Sefaria MCP, mobile apps, Linker) from
   **third-party** services (Otzaria, Dicta, hobbyist apps, AI scrapers), accounting for
   client- vs server-side callers and key extractability.
3. **Track usage and enable authorization** while still allowing anonymous requests through
   during an extended communication/grace period.

Priorities (from Daniel): identification-first; quotas/tiers researched lightly as a future lever.
Mostly hobbyist/nonprofit consumers today, but we want flexibility to support bigger customers.
Prefer industry standards over custom solutions.

## Empirical traffic picture (28-day + 6-month nginx-log inventory, July 2026)

- **81% of all requests (286M of 351M / 28d) are `/api/*`**; ~350k requests/day are page views.
- After policy reattribution: **~85% of API traffic is Sefaria-operated or Sefaria-software-driven**
  (first-party web ~35–43%, Linker embeds on 3P sites ~11.5%, crawlers ~27% — but crawler traffic is
  ~95% render-driven, i.e. bots executing our own pages/JS; genuinely external ≈ **15%**).
- Server-side external ingest is growing fast (AI-scraper wave): largest single external consumer is an
  unidentified Supabase/Deno backend at ~823k req/day, 34.5% error rate, ~19k rotating IPs, uncontactable.
- Long tail: hobbyists (residential IPs, 100k–500k req/mo), nonprofits (Hadran, OU Torah apps),
  Google-Docs plugin, partner apps. ArtScroll is negligible (~300 req/day).
- Endpoints safest to key first (lowest external blast-radius): api/strapi, api/background-data,
  api/profile. Highest genuinely-external dependency: api/calendars 0.97, api/sheets 0.81,
  api/words 0.56, api/search-wrapper 0.41.
- Identification today is UA + referer only; nginx logs lack Host/Origin/cookies but flow to BigQuery
  (daily tables since 2020).

## Current stack (what any solution must fit)

Request path: **Cloudflare(?) → Envoy Gateway (K8s Gateway API, supports inline Lua + BackendTrafficPolicy) →
nginx (stock 1.23, no Lua; JSON access log → BigQuery) → Varnish (caches an allowlist of ~15 `/api/*` GET
patterns, cache key = URL only, TTL 1d/grace 10d) → Django (gunicorn) web pods**. Redis (django_redis)
available for counters; Celery for async tasks; MongoDB primary datastore + Postgres for Django auth.

Critical constraints discovered:

- **Varnish cache-key = URL only.** A header-carried key does not fragment the cache, so Django never
  sees cache-hit requests → metering/limits at Django level miss cached traffic. A query-param key
  fragments the cache per key. Any always-enforced scheme needs edge involvement (Envoy/nginx),
  a VCL `pass` on keyed requests, or acceptance of undercounting on ~15 cached GET patterns.
- **CORS is wildcard-open (`Access-Control-Allow-Origin: *`) at nginx** for everything; a new custom
  header must be added to `Access-Control-Allow-Headers` for cross-origin callers.
- **DRF is installed but endpoints are plain Django views**; no throttling configured anywhere.
- **Legacy prior art already in-repo**: `db.apikeys` Mongo collection ({uid, key}, plaintext, unscoped,
  one per user) checked via POST `apikey` param or `x-api-key` header on ~15 write endpoints;
  a static `MOBILE_APP_KEY` (via Firebase Remote Config) gating only /api/register; JWT (simplejwt)
  Bearer auth for logged-in mobile private calls; short-lived AES-GCM chatbot user tokens.
- Infra direction: Flanksource engagement is actively *reducing* infrastructure dependencies —
  new platforms carry real ops cost and need strong justification.

## First-party consumers and how they call the API today

| Consumer | Transport | Identity today | Secret-capable? |
|---|---|---|---|
| Web frontend (React) | same-origin fetch, session cookie + CSRF meta tag | cookies/UA | No (browser) |
| Node SSR | (does NOT call the API — Django pushes props to it) | n/a | n/a |
| Linker v3 embed | cross-origin fetch from 3P sites' visitors' browsers | Referer/UA only | No (runs on 3P origins) |
| Sefaria MCP server | server-side Python requests, default python-requests UA | none | Yes in hosted mode; no in local-stdio mode |
| Mobile apps (RN) | fetch, platform-default UA; JWT Bearer for private calls | JWT for logged-in only | No (decompilable/proxyable) |
| Internal scripts | server-side, legacy SEFARIA_BOT_API_KEY | legacy apikey | Yes |
| sefaria-eval etc. | browser fetch hardcoded to prod | none | No |

## What the research must feed

Product-facing decision points: key format & distribution; self-serve portal scope; anonymous
grace-period policy; first-vs-third-party differentiation mechanics; where enforcement lives
(edge vs app vs platform); usage-tracking pipeline; how tiers/quotas could bolt on later.
