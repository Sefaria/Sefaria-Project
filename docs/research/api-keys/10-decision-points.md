# Synthesis: Decision Points for Product

> The capstone of the sc-45692 research (see [00-brief.md](./00-brief.md) and the README index).
> This distills docs 01–09 into the decisions product and engineering need to make, the realistic
> options for each, and what the research recommends. It is the skeleton the eventual ADR should
> be compiled from.

## The one-paragraph story

Sefaria's read API is anonymous; we want to know **what projects** consume it, without breaking a
goodwill ecosystem that is ~85% Sefaria-software-driven and ~15% genuinely external. The industry
has two relevant playbooks, and they compose: the **open-content playbook** (Wikimedia, Crossref,
DPLA) says identification and enforcement are separable — ship self-serve identification first,
keep anonymous access working indefinitely at a humbler service tier, and treat enforcement as a
later, separate decision; the **commercial playbook** (Stripe, GitHub, Google Maps, OpenAI) supplies
the mechanics — project-scoped prefixed keys, publishable-vs-secret key classes, display-once
portals, differential rate limits as the carrot. Our own stack adds one hard constraint the
comparables don't have: Varnish caches the hottest API GETs keyed on URL only, so anything that
must see *every* request (metering, enforcement) has to live at the edge (nginx logs / Envoy
Gateway), not in Django. Fortunately nginx logs already flow to BigQuery and Envoy Gateway (already
deployed) natively supports API-key auth and per-key rate limiting — the infrastructure story is
mostly "use what we have harder," not "buy a platform."

## Decision 1 — What is the unit of identification?

**Recommendation: a registered "App/Project" entity, owned by a Sefaria user account, holding one
or more keys.** (04 §6, 09 §3)

- The story's goal is counting *projects*, not users. OpenAI's retrofit of projects onto user-bound
  keys is the cautionary precedent for starting user-scoped (04).
- First-party services become internal projects with a `first_party`/`internal` flag in the same
  system — one taxonomy, not parallel mechanisms (05 §6, 07 §8.2).
- The legacy `db.apikeys` (user-scoped, plaintext, one per user, with a real privilege-escalation
  gap in `index_api`) gets migrated into this and retired (01 §1).

Product call embedded here: require a Sefaria account for key issuance (recommended — we already
have the identity layer, and it gives "view my keys again" for free) vs. NASA-style name+email
no-account friction (09 §9.3).

## Decision 2 — One key class or two?

**Recommendation: two classes, split by consequence-of-leak, not by consumer.** (03 §9–10, 05 §1)

1. **Publishable/attribution keys** — safe to expose; embedded in the web frontend bundle, the
   Linker snippet (one per installing site — the GA-tracking-ID pattern), mobile app builds, and
   local-stdio MCP. Extraction is a non-event because the key grants nothing beyond anonymous
   access; its job is attribution. Optionally origin-bound (browser-unforgeable, curl-spoofable —
   attribution, not security; Google Maps' own documented stance).
2. **Secret keys** — server-side only (hosted MCP, internal cron/scripts, third-party backends):
   display-once, hashed at rest, revocable, rotatable with a Stripe-style overlap window.

Anonymous (no key at all) remains a supported third state throughout the extended grace period —
and possibly forever, at a throttled tier (Wikimedia model).

## Decision 3 — Key format & transport

**Recommendation: opaque prefixed bearer keys (`sfr_live_...` style, 256-bit, base62), salted
SHA-256 at rest, sent as a header.** Not JWT, not OAuth, not request signing (04 §1, §8; 02 §8 —
no surveyed org uses JWTs for app identification; AWS SigV4 explicitly rejected, 03 §10.6).

The genuine open sub-question is **header vs query param for the ~15 Varnish-cached GET families**:

| | Header (`Authorization: Bearer` / `X-Api-Key`) | Query param (`?apikey=`) |
|---|---|---|
| Varnish cache | Not fragmented (good) but invisible to Django on hits | Fragmented per key (memory cost) but visible end-to-end |
| Security | Standard; keys out of URLs/logs/referers (Europeana migrated *to* headers for this) | Leaks via logs, browser history, referers |
| CORS (Linker) | Triggers preflight on cross-origin calls | No preflight |
| Industry direction | Consensus | Legacy (NASA, DPLA still do it) |

Resolution (06 §7, 02 §4): **keep headers and stop trying to make Django see everything** — meter
at nginx (pre-Varnish, logs already in BigQuery) and enforce, when the time comes, at Envoy
(pre-Varnish). Neither requires cache-key changes or param keys. Django-level counting is then a
convenience, not the system of record.

## Decision 4 — Where do metering and (eventual) enforcement live?

**Recommendation: phased composition (06 §7): ship log-based metering now; add app-level
enforcement where it's cheap; adopt Envoy edge enforcement only when cached-endpoint quotas become
a real requirement.**

- **Phase 1 (metering, ~free):** add a key-ID field to the nginx `log_format` (one line) →
  per-key BigQuery views (last-used, req/day). Includes Varnish cache hits by construction.
  No enforcement coupling. Matches "identification-first" exactly.
- **Phase 2 (soft enforcement):** django-ratelimit/DRF throttles over existing Redis for write
  endpoints and non-cached GETs; differential anonymous-vs-keyed limits as the incentive
  (GitHub 60/5000 pattern); 429 + `Retry-After` + `RateLimit-*` headers from day one, even
  warn-only.
- **Phase 3 (edge enforcement, only if needed):** Envoy Gateway `SecurityPolicy` APIKeyAuth +
  `BackendTrafficPolicy` global rate limiting (native since ~v1.3) — the only cache-inclusive,
  cluster-accurate option. Costs: a Rate Limit Service + Redis wiring + a Django→Secret sync job
  for dynamic keys. Deliberately deferred; cuts against the infra-reduction direction until the
  payoff is demonstrated.

**Platforms ruled out** (07 §8): Kong (2025 OSS rug-pull), Tyk (portal is the paid product),
APISIX (new etcd cluster), KrakenD (key-auth is Enterprise-only), Apigee (≥$4.4k/yr + heavyweight),
GCP API Gateway (a hosted Envoy we already run), Backstage (wrong shape), Unkey (AGPL,
self-hosting immature). Zuplo is the one worth a time-boxed spike *only if* portal-building
in-house balloons.

## Decision 5 — First-party vs third-party differentiation

**Recommendation: same key system for everyone, differentiated by project flags and key class —
not a separate first-party mechanism.** (05 §8)

| Consumer | Mechanism |
|---|---|
| Web frontend | Session/same-origin already identifies it; add a publishable key for logging parity only. Don't force cached GETs to carry per-user identity. |
| Linker embeds | **Per-installing-site publishable key in the snippet** (GA/Stripe.js pattern) + Origin as corroboration. Converts the opaque 11.5% Linker bucket into per-site attribution with per-site revoke/throttle. Needs `Access-Control-Allow-Headers` widened; note CORS-preflight cost. |
| Mobile apps | Publishable per-platform key baked in; JWT stays for logged-in calls; attestation (Play Integrity/App Attest) explicitly deferred as a future lever. |
| Hosted MCP | Real secret key, `internal=true`. Open sub-question: should MCP traffic on behalf of external AI users carry a distinct identity from Sefaria-internal calls? |
| Local-stdio MCP | Bring-your-own-key via env var (OpenAI/Anthropic convention) — natural first cohort for the self-serve portal. |
| Internal scripts/cron | Migrate `SEFARIA_BOT_API_KEY` into the new system, `internal=true`. |

Spoofability ladder (05 §7): UA < Referer < Origin < bundle-ID < origin-locked key < attestation
< IP allowlist < server-held secret. Design assumes publishable keys are copied; that's fine.

Also worth adopting cheaply: a **no-credential identification convention** (descriptive User-Agent
with contact info, Wikimedia/Crossref/OpenLibrary style) documented as the minimum ask for callers
who won't register — it costs nothing and improves the logs' long tail (02 §1).

## Decision 6 — The anonymous grace period and rollout

**Recommendation: Playbook C→(A+B) from 08 §9: incentive-only first, then enforcement phased by
endpoint blast-radius with consumer-class outreach running alongside.**

- **Phase 1 (incentive-only, Crossref-style):** ship the portal; keyed callers get a visibly
  better deal (higher limits, dashboards); anonymous unchanged; blog/docs comms, no deadlines.
  Buys adoption data and goodwill; tests the portal against real traffic with zero backlash risk.
- **Phase 2:** per-endpoint enforcement in blast-radius order (start `api/strapi`,
  `api/background-data`, `api/profile`; save `api/calendars` 0.97 and `api/sheets` 0.81 for last),
  each with `Deprecation`/`Sunset` headers → announced brownouts → warn-mode → throttled-anonymous
  (never a hard 401 — Wikimedia, not Google Maps). Concurrently: direct outreach to the known
  third parties (Hadran, OU, Google-Docs plugin, etc. — we have the list from the inventory).
- **The unidentifiable scraper** (823k req/day Supabase/Deno): every precedent says communication
  never reaches this population — it's handled by uniform anonymous-tier throttling, as a standing
  abuse-policy decision decoupled from the keying timeline. First step is a cheap BigQuery ASN
  check before building any bespoke tooling (06 §8.5).
- Honest expectations: Crossref's data shows incentive-only conversion is slow; Wikimedia took
  ~2 years from policy to enforcement. The timeline should be product-owned, not implied.

## Decision 7 — Portal scope (the product-facing build)

**Recommendation: start with Option A-plus (09 §9): one "Get an API key" page — project name,
required one-line description (this field IS the deliverable of the whole initiative), contact
email, ToS/attribution checkbox → display-once key.** Add from Option B early: last-used timestamp
and revoke (cheap, high-value). Defer: scopes UI, multiple keys per app, usage dashboards (the
BigQuery pipeline makes a later per-key dashboard a query surface, not a new pipeline).

Internal/first-party keys are issued admin-side, not through the public portal (09 §5).

## Cleanups the work should sweep in (from 01, regardless of design chosen)

1. Close the `index_api` apikey staff-check gap (privilege escalation).
2. Hash + index the key store; retire plaintext `db.apikeys`; wire key cleanup into account
   deletion/merge.
3. Consolidate or explicitly justify the five parallel credential mechanisms
   (`SEMANTIC_SEARCH_API_TOKEN`, `MOBILE_APP_KEY`, webhook Basic Auth, JWT, apikey).
4. Flag the unauthenticated `strapi_graphql_cache` proxy and the unthrottled search-wrapper
   ES proxy as adjacent risks.
5. Set an explicit User-Agent in the MCP server and mobile apps now — zero-cost identification
   improvement independent of everything above.

## What must go to product (the actual ADR asks)

1. **Account-gated self-serve keys?** (rec: yes, reuse Sefaria accounts)
2. **What registration fields are required?** (rec: name + description + email + ToS; category
   optional) — friction here trades directly against the data quality that motivated the story.
3. **Anonymous policy end-state:** throttled-forever (Wikimedia/Crossref) vs eventually-required
   (NYT/DPLA)? (rec: throttled-forever; revisit only under abuse pressure)
4. **Rollout pace and comms ownership** for Phase 2, including who owns outreach to the named
   third parties.
5. **Linker keying** = per-site registration at embed time — a small product change to how the
   Linker is distributed/installed.
6. **Attribution/ToS policy text** (open-content orgs pair keys with attribution requirements).
7. **Budget check on Phase 3** (Envoy enforcement) — approve the phased approach so engineering
   doesn't build enforcement infrastructure before metering proves the need.
