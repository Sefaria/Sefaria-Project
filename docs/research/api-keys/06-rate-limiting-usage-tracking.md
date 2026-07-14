# Rate Limiting + Usage Tracking for a Keyed-but-Anonymous-Allowed API

> Research doc for sc-45692 (epic "Track off-Platform Data Usage"). Read against
> `00-brief.md`, especially the Varnish cache-key constraint (cache key = URL only,
> so app-level metering misses cache hits) and "identification-first, quotas
> later" scoping. Scope: usage metering pipelines, anonymous+keyed coexistence,
> rate-limit algorithms, enforcement location (Django/nginx/Envoy Gateway),
> response conventions, and handling abusive anonymous traffic during the
> identification-first transition. Ends with concrete metering architectures
> sketched for Sefaria's actual stack.

_Status: COMPLETE._

## 1. Usage metering pipelines

The brief's stack is: **Envoy Gateway → nginx (JSON access log → BigQuery) → Varnish (URL-only
cache key) → Django**. One fact from `00-brief.md` reframes this whole section: **nginx sits in
front of Varnish**, so nginx's access log already captures every request — cache hits and misses
alike — before Varnish ever makes a caching decision. The "Django-level metering misses cache
hits" problem is specifically a problem for metering/enforcement that lives *inside* Django (or
in Django-facing Redis counters); it is not a problem for the nginx→BigQuery pipeline that
already exists. That reframes metering-pipeline choice as much as it reframes enforcement
location (see §4 and §7).

### Log-based (access logs → BigQuery) — what Sefaria already has

This is the "free" option: extend an existing pipeline rather than build a new one.

- **Coverage**: correct-by-construction for cache hits, because nginx logs pre-Varnish. This is
  the one pipeline that doesn't need a Varnish VCL change to see the full request volume.
- **Latency**: batch-oriented by default. Classic log-to-BigQuery pipelines (Fluentd/Logstash
  tailing files, or Cloud Logging sinks) land rows anywhere from "a few seconds" to "minutes"
  behind real traffic; BigQuery's streaming-insert API supports true near-real-time ingestion
  (default quota 100,000 rows/sec, raisable) but Sefaria's current pipeline is daily tables,
  i.e. built for retrospective analysis, not live dashboards or live quota enforcement.
  ([UnfoldAI: server logs stream into BigQuery](https://unfoldai.com/server-logs-stream-into-bigquery-yes-of-course/),
  [BigQuery streaming insert overview](https://hevodata.com/learn/bigquery-streaming-insert/),
  [Cloud Logging → BigQuery export](https://docs.cloud.google.com/logging/docs/export/bigquery))
- **What's missing today**: per the brief, nginx logs currently carry UA + referer only — no
  Host/Origin/cookies, and (implicitly) no API-key field. Making this pipeline key-aware for
  per-key dashboards is a **log-format change** (add `$http_x_api_key` or a hashed/truncated key
  ID to `log_format`), not an architectural one — nginx already sees the header on every request
  since it terminates the connection before Varnish.
- **Good for**: "last used", "requests/day", trend dashboards, anomaly investigation, billing
  reconciliation — anything that tolerates being hours-to-a-day stale. Not good for synchronous
  quota enforcement ("reject the 5001st request this hour") because of the batch latency and
  because it's a read path, not a gate in the request path.

### Inline counters (Redis)

- Redis (`django_redis`) is already available in Sefaria's stack. An inline counter — `INCR` a
  key like `ratelimit:{key_id}:{window}` with `EXPIRE`, or a Lua-scripted token bucket/sliding
  window (see §3) — gives synchronous, request-path-accurate counts, which log pipelines cannot.
- The catch is exactly the brief's constraint: if the counter increment lives in Django, it never
  fires for Varnish cache hits on the ~15 cached GET patterns — those requests are invisible to
  any Django-side counter. An inline counter only sees "true" traffic volume if it's placed
  upstream of Varnish (nginx via a scripting module, or Envoy Gateway — see §4) or if Sefaria
  accepts undercounting on cached endpoints (the brief already flags this as an acceptable
  fallback for some patterns).
- Good for: real-time quota/rate-limit enforcement, "requests remaining this window" headers,
  abuse circuit-breaking. Redis-backed rate limiters are the standard pattern; see the worked
  fixed-window/sliding-window/token-bucket implementations at
  [Redis's own rate-limiting tutorial](https://redis.io/tutorials/howtos/ratelimiting/) and
  [Svix's Redis rate-limiter writeup](https://www.svix.com/resources/redis/rate-limiter/).

### Analytics events (Segment/Mixpanel-style)

Not found to be common practice for API metering specifically (it's a product-analytics pattern,
tuned for funnels/behavioral analysis, not high-volume machine-to-machine request accounting).
Given Sefaria already has a log→BigQuery pipeline and BigQuery itself *is* usable as an analytics
warehouse, introducing a third-party events pipeline would be redundant infrastructure the
Flanksource direction argues against. Not recommended as a distinct pipeline; if finer-grained
"usage events" are wanted (e.g. one row per API-key-day with endpoint breakdown), that's a
BigQuery scheduled query over the existing log table, not a new ingestion path.

### Edge/CDN metering (Cloudflare / Fastly) — addressing the Varnish blind spot from a different angle

The brief asks specifically whether CDN-layer metering counts cache hits, because that's the
crux of the Varnish problem. Findings are mixed and worth internalizing before assuming a CDN
swap solves anything:

- **Cloudflare**: by default, **cached responses do not increment rate-limiting counters** —
  "cached requests consume minimal resources and don't need rate limiting" is Cloudflare's own
  framing. There is an opt-in parameter ("Also apply rate limiting to cached assets") to change
  this. So Cloudflare's rate-limiting product has *the same* blind-spot-by-default as Varnish;
  it's a switch, not an automatic win.
  ([Cloudflare rate-limiting parameters](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/))
- **Fastly**: Edge Rate Limiting counts by an arbitrary key (IP, header, etc.) at the edge in
  10-second buckets, but is explicitly **not designed for high precision** — Fastly's own docs
  warn it "may undercount by up to 10%" and recommend real-time log streaming + post-processing
  for precise per-key metering. Fastly does support **log streaming directly to BigQuery** as a
  first-class destination, which is architecturally identical to what Sefaria already does at
  the nginx tier.
  ([Fastly Edge Rate Limiting](https://docs.fastly.com/products/edge-rate-limiting),
  [Fastly → BigQuery log streaming](https://www.fastly.com/documentation/guides/integrations/logging-endpoints/data-warehouses-and-analytics/log-streaming-google-bigquery/))
- **Takeaway**: CDN products don't magically meter cache hits for free — they have the same
  hit/miss asymmetry Varnish does, unless explicitly configured otherwise (with precision
  caveats even then). The one clean way to guarantee cache-hit-inclusive metering, on Sefaria's
  current stack, is to meter **upstream of Varnish** — i.e. at nginx (already logging there) or
  at Envoy Gateway (in front of nginx). This is true whether Sefaria stays on Varnish or ever
  adopted Cloudflare/Fastly caching instead. See §7.

### "Last used" / per-key dashboards in commercial practice

Stripe's dashboard exposes **per-key request logs** ("View request logs" from each key's
overflow menu) and a broader **Workbench** view with API/webhook usage, filterable by endpoint
and error type — i.e. a UI over a logged, queryable event stream, conceptually the same shape as
"BigQuery table filtered by key_id" that Sefaria could build.
([Stripe API keys docs](https://docs.stripe.com/keys), [Stripe Workbench](https://docs.stripe.com/development/dashboard))
This validates log-based (not inline-counter-based) architectures as sufficient for the
self-serve "when did I last call this, how many requests today" dashboard use case — that's
inherently a "look back at history" UI, not a real-time gate, so BigQuery's batch latency is a
non-issue there even though it would be a problem for live quota enforcement.

## 2. Anonymous + keyed coexistence

### Differential rate limits as the incentive to identify (canonical examples)

| Service | Anonymous | Identified | Notes |
|---|---|---|---|
| GitHub REST API | 60 req/hr (by IP) | 5,000 req/hr (per token); GitHub Apps on Enterprise Cloud orgs up to 15,000/hr | ~83x differential. Plus **secondary rate limits** independent of the primary quota: ≤100 concurrent requests, ≤900 points/min per REST endpoint, ≤90s CPU-time per 60s wall time — triggered by pattern, not just volume, and can fire "for undisclosed reasons." ([GitHub rate limit docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)) |
| Wikimedia APIs | 100 req/sec per IP | 500 req/sec per authenticated user | Rolled out in phases (low limits on anonymous/browser traffic first, then higher limits on identified traffic weeks later); registered bots and Foundation-known clients are exempt entirely. Rationale stated by Wikimedia: identifiability lets them contact an operator when something breaks, instead of collectively punishing everyone on that IP. ([Wikimedia rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits)) |
| Crossref REST API | "public pool" | "polite pool" via `mailto=` param or `mailto:` in User-Agent | Not a hard numeric differential — the polite pool gets priority/より-generous treatment and is the channel Crossref uses to contact operators about problem usage; both pools' actual limits are surfaced via `x-rate-limit-limit` / `x-rate-limit-interval` response headers, and both can return 429. Revised again Dec 2025. ([Crossref access & auth](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/), [Crossref rate-limit change announcement](https://www.crossref.org/blog/announcing-changes-to-rest-api-rate-limits/)) |
| Docker Hub | 100 pulls / 6hr per IP | 200 pulls / 6hr per account (unlimited on paid tiers) | Smaller (2x) differential, but the qualitative shift matters more than the ratio: identified pulls are metered **per account**, not per IP, which fixes the "whole office/NAT shares one IP's quota" problem — directly analogous to Sefaria's hobbyist/shared-IP long tail. ([Docker Hub usage docs](https://docs.docker.com/docker-hub/usage/pulls/)) |

Pattern across all four: identification is incentivized by (a) a materially higher quota, and/or
(b) a qualitative fix to a IP-sharing/attribution problem, and/or (c) becoming contactable before
being cut off. Sefaria's situation (mostly hobbyist/nonprofit, some large scrapers) maps well
onto Wikimedia's rationale in particular: the goal isn't punitive throttling, it's "give us a way
to reach you."

### Soft-launch mechanics: warn-only, deprecation headers, brownouts

- **Warn-only / dry-run rollout**: introduce the limit and its headers on all responses without
  ever returning 429, then flip enforcement on after a communicated date. General best practice
  writeups describe this as a **phased rollout** — small cohort first, monitor, expand — combined
  with **"progressive friction"**: warn at ~80% of quota (portal + email), add latency at ~95%,
  soft-bill or degrade at 100%, hard-cut only far above that. The point is graduated signal before
  graduated punishment.
  ([Zuplo: progressive friction for monetized APIs](https://zuplo.com/blog/progressive-friction-for-monetized-apis))
- **Deprecation/Sunset headers (RFC 8594 + draft `Deprecation` header)**: `Deprecation:` announces
  something is going away (optionally with the date it became deprecated); `Sunset:` gives the
  hard date after which it 410s. Together they let clients/tooling detect an oncoming change
  programmatically instead of relying on a mailing list or blog post.
  ([RFC 8594 Sunset header explainer](https://anethoth.com/api-deprecation-sunset-headers/))
- **Brownouts (GitHub's technique)**: short, scheduled windows where the *old* path is
  deliberately broken (e.g., auth temporarily rejected) before the real sunset — the goal is to
  make unmigrated integrations fail loudly and get flagged by the *caller's* monitoring while
  there's still time to fix it, rather than everyone finding out on cutover day. GitHub ran a
  Nov 3–7 2025 brownout ahead of a Nov 10 2025 full sunset as a recent concrete example.
  ([GitHub API versioning + brownout precedent](https://docs.github.com/en/rest/about-the-rest-api/api-versions))
- Applied to Sefaria: this suggests a three-phase rollout for the eventual enforcement of
  anonymous limits — (1) ship keys + identification, meter everything, enforce nothing; (2) add
  `RateLimit`/`X-RateLimit-*` headers to all responses (including anonymous) so callers can see
  where they'd land, still enforce nothing, communicate the future date; (3) enable brief brownout
  windows close to the deadline, then enforce. This directly serves the brief's "extended
  communication/grace period" requirement.

## 3. Algorithms (brief)

- **Fixed window** (`INCR` + `EXPIRE` per period key): simplest, cheapest, but allows up to 2x
  burst at window boundaries (a client can spend its whole quota in the last second of one
  window and the whole quota again in the first second of the next).
- **Sliding window (log)**: sorted set of request timestamps per key; each request does
  `ZREMRANGEBYSCORE` (evict old) + `ZCARD` (count) + `ZADD` (record), wrapped in a Lua script for
  atomicity. Most accurate, more memory per key (one entry per request in-window rather than one
  counter).
- **Sliding window (counter approximation)**: weights the previous fixed window's count by how
  much of it overlaps the current window — cheaper than the log approach, close enough for most
  purposes.
- **Token bucket**: bucket holds up to N tokens, refills at a constant rate, each request spends
  one (or more, for cost-weighted endpoints — see the Envoy "cost" feature in §4). Naturally
  supports bursts up to bucket size while enforcing a long-run average rate; this is the model
  both AWS API Gateway and Envoy use internally.
  ([Redis: 5 rate limiters walkthrough](https://redis.io/tutorials/howtos/ratelimiting/),
  [AWS API Gateway throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html))
- **Redis implementation note**: all of the above need the check-and-increment to be atomic
  under concurrency; the standard approach is a Lua script (`EVAL`) so the whole
  read-modify-write happens as one Redis operation, avoiding race conditions from separate
  round-trips. `django_redis` exposes a raw client for this.
- **Per-key vs per-IP fallback for anonymous**: mirrors DRF's own built-in split —
  `UserRateThrottle` keys on the authenticated identity and **falls back to request IP for
  unauthenticated requests**; `AnonRateThrottle` is IP-only by design. This is the natural
  default for Sefaria too: keyed requests bucket by `key_id`; anonymous requests bucket by
  client IP (with the caveat that IP-based buckets are coarse for NAT'd/shared-IP consumers,
  exactly Docker Hub's stated reason for preferring account-based buckets once identified).
  ([DRF throttling docs](https://www.django-rest-framework.org/api-guide/throttling/))

## 4. Enforcement location: Django vs nginx vs Envoy Gateway

This is where the Varnish cache-key constraint bites hardest, because **anything downstream of
Varnish (i.e., Django) cannot enforce against cache-hit traffic at all** — those requests never
reach Django. Enforcement, unlike metering, is in the request path, so "we'll reconcile in
BigQuery later" isn't an option; the decision has to be made before or at the cache.

### Django middleware / DRF throttling

- Easiest to build (DRF ships `AnonRateThrottle`/`UserRateThrottle`/`ScopedRateThrottle` out of
  the box, backed by Django's cache framework — Redis-capable via `django_redis`), easiest to
  make key-scope-aware (full access to the resolved key object, tier, endpoint scope).
  ([DRF throttling](https://www.django-rest-framework.org/api-guide/throttling/))
- Structurally blind to the ~15 cached GET patterns per the brief's core constraint — Varnish
  serves those without ever calling Django. Only viable as "enforcement of last resort" for
  non-cached / write endpoints, or if those 15 patterns are explicitly carved out and accepted
  as unmetered/unenforced (which the brief already floats as one acceptable option).
- Also inherently per-pod-accurate only if the backing cache is shared (Redis) — `LocMemCache`
  would silently fragment limits per gunicorn worker/pod.

### nginx `limit_req`

- Native module (`ngx_http_limit_req_module`), zero new infra, and — critically for Sefaria —
  **sits upstream of Varnish**, so it sees 100% of traffic including what would become cache
  hits. This makes nginx the cheapest fix to the "enforcement must precede the cache" problem.
  ([nginx limit_req_zone docs](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html))
- Its accuracy caveat is orthogonal to the cache problem: `limit_req_zone`'s shared-memory zone
  is **local to a single nginx instance/pod**. With N nginx replicas, effective global throughput
  can be up to N× the configured per-pod limit, since each pod tracks the same client
  independently. nginx's own fix (`sync` parameter for cross-worker/cross-instance zone
  synchronization) is an **nginx Plus (commercial) feature**, not available on stock nginx 1.23.
  ([nginx rate limiting overview](https://blog.nginx.org/blog/rate-limiting-nginx))
- Also: stock nginx has no built-in way to look up a "who is this key, what's their tier" mapping
  beyond static config/maps — fine for a flat anonymous-IP limit, awkward for per-key
  tiered limits without embedding Lua (which the brief notes stock nginx 1.23 doesn't have —
  Envoy Gateway is the one that supports inline Lua in this stack).
- **Net**: good enough for a blunt, IP-based anonymous-traffic backstop (approximate global limit
  is fine when the goal is "stop egregious abuse," not "enforce an exact contractual quota").
  Not a good fit for precise per-key quota enforcement across multiple nginx pods.

### Envoy Gateway (global rate limiting + API key auth)

Envoy Gateway sits in front of nginx in Sefaria's path, and per the brief already supports
BackendTrafficPolicy and inline Lua — making it the most architecturally "correct" enforcement
point (furthest upstream, before Varnish *and* before nginx), at the cost of being the newest,
least-integrated piece.

- **Global rate limiting via `BackendTrafficPolicy`**: enforces a **shared limit across all Envoy
  replicas** (not per-pod like nginx), backed by an external Rate Limit Service that Envoy
  Gateway deploys and manages, requiring **Redis as the datastore** — Sefaria already has Redis
  available, which lowers the marginal infra cost of this option materially versus a greenfield
  deployment. Keying is flexible: HTTP headers (e.g., an extracted API-key-derived header, see
  below), client IP (exact or "distinct" — i.e., one bucket per unique value), path, method, or
  JWT claims projected into headers. Merging (`mergeType`) allows a Gateway-wide baseline policy
  plus route-level overrides — useful for "anonymous default limit" + "per-endpoint overrides for
  the highest-external-dependency endpoints" (api/calendars, api/sheets, api/words,
  api/search-wrapper per the brief's traffic inventory).
  ([Envoy Gateway global rate limit docs](https://gateway.envoyproxy.io/docs/tasks/traffic/global-rate-limit/),
  [Envoy Gateway rate-limit concepts](https://gateway.envoyproxy.io/docs/concepts/rate-limiting/))
  One known rough edge as of the 2025/2026 docs: a `BackendTrafficPolicy` attached to a `Gateway`
  (rather than a specific route) only applies to that Gateway's **first listener** — a bug to
  watch for, not a design limitation.
  ([envoyproxy/gateway issue #8707](https://github.com/envoyproxy/gateway/issues/8707))
- **Local rate limiting**: the per-instance (no Redis, no cross-replica coordination) counterpart
  — cheaper, approximate, same nginx-style "N replicas ≈ N× the limit" caveat. Good as a
  fast circuit-breaker in front of the global check, not as the source of truth.
- **Cost-weighted limiting (Envoy Gateway ≥1.3)**: lets a route consume more than "1" from the
  bucket per request (request-time cost) and/or deduct based on response-time metadata
  (token-count-style, aimed at LLM APIs, but generalizable). For Sefaria this maps onto "cheap"
  vs "expensive" endpoints having different effective weight against the same quota, rather than
  needing a totally separate limit per endpoint.
  ([Envoy Gateway 1.3.0 cost feature writeup](https://dev.to/reoring/envoy-gateway-130-overview-of-the-new-rate-limiting-with-cost-feature-252j))
- **`SecurityPolicy` API Key Auth**: extracts a key from header/query param/cookie and checks it
  against values in a Kubernetes `Secret`, matching it to a client ID that can then be projected
  into a header and used as the rate-limit key (composable with `BackendTrafficPolicy` via
  `clientSelectors`, including a `Distinct` match type that gives each unique client ID its own
  bucket automatically).
  ([Envoy Gateway API key auth docs](https://gateway.envoyproxy.io/docs/tasks/security/apikey-auth/),
  [Envoy Gateway SecurityPolicy concepts](https://gateway.envoyproxy.io/docs/concepts/gateway_api_extensions/security-policy/))
  **Important limitation for Sefaria's self-serve-issuance goal**: keys live in a static
  Kubernetes Secret, one value per client ID — there's no dynamic issuance, rotation, expiry, or
  scope metadata built in. That's fine for a small, ops-managed set of first-party/partner keys,
  but it does not by itself replace a self-serve developer portal backed by a real keystore
  (Django/Postgres or Mongo, per the brief's existing `db.apikeys` precedent) — Envoy would need
  to be handed a K8s-Secret-shaped *projection* of that keystore (synced via a controller/CI job),
  not be the system of record.

### Comparison summary

| Layer | Sees cache hits? | Cross-pod/replica accurate? | Key-aware out of the box? | New infra? |
|---|---|---|---|---|
| Django/DRF | No (blind to Varnish HITs) | Only if cache backend is shared (Redis) | Yes, fully | No |
| nginx `limit_req` | Yes (upstream of Varnish) | No on stock nginx (per-pod zones) | No (needs Lua/map hacks) | No |
| Envoy Gateway global RLS | Yes (furthest upstream) | Yes (Redis-backed, shared across replicas) | Yes (`SecurityPolicy` + `clientSelectors`) | Redis already available; RLS component is new but Gateway-managed |

## 5. Response conventions

- **429 Too Many Requests + `Retry-After`**: the baseline, RFC-defined mechanism (`Retry-After`
  originally an HTTP/1.1 header, reused for 429 by RFC 6585) — a delay in seconds or an HTTP-date
  telling the client when to retry. Virtually universal across the platforms surveyed here
  (GitHub, Crossref, AWS API Gateway, Envoy).
- **De facto `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers**: not
  from any ratified spec — adopted independently by GitHub, Twitter/X, Docker Hub, Shopify, and
  most others, which is exactly why casing and `Reset` semantics vary between implementations
  (Unix-epoch-seconds is most common; some send seconds-until-reset; a few use millisecond
  epochs). Because there's no single authority, any Sefaria implementation should document its
  own semantics explicitly rather than assume clients will infer them correctly.
  ([http.dev X-RateLimit-Remaining reference](https://http.dev/x-ratelimit-remaining))
- **IETF `RateLimit`/`RateLimit-Policy` draft — status in 2026**: `draft-ietf-httpapi-ratelimit-headers`
  is at **-11** as of writing (published 2026-05-23), Standards Track intended status, expires
  2026-11-24 — i.e. still an active, un-finalized IETF draft, not yet an RFC. It consolidates what
  earlier revisions split into three headers (`RateLimit-Limit`/`-Remaining`/`-Reset`) into two:
  `RateLimit` (current quota state) and `RateLimit-Policy` (the policy itself, for clients to
  introspect ahead of hitting it). Intent is to eventually supersede the ad hoc `X-RateLimit-*`
  convention, but adoption among major APIs is not yet widespread as of mid-2026.
  ([draft-ietf-httpapi-ratelimit-headers-11](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers),
  [WG repo](https://github.com/ietf-wg-httpapi/ratelimit-headers))
- **Practical recommendation**: ship both. Emit `RateLimit`/`RateLimit-Policy` because it's the
  direction of travel and low-cost to add, *and* emit `X-RateLimit-Limit/-Remaining/-Reset`
  because that's what most existing client tooling / developers actually check today (GitHub's
  own API — the single most copied convention among the surveyed APIs — still uses the `X-`
  prefixed form). Always pair a 429 with `Retry-After`.
- **Secondary/abuse signaling**: GitHub's secondary rate limit responses (403 or 429, "for
  undisclosed reasons," no queryable status) are a useful negative example — Sefaria should
  prefer to keep its own limits **inspectable** (headers present on every response, not just on
  429s) rather than following GitHub's opacity here, since the brief's stated audience skews
  hobbyist/nonprofit developers who will not have GitHub's institutional tolerance for
  undocumented throttling.

## 6. Abusive anonymous traffic during the transition

Directly relevant to the brief's largest external consumer: an unidentified Supabase/Deno-style
backend, ~823k req/day, 34.5% error rate, ~19k rotating source IPs, uncontactable.

- **Per-IP limiting is close to useless against this specific actor** — 19k rotating IPs means
  any per-IP bucket (nginx `limit_req`, DRF `AnonRateThrottle`) gets a fresh quota on every
  rotation. This is the textbook case the ASN-based mitigation literature describes: individual
  IPs are cheap to rotate, but the **hosting infrastructure they come from is not** — a scraper
  running on Supabase Edge Functions / Deno Deploy is, by construction, going to originate from a
  small, identifiable set of cloud-provider ASNs even while burning through thousands of IPs
  within them. Rate-limiting or hard-capping **by ASN** (Envoy Gateway can key on
  arbitrary extracted attributes projected to headers; Cloudflare/AWS WAF support ASN rules
  natively) collapses "19k IPs" back down to a handful of buckets that actually reflect the
  traffic's real origin.
  ([ASN as a bot-detection signal](https://ip2geoapi.com/docs/how-to-detect-bot-traffic-using-asn-patterns),
  [AWS WAF rate-limit-by-ASN example](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rate-based-example-limit-asn.html))
  Getting ASN into the request path requires a GeoIP/ASN lookup (MaxMind-style DB) somewhere in
  the chain — feasible at Envoy (furthest upstream, and where a Lua/WASM filter could do the
  lookup) or as an nginx module; not something BigQuery-log-based analysis alone can act on
  in real time, though it's exactly the kind of thing worth confirming first via a BigQuery query
  against existing logs (join client IP → ASN offline, see if 19k IPs really do collapse to a
  small ASN set) before building any live enforcement.
- **TLS/JA3-JA4 fingerprinting**: identifies a client by the shape of its TLS handshake
  (cipher suites, extension order) independent of IP, UA, or any cooperative header — "a default
  Python `requests` call produces a JA3 hash that's in every bot-detection database." This is the
  right tool specifically for the "uncontactable, spoofable UA, rotating IP" case, because it
  doesn't depend on the caller's cooperation at all. The catch: it requires TLS termination
  visibility (Envoy Gateway terminates TLS in this stack and could compute/expose JA3/JA4 as a
  header; nginx and Varnish, downstream of TLS termination, cannot). This is a heavier lift than
  ASN-based limiting and probably only worth it if ASN-based limiting proves insufficient (e.g.
  the actor moves to residential-proxy infrastructure with diverse ASNs).
  ([JA3/JA4 fingerprinting overview](https://proxyhat.com/blog/tls-fingerprinting-explained),
  [JA4 for AI-scraper detection](https://webdecoy.com/blog/ja4-fingerprinting-ai-scrapers-practical-guide/))
- **Just let differential limits squeeze them**: the lowest-effort option, consistent with
  "identification-first, quotas later." If anonymous traffic gets a materially lower limit than
  keyed traffic (GitHub/Wikimedia pattern) and that limit is enforced upstream of Varnish (§4),
  this actor either (a) gets throttled hard simply by being anonymous, forcing a natural
  reduction, or (b) has enough operational competence to notice and get a key — in which case
  Sefaria has achieved the actual goal (identification) without building bespoke anti-abuse
  tooling. Given the brief frames this whole effort as "identification-first," this is the
  option most consistent with project scope; ASN-blocking is worth keeping in reserve as an
  escalation if differential limits alone don't move the 34.5%-error, 823k/day actor, since a
  34.5% error rate suggests this traffic may not be economically rational to accommodate at any
  price and a harder block could be justified on cost/reliability grounds alone, independent of
  the identification project.
- **Sequencing recommendation**: (1) confirm the ASN concentration hypothesis with a one-off
  BigQuery join against existing logs — cheap, no infra change, directly answers whether ASN
  limiting would even work here; (2) ship differential anonymous-vs-keyed limits as the general
  mechanism; (3) hold ASN-based hard limits and TLS fingerprinting in reserve as targeted
  escalations against specifically this actor (or actors like it) if step 2 doesn't move it,
  rather than building either as day-one general infrastructure.

## 7. Concrete metering architectures for Sefaria's stack

All three assume keys are issued/validated somewhere (out of scope here — see `04` and `05`) and
focus purely on *how usage gets counted and how limits get enforced* given the Envoy → nginx →
Varnish → Django path.

### A. BigQuery-log-first (extend what exists)

**Shape**: nginx `log_format` gains a key-identifier field (raw header echo, or better, an
`X-Sefaria-Key-Id` header that Django/Envoy injects after key resolution, keeping raw keys out of
logs). Existing nginx→BigQuery pipeline is untouched otherwise. Per-key dashboards, "last used,"
req/day are BigQuery views/scheduled queries over the existing daily tables. Enforcement (if any)
stays where it is today: none, or a coarse nginx `limit_req` IP backstop for anonymous abuse.

- **Pros**: near-zero new infrastructure; inherently includes Varnish cache hits (nginx logs
  pre-cache); reuses a pipeline the team already operates and trusts; matches "identification
  first, quotas later" almost exactly — this is a metering-only architecture with no enforcement
  coupling.
- **Cons**: batch latency (hours, given daily tables) means it cannot back live quota enforcement
  or real-time "you're about to hit your limit" UX; if enforcement is ever wanted, it has to be
  bolted on elsewhere (nginx/Envoy), so this architecture alone doesn't answer §4's enforcement
  question — it only answers §1's metering question.
- **Best fit**: exactly the brief's stated near-term priority — identification and visibility,
  no enforcement yet.

### B. Redis inline counters (Django/DRF-anchored)

**Shape**: DRF throttle classes (`UserRateThrottle` keyed on resolved API key, `AnonRateThrottle`
falling back to IP) backed by `django_redis`, using a Lua-scripted token bucket or sliding window
for atomicity. Optionally mirror counts into BigQuery asynchronously (Celery task) for
dashboarding, so this can *also* serve §1 if desired.

- **Pros**: real-time enforcement and real-time "remaining quota" headers; minimal new infra
  (Redis already available); most flexible for per-key/per-tier logic since it runs inside the
  app with full access to the key's metadata.
- **Cons**: structurally blind to the ~15 cached GET patterns (the brief's core Varnish
  constraint) — undercounts and under-enforces exactly the highest-traffic, presumably
  highest-value-to-meter endpoints unless those patterns are carved out of the Varnish allowlist
  (`pass` in VCL) for keyed requests, which reintroduces load on Django/backend that Varnish
  exists to avoid. Also only cross-pod-accurate if all Django pods share the same Redis instance
  (true here) — fine, unlike nginx's per-pod zones.
- **Best fit**: enforcement on write endpoints and non-cached GETs; a companion to, not a
  replacement for, an upstream (nginx/Envoy) mechanism if cached-GET enforcement matters.

### C. Envoy Gateway global rate limiting + API key auth (edge-anchored)

**Shape**: `SecurityPolicy` extracts and validates the key (or a lighter-weight signal like
"has vs. lacks a key header" if full validation stays server-side) at the Gateway, projects a
client-ID header; `BackendTrafficPolicy` applies global (Redis-backed) rate limits keyed on that
header via `clientSelectors`, with route-level overrides for the highest-external-dependency
endpoints (api/calendars, api/sheets, api/words, api/search-wrapper) and cost-weighting for
"expensive" vs "cheap" endpoints. Optionally ASN-based buckets for the anonymous tier to blunt
the Supabase/Deno actor (§6).

- **Pros**: the only option that enforces *before* Varnish, so it's the sole architecture on this
  list that can genuinely cap cache-hit traffic too; cross-replica accurate (Redis-backed, unlike
  nginx `limit_req`); composable per-route policy fits the brief's endpoint-risk tiering directly;
  Envoy Gateway is already in the stack (not new infra at the platform level), though the
  Rate Limit Service component and its Redis wiring are new operational surface.
  Headers (`RateLimit`/`X-RateLimit-*`) can be added directly at this layer.
- **Cons**: newest, least battle-tested piece for Sefaria specifically; `SecurityPolicy` API-key
  auth's static-Secret model doesn't natively support self-serve dynamic issuance, so it would
  need a sync mechanism from the real keystore (adds a moving part); known rough edges in current
  Envoy Gateway releases (e.g. multi-listener Gateway attachment bug); highest complexity of the
  three, cutting against the Flanksource direction of *reducing* infra dependencies unless the
  team judges the payoff (true cache-inclusive, cluster-accurate enforcement) worth it.
- **Best fit**: the eventual end state *if and when* Sefaria decides to actually enforce quotas
  (not just meter), especially for the cached, high-external-dependency endpoints where
  Options A and B both fall short for different reasons (A can't enforce in real time; B can't
  see cache hits).

### How they compose

These aren't mutually exclusive. A defensible path: **ship A now** (it's nearly free and directly
serves "identification-first, quotas later"); **add B** for enforcement on non-cached/write
endpoints once self-serve keys exist and any tier/quota logic is wanted, since it's cheap and
DRF-native; **defer C** until there's an actual enforcement need on the cached, high-blast-radius
endpoints (api/calendars etc.) that B structurally cannot reach — at which point the question
becomes whether that enforcement need justifies taking on Envoy Gateway's Rate Limit Service as
new operational surface, or whether accepting undercounting on those ~15 patterns (explicitly
floated as tolerable in the brief) is good enough indefinitely.

## 8. Recommendations distilled for Sefaria

1. **Metering now, enforcement later, matches Architecture A almost exactly.** Add a key-identity
   field to the nginx log format (post-resolution key ID, not the raw key) and build per-key
   BigQuery views for "last used"/req-per-day. This requires no new infrastructure and — unlike
   any Django-anchored approach — automatically includes the Varnish cache-hit traffic the brief
   flags as otherwise invisible, because nginx logs pre-cache.
2. **When enforcement is wanted, split it by traffic shape rather than picking one mechanism for
   everything.** Redis/DRF throttling (Architecture B) for write endpoints and non-cached GETs;
   accept that it structurally can't reach the ~15 cached patterns without a VCL change or an
   upstream mechanism. Only reach for Envoy Gateway global rate limiting (Architecture C) if
   cache-inclusive, cluster-accurate enforcement on those specific high-value endpoints
   (api/calendars, api/sheets, api/words, api/search-wrapper) becomes a real requirement — it's
   the correct tool for that specific job but adds real operational surface (Rate Limit Service +
   Redis wiring, static-Secret key sync), which cuts against the current infra-reduction
   direction unless the payoff is needed.
3. **Differential anonymous-vs-keyed limits, not draconian anonymous cutoffs**, both as the
   incentive to get identified (GitHub/Wikimedia/Docker Hub pattern) and as the default lever
   against the Supabase/Deno actor — try this before building bespoke anti-abuse tooling, since
   "identification-first" is the stated goal and a sufficiently generous keyed tier plus a
   sufficiently modest anonymous tier does double duty as both incentive and soft cap.
4. **Roll out in three phases with headers-first communication**: meter and expose
   `RateLimit`/`X-RateLimit-*` headers on every response (including anonymous, including before
   any enforcement exists) → communicate a hard date → brief brownout windows close to that date
   → enforce. This mirrors GitHub's playbook and directly serves the brief's "extended
   communication/grace period" requirement without inventing a novel rollout mechanism.
5. **Treat the Supabase/Deno actor as a targeted investigation, not a general design input.**
   Before building ASN-based limiting or TLS fingerprinting as platform features, run a cheap
   one-off BigQuery join of that actor's IPs against ASN to confirm they really do collapse to a
   small set of cloud ASNs; if they don't, ASN limiting won't help and the actor may need a
   different treatment (or may simply get squeezed out by differential limits per point 3 without
   any bespoke work at all).
6. **Emit both header conventions, always pair 429 with `Retry-After`.** The IETF
   `RateLimit`/`RateLimit-Policy` draft (currently -11, still Standards-Track-pending as of
   mid-2026) is the direction of travel and cheap to add; `X-RateLimit-Limit/-Remaining/-Reset`
   is what most existing developer tooling actually checks today. Unlike GitHub's opaque
   secondary-limit behavior, keep Sefaria's limits fully inspectable — the target developer
   population (hobbyists, nonprofits) has less tolerance for undocumented throttling than
   GitHub's institutional user base.
