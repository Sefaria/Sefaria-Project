# The Anonymous Tier: What "Limiting Non-Keyed Usage" Can Look Like

> Companion to [10-decision-points.md](./10-decision-points.md), written for the product
> conversation. Premise (engineering position going in): **developers will only adopt keys if
> unkeyed access is visibly limited** — incentive-only rollouts convert slowly (Crossref's own
> data, 08 §4). This doc is the menu of what "limited" can mean, restricted to options that are
> feasible on our stack, so product chooses among real choices. Levels are cumulative and can be
> adopted on a timeline (e.g. Level 1 at launch, Level 3 within a year).

## 1. The 60-second constraint picture (read first)

Every API request flows through:

```
client
  → Envoy Gateway        (cluster ingress; Flanksource is completing the migration to it now)
  → Sefaria nginx pod    (logs every request to BigQuery — the metering source; unaffected
                          by the ingress migration)
  → Varnish              (caches ~15 /api/* GET families — the hottest read traffic —
                          keyed on URL ONLY, TTL 1 day, serves stale up to 10 days)
  → Django               (sees only cache misses, plus all writes and uncached endpoints)
```

Varnish is the constraint. On a cached endpoint, whoever requests a URL first has their response
stored and **replayed byte-identical to every later caller for up to a day** — Django never runs
again. Two consequences:

1. **Django cannot treat keyed and unkeyed callers differently on cached endpoints.** A warning
   (or limit) applied in Django would be cached into the shared response and shown to the wrong
   callers — or not at all.
2. **Anything per-caller must happen at a layer that runs on every request**: Envoy, the nginx
   pod, or Varnish's own delivery step (`vcl_deliver`, which can add response headers per-request
   without touching the stored object).

One more distinction that sorts every option below: **stateless vs stateful**. A *stateless*
action ("this request has no key → add a warning header / apply rule X") is a few config lines at
any edge layer. A *stateful* action ("this caller has made 4,900 requests this hour") requires a
shared counter — a rate-limit service with Redis, which Envoy Gateway supports natively
(APIKeyAuth + rate limiting, built-in since ~v1.3) but which is a real, if modest, infra addition.
Nothing else on the market is needed; the gateway we are migrating to anyway does this
([07-gateway-platform-options.md](./07-gateway-platform-options.md)).

## 2. The escalation ladder

Each level says what an **unkeyed caller experiences**, where it's implemented, and what it costs.
Keyed callers are never worse off than unkeyed at any level — the differential IS the incentive.

### Level 0 — Documented policy only
- **Caller experience:** nothing changes in responses; the developer docs state that keys are
  expected and unkeyed access is a courtesy tier.
- **Implementation:** docs + blog post. Zero engineering.
- **Honest assessment:** this is the pure-incentive play; the surveyed precedents (Crossref) show
  slow conversion. Included for completeness — it is the floor, not a strategy.

### Level 1 — Warning on every unkeyed response  *(recommended at launch)*
- **Caller experience:** every response to a request without a key carries a header, e.g.
  `X-Sefaria-Notice: Unkeyed API access will be rate-limited in the future. Register at
  developers.sefaria.org` (plus a `Link:` header to the policy page). Nothing is slowed or blocked.
- **Implementation:** stateless, so it works on cached traffic — stamped at delivery time by
  Varnish `vcl_deliver` or the nginx pod (a `map` + `add_header`; no new components), later moved
  into Envoy. A few config lines.
- **Notes:** headers are only seen by developers who look — the warning's real audience is the
  integrator reading their HTTP client's output, paired with the blog/docs announcement. This is
  the cheapest possible day-one signal and creates the paper trail ("we warned for N months")
  that every graceful rollout case study relies on (08 §2).

### Level 2 — Advertised limits, not yet enforced
- **Caller experience:** unkeyed responses additionally carry the *policy*, e.g.
  `RateLimit-Policy: 100;w=3600` ("100/hour is coming"), and docs state the number. Still nothing
  blocked.
- **Implementation:** the static policy header is stateless (same stamping trick as Level 1).
  Live counters ("87 of your 100 left") are stateful — defer them to Level 3's machinery rather
  than building anything bespoke.
- **Notes:** publishing a concrete number is a commitment; product should pick it from the
  measured traffic data (the consumer inventory gives per-class percentiles) so that the eventual
  enforcement inconveniences almost nobody who isn't a scraper.

### Level 3 — Real throttling of the unkeyed tier  *(the target end-state)*
- **Caller experience:** unkeyed callers exceeding the limit (per client IP) get `429 Too Many
  Requests` + `Retry-After`; under the limit, service is normal. Keyed callers get a much higher
  per-key limit. Unkeyed access **never goes away** — it gets humbler (Wikimedia model, 02 §2).
- **Implementation:** Envoy Gateway `SecurityPolicy` (key validation) + `BackendTrafficPolicy`
  (per-key and per-IP limits) + its rate-limit service + Redis, plus a small Django→Envoy key
  sync. This is the one real infrastructure build in the whole program; it is also precisely the
  machinery the abuse/miner problem needs (see §4). Enforcement can run in shadow/warn mode first
  (evaluated and logged, not enforced) to validate the limits against reality.
- **Notes:** rolls out per endpoint in blast-radius order (start `api/strapi`,
  `api/background-data`, `api/profile`; save `api/calendars`, `api/sheets` for last — 08 §9), and
  only after first-party traffic carries keys, or we throttle ourselves first.

### Level 4 — Brownouts (optional pressure tool)
- **Caller experience:** pre-announced windows (e.g. 10 minutes weekly) where unkeyed requests to
  a specific endpoint return 429 regardless of volume — the standard "wake up integrators who
  ignore headers" tool from the Google Maps / Wikimedia / GitHub deprecation playbooks (08 §6).
- **Implementation:** trivial once Level 3 exists (a scheduled Envoy policy change).
- **Notes:** a communications instrument, not a policy; only worth it for endpoints where warning
  adoption stalls.

### Level 5 — Hard requirement (401 without a key) — **off the menu**
Listed so the boundary is explicit: the research recommends never doing this platform-wide.
Google Maps' 2018 hard cutover is the cautionary tale (broke a large fraction of the web's embedded
maps, burned a decade of goodwill); Wikimedia/Crossref never did it and kept their ecosystems. A
throttled-but-working anonymous tier costs us little (the traffic data shows well-behaved anonymous
use is cheap) and preserves the mission posture. Per-endpoint exceptions (e.g. an expensive new
endpoint launching keyed-only) remain possible as individual product decisions.

## 3. What keyed callers get (the other half of every level)

The stick only works with a visible carrot. From Level 1 onward, registered callers should get:
higher limits (the GitHub 60-vs-5,000 pattern), their traffic visible to us per project (per-key
BigQuery views from the nginx logs — the analytics deliverable), and later a self-serve usage
dashboard. Publishable vs secret key classes per
[10-decision-points.md](./10-decision-points.md) Decision 2.

## 4. Convergence with the abuse/scraper track

A parallel investigation (Lev) approaches keys from the unwanted-traffic side: miners, mass
scrapers, the unidentified 823k req/day Supabase/Deno consumer. These converge on the same
infrastructure, not a second system:

- **Identification** (keys, this program) separates the population that will register from the
  population that won't.
- **The anonymous-tier limit (Level 3) IS the abuse control** for whoever remains: per-IP/per-ASN
  throttling at Envoy, uniform policy, no per-incident chasing.
- WAF-style concerns (bot fingerprinting, block rules) also live at the Envoy layer; nothing about
  the key design forecloses them.
- The Slack thread (2026-07-14, Lev/Brendan Galloway) confirms: ingress is moving to Envoy
  cluster-wide, Flanksource can implement key gating there, and — critically — the Sefaria nginx
  pod (our BigQuery metering source) is **not** being removed. Key gating should target Envoy,
  never the departing ingress nginx.

## 5. Registration friction options (the other product dial)

Identification quality trades against sign-up friction. Feasibility notes on the asks under
discussion:

- **Require a Sefaria account:** recommended in Decision 1; the identity layer already exists.
- **Require a confirmed email:** Sefaria signup currently has **no email verification at all**
  (`sefaria/forms.py` — accounts activate immediately). Two feasible shapes:
  1. *Verify at signup* — touches every new Sefaria user; a platform-wide product change; out of
     scope for this program.
  2. *Verify at key issuance* — first key request sends a confirmation email; the key activates on
     click. Small, self-contained, and directly serves the goal (a reachable owner per project).
     **Recommended.**
- **Required fields:** project name + one-line description + contact email + ToS checkbox. The
  description field is the analytics deliverable of the whole initiative; everything else is
  negotiable friction.

## 6. Recommended composition (engineering's proposal to product)

1. **Launch together:** self-serve keys (portal), first-party services keyed (web, Linker
   per-site, mobile, MCP, cron — non-negotiable prerequisite for any anonymous-tier pressure),
   Level 1 warning header, Level 2 advertised policy, per-key metering via the nginx `log_format`
   change → BigQuery views.
2. **Fast-follow:** Envoy rate-limit service in shadow mode; validate limits against measured
   traffic; flip Level 3 on per endpoint in blast-radius order.
3. **Standing policy:** anonymous stays functional at the humbler tier indefinitely; Level 4
   brownouts and any per-endpoint hard requirements are individual, announced product decisions.

Decisions product must make in this doc's scope: the warning wording/URL (Level 1), the advertised
number and window (Level 2), the enforcement timeline and first endpoints (Level 3), whether
email verification at key issuance is acceptable friction (§5), and sign-off that Level 5 is off
the menu.
