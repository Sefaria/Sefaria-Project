# Survey: Off-the-Shelf API Management Platforms

> Part of the sc-45692 API-key research (see [00-brief.md](./00-brief.md)). Surveys off-the-shelf
> **API management/gateway** options — self-hosted OSS gateways, our existing Envoy Gateway's own
> capabilities, SaaS/managed platforms, and developer-portal-in-a-box products — against Sefaria's
> actual stack (Cloudflare(?) → Envoy Gateway → nginx → Varnish → Django) and infra direction
> (Flanksource engagement is *reducing* dependencies; new platforms need strong justification).
> Written July 2026; URLs inline per section. Ends with a shortlist framed for product discussion.

## Executive summary

Sefaria already runs the one piece of infrastructure that solves most of this problem for free:
**Envoy Gateway**, sitting in front of nginx and Varnish, now ships `SecurityPolicy` API-key
authentication and `BackendTrafficPolicy` rate limiting with per-key ("Distinct" header) buckets —
enforced at the true front door, before Varnish's URL-only cache key can hide traffic from
metering. That's the biggest finding here: the brief's hardest constraint (Varnish undercounting)
is solved almost for free by capability our existing gateway already has, not by adopting a new
platform.

Every self-hosted OSS gateway surveyed (Kong, Tyk, APISIX, KrakenD) would need to become — or be
inserted in front of — the ingress to get the same edge-enforcement benefit, which means
re-plumbing the request path Envoy Gateway already occupies, plus operating a new control-plane
datastore (Postgres/Cassandra, MongoDB, etcd) none of which Sefaria runs today. Two of the four
have hard gates that rule them out outright for this specific job: **Kong's OSS free-self-host
path got materially worse in March 2025** (no more prebuilt OSS images, no free mode), and
**KrakenD Community Edition does not include API-key auth at all** — it's an Enterprise-only
feature. Tyk's gateway is genuinely free, but the self-serve developer portal — the actual thing
the brief needs — is Tyk's proprietary, paid Dashboard/Portal product, so "free" Tyk doesn't
actually solve the brief's core ask without a purchase.

SaaS options split into "coarse and maybe already free" (Cloudflare, if it's confirmed already
fronting Sefaria — but its per-key granular rate limiting is Enterprise-quote-gated) and "full
platform, real money" (Apigee: ~$4,400+/yr floor before any usage; GCP API Gateway: cheap but is
architecturally just a hosted Envoy, so adopting it duplicates what we already run and forces an
ingress rewrite). Zuplo stands out as the most complete single SaaS/self-hostable product
(key-auth, rate limiting, self-serve portal, Stripe monetization, real free tier) and deserves a
scoped trial if the in-house portal UI proves more effort than expected. Developer-portal-in-a-box
products (ReadMe, Stoplight, Zudoku, Backstage) all turn out to be documentation/UI shells that
still need a real key-issuance backend behind them — none directly solves identification.

**Shortlist:** (1) Envoy Gateway native enforcement + a thin Django-side key-issuance/portal page
as the primary recommendation; (2) the Django baseline
(`djangorestframework-api-key` + Redis throttle + existing BigQuery log pipeline) as the system of
record paired with (1), not a replacement for it; (3) Zuplo as a scoped-trial fallback if portal
build-effort balloons. Kong, KrakenD Community, Tyk-without-Dashboard, Apigee, Backstage, and GCP
API Gateway are not recommended for this problem, each for a specific, checkable reason documented
below.

## 1. Self-hosted OSS gateways (Kong, Tyk, APISIX, KrakenD)

### 1.1 Kong

Kong Gateway's core (routing, `key-auth` plugin, `rate-limiting` plugin) is Apache-2.0 and has long
been a reasonable free self-hosted option — but the business model changed materially with
**Kong Gateway 3.10 in March 2025**: Kong stopped publishing prebuilt OSS Docker images on Docker
Hub, and running Kong Gateway Enterprise *without* a license now behaves the same as an **expired**
license (degraded/limited functionality), eliminating the old "Enterprise binary, free mode"
escape hatch. To stay on a genuinely free, unlimited path, teams must either pin to the last
OSS-only image tag (3.9.1) — freezing security patches — or build their own images from source
going forward, taking on a self-managed build/patch pipeline Sefaria doesn't have today
([Tasrie migration writeup](https://tasrieit.com/blog/migrate-kong-oss-to-envoy-gateway-complete-guide);
[Kong license docs](https://developer.konghq.com/gateway/entities/license/)). Kong's own hosted
control plane, **Konnect**, has a free tier suitable only for small PoCs; **Konnect Plus** runs
~$105/service/month with 1M requests included and ~$200 per additional million (capped at 10M/mo);
full **Kong Enterprise** license pricing starts in the $30–50k/year range
([TrueFoundry pricing analysis](https://www.truefoundry.com/blog/kong-gateway-pricing-architecture-an-analysis-for-ai-teams-2026-edition);
[Kong pricing](https://konghq.com/pricing); [Konnect free tier](https://freetier.co/directory/products/kong-konnect)).
Kong also requires its own control-plane datastore (Postgres) — a new stateful service to operate.
Given the trajectory (an "open-core squeeze" pushing self-hosters toward Konnect/Enterprise), Kong
carries real rug-pull risk for a nonprofit betting on the free tier long-term.

### 1.2 Tyk

The Tyk **Gateway** itself is genuinely open source (MPL-2.0), actively maintained, and includes
key-based auth (JWT, OIDC, Basic, Bearer, custom keys) plus Redis-backed rate limiting/quotas at
per-key, per-policy, and per-endpoint granularity — no feature lockout in the gateway
([Tyk OSS docs](https://tyk.io/docs/tyk-oss-gateway); [Tyk open-source page](https://tyk.io/open-source-api-gateway/)).
The catch: **the Dashboard and Developer Portal are proprietary and always have been** — "there is
no open source dashboard." Everything can technically be driven via the gateway's own REST API or
config files without a license, but the actual self-serve developer-portal UX — the brief's core
ask — is exactly the piece that costs money (14-day free trial only;
[Tyk self-managed licensing](https://tyk.io/docs/4.2/tyk-on-premises/licensing/);
[community thread confirming no OSS dashboard](https://community.tyk.io/t/how-to-access-tyk-dashboard-in-tyk-oss-open-source-gateway/8313)).
Running Tyk also means adopting a new proxy layer (replacing/fronting Envoy Gateway) plus, if the
Dashboard is purchased, another datastore (MongoDB or Postgres) for it.

### 1.3 Apache APISIX

APISIX (Apache-2.0) has a genuine free `key-auth` plugin plus `limit-count`/`limit-req`/`limit-conn`
plugins with consumer and consumer-group scoping — full feature parity with paid options, no
Enterprise gate
([APISIX auth learning center](https://apisix.apache.org/learning-center/api-gateway-authentication/);
[limit-count docs](https://apisix.apache.org/docs/apisix/plugins/limit-count/)). The operational
cost is real, though: APISIX's traditional deployment model depends on **etcd** as its
control-plane datastore for distributed config sync, and running an HA etcd cluster is a
nontrivial new distributed system to operate (quorum, backups, TLS) that Sefaria doesn't run today;
community writeups explicitly call this "less user-friendly" with "high maintenance costs"
([etcd-without writeup](https://blog.frankel.ch/apisix-without-etcd/);
[deployment architecture docs](https://apisix.apache.org/docs/ingress-controller/concepts/deployment-architecture/)).
Newer standalone/declarative modes can avoid etcd, which helps — but APISIX is still, structurally,
a full proxy meant to *be* the gateway, not a plugin bolted onto Envoy Gateway; adopting it means
running a second full data-plane technology alongside (or instead of) the one already deployed.

### 1.4 KrakenD

This is a hard gate: **API Key Authentication in KrakenD only exists in the Enterprise Edition** —
the Community (open-source) edition covers core routing, rate limiting, transformation, and
aggregation, but key-auth, security policies, OpenAPI, gRPC, and SSO/SAML are all Enterprise-only
add-ons ([KrakenD API-key docs, explicitly under "Enterprise Edition"](https://www.krakend.io/docs/enterprise/authentication/api-keys/);
[feature comparison](https://www.krakend.io/features/)). Enterprise pricing is quote-only. For
Sefaria's specific ask — free, self-hosted key auth — KrakenD Community simply doesn't offer the
feature; it can only be evaluated as a paid product, putting it in the same cost bracket as Kong/Tyk
Enterprise.

### 1.5 Ops burden common to all four

None of these four compose *alongside* Envoy Gateway for this job — each is designed to *be* the
gateway, so adopting any of them means either replacing Envoy Gateway as the ingress or inserting a
second full proxy layer into the request path (with its own TLS termination, routing rules, and
failure domain). Three of the four also require a wholly new control-plane datastore Sefaria
doesn't run today (Kong: Postgres; Tyk Dashboard, if purchased: MongoDB/Postgres; APISIX: etcd).
That's precisely the "another DB/control plane" cost the brief and the Flanksource
infra-reduction direction both flag as needing strong justification — and in three of four cases
(Kong's licensing shift, Tyk's paid portal, KrakenD's paid key-auth) the justification doesn't
clearly clear the bar because the free tier doesn't actually deliver the full solution.

## 2. Envoy Gateway's own capabilities (we already run this)

This is the highest-leverage section: Sefaria already operates Envoy Gateway as the true front
door, ahead of nginx and Varnish, so any capability it has natively costs zero new platforms.

### 2.1 SecurityPolicy APIKeyAuth

Envoy Gateway's `SecurityPolicy` CRD supports API-key authentication out of the box, attachable to
a `Gateway`, `HTTPRoute`, or `GRPCRoute` via `targetRefs`
([Envoy Gateway API-key auth docs](https://gateway.envoyproxy.io/docs/tasks/security/apikey-auth/)).
Keys are stored as a Kubernetes `Opaque` Secret, one entry per client ID → key value:

```yaml
apiVersion: v1
kind: Secret
type: Opaque
metadata:
  name: apikey-secret
stringData:
  client1: supersecret
```

Extraction supports headers (e.g. `x-api-key`), query parameters, or cookies — covering both
server-side callers (header) and the Linker's cross-origin browser case (query param, since some
embedders can't set custom headers). One documented gotcha: if extracting from `Authorization`,
the stored value must **not** include a `Bearer` prefix — Envoy does a direct string comparison,
no scheme-stripping.

What it does *not* give you: no self-serve issuance API, no rotation tooling, no per-key metadata
(owner, tier, scope) — it's a flat lookup table maintained via `kubectl`/GitOps. To make this
self-serve, Sefaria would need a small sync job — Django stays system-of-record for key metadata
and pushes create/revoke events into the Kubernetes Secret via the Kubernetes API (e.g. the
`kubernetes` Python client) — a small, scoped build, not a new platform. Keys sit in the Secret as
plaintext (base64, RBAC-protected, not hashed) which is weaker than a proper hashed store; worth a
mitigation note but not a blocker at Sefaria's threat model.

### 2.2 BackendTrafficPolicy rate limiting

`BackendTrafficPolicy` supports both **local** rate limiting (per-Envoy-instance, no external
dependency, good as a lightweight DoS backstop) and **global** rate limiting (shared, consistent
limit across all Envoy instances, via Envoy's Rate Limit Service, which Envoy Gateway auto-deploys
and which needs Redis as its datastore —
[rate limiting concepts](https://gateway.envoyproxy.io/docs/concepts/rate-limiting/)). Sefaria
already runs Redis (django_redis) — a dedicated Redis instance/namespace for rate-limit counters
would be prudent to avoid contention with app caching, but this reuses an already-operated
technology rather than introducing a new one.

Critically, `clientSelectors` with `type: Distinct` on a header creates one rate-limit bucket **per
distinct value of that header automatically** — exactly per-API-key limiting, with `invert` usable
to exempt specific keys (e.g. first-party/admin) from a rule
([global rate limit task docs](https://gateway.envoyproxy.io/docs/tasks/traffic/global-rate-limit/)):

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: BackendTrafficPolicy
metadata:
  name: policy-httproute
spec:
  targetRefs:
  - group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: http-ratelimit
  rateLimit:
    global:
      rules:
      - clientSelectors:
        - headers:
          - type: Distinct
            name: x-api-key
        limit:
          requests: 100
          unit: Hour
```

Envoy Gateway v1.3.0 added a **cost specifier** to global rate-limit rules, letting different
requests weight differently against the same quota bucket
([v1.3.0 cost feature writeup](https://dev.to/reoring/envoy-gateway-130-overview-of-the-new-rate-limiting-with-cost-feature-252j)).
This maps directly onto the brief's endpoint-risk data: `api/calendars`, `api/sheets`,
`api/search-wrapper` (highest genuinely-external dependency) could be weighted to consume quota
faster than low-risk endpoints like `api/strapi` or `api/background-data`, without any Django-side
logic.

### 2.3 What key-issuance/validation/limits would take with zero new platforms

1. Deploy the Rate Limit Service Envoy Gateway auto-manages, pointed at a Redis instance (existing
   or a new namespace on existing Redis) — not a new "platform," a small in-cluster deployment.
2. Apply a `SecurityPolicy` targeting the `/api/*` `HTTPRoute`(s) extracting from `x-api-key`
   (header) and/or a query param for browser-unfriendly cases.
3. Apply a `BackendTrafficPolicy` with `Distinct`-header rate-limit rules, optionally cost-weighted
   by endpoint pattern using the brief's own risk data.
4. Build the one genuinely new piece of code: a thin sync job so Django (system of record for key
   metadata, owner, tier) pushes create/revoke operations into the Kubernetes Secret.

The structural win: because Envoy Gateway sits **before** nginx and Varnish, this closes the
brief's flagged critical constraint — Varnish's URL-only cache key hiding cache-hit traffic from
Django-level metering — automatically. Envoy sees every request regardless of what Varnish does
downstream, so identification and rate limiting happen before caching is even a factor. No
Django-level or app-level scheme can make that claim without either fragmenting Varnish's cache key
(a real cache-hit-ratio cost) or accepting undercounting on the ~15 cached GET patterns.

One open implementation question, not a research blocker: confirm the currently-deployed Envoy
Gateway version supports `APIKeyAuth` and the `Distinct` client selector + cost specifier (these
landed across Envoy Gateway's SecurityPolicy/BackendTrafficPolicy releases through v1.3.0); a
version bump may be a prerequisite.

## 3. SaaS / managed platforms

### 3.1 Cloudflare API Shield + rate limiting rules

If Cloudflare is confirmed to already front Sefaria's traffic (the brief marks this uncertain —
"Cloudflare(?)"), this is near-zero-marginal-infra territory for coarse protection. But the
granularity that matters for identification is gated: Free gives 1 rate-limit rule, Pro
(~$20–25/mo) ~10 rules, Business (~$200–250/mo) ~15 rules — all **IP-based fixed-window** counting
only. **Per-token, per-session, or per-body-field rate limiting requires "Advanced Rate Limiting,"
an Enterprise add-on with negotiated, unpublished pricing**
([Cloudflare rate limiting pricing analysis](https://blog.blazingcdn.com/en-us/understanding-cloudflares-rate-limiting-pricing);
[rate limiting rules docs](https://developers.cloudflare.com/waf/rate-limiting-rules/)). API
Shield's more advanced pieces — schema validation is a paid add-on, sequence analytics and
volumetric abuse detection are Enterprise-only
([API Shield get-started](https://developers.cloudflare.com/api-shield/get-started/)). Cloudflare
also gives you no developer portal or key-issuance UI — it would only ever cover the "limits" leg
of the problem, and the per-key granularity Sefaria actually wants sits in the same
Enterprise-quote bracket as Kong/Tyk/KrakenD Enterprise. Worth confirming Cloudflare's actual role
in the stack before spending more research here.

### 3.2 Google Apigee

Full API management platform — portal, monetization, analytics, key issuance, all included, and
it's a native GCP product (fits Sefaria's cloud). But the price floor is steep for a nonprofit:
PAYG environment fees start at **$365/month per environment/region before any API calls**, standard
proxy calls run $20/million; the subscription tier starts around **$2,500/month** (Standard) and
scales to $8,000–25,000/month (Enterprise); only a 60-day evaluation is free
([Apigee pricing](https://cloud.google.com/apigee/pricing);
[Apigee 2026 tier breakdown](https://apigatewaycost.com/apigee)). That's a **≥$4,400/year floor**
before any meaningful usage, for a platform whose portal/monetization/analytics sophistication is
overkill for what's currently ~15% genuinely-external API traffic on a nonprofit budget. Apigee
also introduces its own proxy-configuration language and operational model — a large new surface to
learn and run.

### 3.3 GCP API Gateway

The lighter GCP-native option: serverless, OpenAPI-spec-driven, **2M calls/month free, then
$3/million, no environment floor fee** — dramatically cheaper than Apigee
([GCP API Gateway pricing](https://apigatewaycost.com/google-cloud)). Notable finding: it's built
on **ESPv2, which itself wraps Envoy** — architecturally, "GCP API Gateway" is Google's own hosted
Envoy-based gateway product
([ESPv2 GKE deployment docs](https://docs.cloud.google.com/endpoints/docs/openapi/get-started-kubernetes-engine-espv2);
[ESPv2 GitHub](https://github.com/GoogleCloudPlatform/esp-v2)). That reinforces Section 2's point
rather than adding a new option: Sefaria already runs Envoy natively and gets equivalent
capability without going through Google's wrapper. Structurally, GCP API Gateway either becomes the
front door itself or runs as a per-pod ESPv2 sidecar — either way, adopting it means re-plumbing
the ingress path currently owned by Envoy Gateway, a nontrivial migration for a product with no
built-in developer portal or metering of its own. Not a clear win over using Envoy Gateway directly.

### 3.4 Zuplo

The most complete single product surveyed: edge-native (300+ PoPs), TypeScript/GitOps
config-as-code, with API key auth, JWT/OAuth2, rate limiting, an **auto-generated developer
portal**, and Stripe-powered monetization built in
([Zuplo pricing](https://zuplo.com/pricing); [Zuplo pricing comparison 2026](https://zuplo.com/learning-center/api-gateway-pricing-comparison-2026)).
Pricing is unusually nonprofit-friendly: a real free tier (100K requests/month, unlimited
environments/keys/portal), a flat $25/month Builder tier plus transparent per-100K-request
add-ons, and — notably — **a self-hosted deployment option** (AWS/Azure/on-prem/K8s) alongside the
managed edge, which matters for migration risk (see Section 7). It's the only SaaS/managed option
surveyed that plausibly replaces *both* the gateway and the developer-portal problem in one
product. The tradeoff is the obvious one: it's still a new vendor relationship for an org actively
shedding vendors, and running it managed-edge means Zuplo becomes a new front door alongside/instead
of Cloudflare+Envoy.

### 3.5 Unkey

Open source (AGPL), positioned as "the developer platform for modern APIs" — key issuance and
verification, rate limiting, RBAC, analytics, audit logs
([Unkey GitHub](https://github.com/unkeyed/unkey); [Unkey site](https://www.unkey.com/)). It's the
closest surveyed option to "just the identification/keys piece" without being a full gateway — you'd
call it from Envoy's `ext_authz` or from Django. But self-hosting maturity is a real concern:
third-party review notes self-hosting is "genuinely possible, but not the paved road" — thin
self-host docs, an architecture still in flux, and the team has **paused accepting external code
contributions** while it focuses on platform direction
([Unkey self-host review](https://www.buildmvpfast.com/blog/unkey-open-source-api-key-management-rate-limiting-2026)).
The well-supported path is really the hosted/cloud product, which reintroduces the vendor
dependency self-hosting was meant to avoid. Given AGPL's copyleft implications and the maturity
risk, this is a riskier bet than building the equivalent (a hashed-keys table) directly in Django,
which the team already knows how to operate.

### 3.6 Moesif / ReadMe metering+portal SaaS

Neither is a gateway or key-issuer — both are additive layers that assume a real auth/key system
already exists. **Moesif** is a usage-metering/analytics/monetization layer (Stripe/Zuora billing
integration, custom usage formulas); self-serve pricing runs $75/month per additional team member
plus presumably volume-based enterprise tiers for event ingestion
([Moesif pricing](https://www.moesif.com/price)). **ReadMe** is primarily interactive API
documentation with a self-serve API-key *display* UI in its portal — but it explicitly **does not
issue credentials, connect to a gateway, or manage partner access**; it calls out to your existing
backend to create/show keys ([ReadMe API keys docs](https://lucid.readme.io/docs/api-keys);
[ReadMe pricing](https://readme.com/pricing)). Both are relevant to the developer-portal/analytics
question later, not to the core identification problem now.

## 4. Developer-portal-in-a-box (ReadMe, Stoplight, Zudoku, Backstage)

### 4.1 What a minimal self-serve key portal needs

Reading the brief's actual ask literally, a minimal portal needs: (1) login tied to Sefaria's
existing account system, (2) a create/revoke/rotate-key UI backed by whichever issuance store is
chosen, (3) a display-once key page plus basic usage numbers, (4) docs. That's a small CRUD UI plus
one table. Every product below solves a substantially bigger problem than that — multi-team
internal catalogs, OpenAPI-spec-driven doc generation, SSO federation across dozens of services —
none of which matches Sefaria's actual scope (a community-facing page for hobbyists/nonprofits to
get a key).

### 4.2 ReadMe.io

Interactive OpenAPI docs with a "Try It" console and a self-serve API-key section in the portal
(create key, name it, set expiration) plus usage dashboards — but again, it's a UI shell that calls
back to your own backend for the actual key value; ReadMe itself doesn't issue or validate anything
([ReadMe docs](https://docs.readme.com/main/docs/plans-and-pricing)).

### 4.3 Stoplight

Now folded into SmartBear/SwaggerHub (acquired 2023, actively integrated through 2026) — primarily
an API **design** tool (OpenAPI spec editor, mocking, style linting), not a runtime key-management
portal ([SmartBear/Stoplight acquisition announcement](https://blog.stoplight.io/smartbear-to-acquire-stoplight-to-deliver-industrys-broadest-portfolio-of-api-development-capabilities)).
Wrong tool for this job unless Sefaria separately wants to formalize OpenAPI-first API design.

### 4.4 Zudoku

Open source (Zuplo's own project), a React/TypeScript framework generating interactive API docs
from an OpenAPI spec with a built-in auth/playground; free to self-host as a docs site
([Zudoku site](https://zudoku.dev/); [Zudoku GitHub](https://github.com/zuplo/zudoku)). No
key-issuance backend of its own — it's wired to whatever auth/key store exists (Zuplo's platform,
or any custom OAuth/OIDC backend). Reasonable choice for a nicer public docs site regardless of
which gateway/backend Sefaria lands on, but doesn't move the identification problem forward by
itself.

### 4.5 Backstage

Spotify's internal-developer-portal framework; API-management plugins exist in its ecosystem (e.g.
Gloo Gateway's Backstage plugin surfaces API-key/usage-plan management through Backstage's UI —
[Solo.io writeup](https://www.solo.io/blog/cloud-native-api-management-portal)) — but Backstage
itself is a heavy, Node-based, Postgres-backed platform built for internal engineering-team service
catalogs, not public developer self-serve. Running it purely to get a key portal would be
substantially more ops burden (a new Node service, a new Postgres instance, plugin maintenance, SSO
wiring) than the problem justifies at Sefaria's scale. Only makes sense if Sefaria already wanted an
internal developer portal for unrelated reasons and could bolt keys on as one more plugin.

Bottom line for Section 4: none of these products directly issues or validates keys. All four are
documentation/UI layers that still need a real backend (Django table, Envoy Secret, or a vendor
like Zuplo/Unkey) behind them. Given the actual scope of what Sefaria needs, the highest-leverage
move is likely a lightweight custom page in the existing Django-templated site or React frontend,
not adopting any of these.

## 5. The "build in Django" baseline

### 5.1 djangorestframework-api-key + middleware + Redis + BigQuery logs

[`djangorestframework-api-key`](https://github.com/florimondmanca/djangorestframework-api-key)
(florimondmanca) is a small, well-maintained (v3.1.0, April 2025; 741 stars; active issue tracker)
DRF library: keys are hashed before storage (never stored plaintext), managed via Django admin or
programmatic helpers, and it integrates cleanly with DRF's permission and throttle classes. It's
explicitly scoped — the maintainers note it is "NOT meant for authentication" (no built-in
scopes/expiry sophistication), positioning it as a permission/throttle building block rather than a
full auth system.

Baseline architecture: this library (or an equivalent hand-rolled hashed-keys table) for issuance
and lookup + a DRF throttle class keyed on the API key, backed by Redis counters (django_redis is
already available, per the brief) for atomic, multi-pod-consistent rate limiting + the existing
nginx/Django JSON access logs already flowing to BigQuery daily (per `01-current-state.md`) for
metering/analytics with no new pipeline. Self-serve portal = a Django view/template or a page in
the existing React frontend, gated behind the existing account/login system — no new auth
infrastructure needed at all.

### 5.2 What platforms add over the baseline

- **Edge-level enforcement.** The baseline only sees requests that reach Django — it inherits the
  brief's flagged Varnish-cache-bypass gap (undercounts on ~15 cached GET patterns) by
  construction. Only edge enforcement (Envoy Gateway, Section 2; or Cloudflare, Section 3.1) closes
  this without changing Varnish's cache key.
- **True edge rejection speed.** Django+Redis still pays the full nginx→Varnish→Django round trip
  before a request can be throttled/rejected, unlike Envoy/Cloudflare, which can reject before
  reaching origin at all.
- **Polished self-serve UI, analytics, and monetization dashboards out of the box** — this is the
  real build-time tradeoff against Zuplo/ReadMe/Apigee; the baseline requires building that UI
  in-house.
- **Cross-team governance features** (RBAC scopes, SSO, audit trail) that Enterprise gateway tiers
  bundle — not present in the baseline without custom work.
- **Endpoint-weighted quota costs** (Envoy's "cost" specifier) — achievable in Django throttle
  classes but bespoke, not built-in.

Given Sefaria's team is Django-centric and already operates Redis and the BigQuery log pipeline,
the baseline is cheap to build and matches existing skills. The real product question this research
should surface: is the Varnish-bypass undercounting (on a small, specific set of cached GET
patterns) acceptable on its own, or does it alone justify adding edge enforcement via Envoy
Gateway — which, per Section 2, is close to free precisely because Sefaria already runs it?

## 6. Comparison table

| Option | Issuance | Validation | Rate limits | Metering | Portal | $ Cost | Ops cost | Fit for Sefaria |
|---|---|---|---|---|---|---|---|---|
| **Kong OSS/Konnect** | plugin (self-managed) | ✅ (free core) | ✅ (free core) | partial | Konnect only (paid) | free core, but OSS images/free-mode gutted post-3.10; Konnect Plus ~$105/svc/mo+; Enterprise $30–50k/yr | new Postgres control plane; own build/patch pipeline for OSS images | **Poor** — licensing trajectory hostile to free self-host |
| **Tyk** | via gateway API (no UI without Dashboard) | ✅ (free gateway) | ✅ (free gateway, Redis) | via Dashboard (paid) | **paid only** — no OSS dashboard/portal | gateway free; Dashboard/Portal proprietary, quote-only | new proxy layer; MongoDB/Postgres if Dashboard bought | **Poor** — the actual portal ask is the paid piece |
| **Apache APISIX** | plugin (self-managed) | ✅ (free) | ✅ (free) | partial | none built-in | free | new proxy layer + etcd cluster (or standalone mode) | **Weak** — real features, real new ops surface |
| **KrakenD** | n/a | **Enterprise-only** | ✅ free (limits only) | partial | none | Community free but lacks key-auth; Enterprise quote-only | new proxy layer | **Poor** — hard gate on the core feature needed |
| **Envoy Gateway (native)** | build (Django-side sync job) | ✅ SecurityPolicy APIKeyAuth | ✅ BackendTrafficPolicy, per-key Distinct + cost | build (pair with BigQuery) | build (Django page) | $0 new platform cost | small: RLS pod + Redis namespace + one sync job | **Strong** — zero new platforms, solves Varnish gap structurally |
| **Cloudflare API Shield** | none | via edge rules | ✅ IP-based free tiers; per-key = Enterprise quote | via Cloudflare analytics | none | Free–$250/mo for coarse; Enterprise quote for granular | ~0 if already fronting us | **Conditional** — good only if Cloudflare confirmed present and coarse limits suffice |
| **Google Apigee** | ✅ | ✅ | ✅ | ✅ | ✅ | **$365/mo/env floor**, subscriptions $2.5k–25k/mo | large: new proxy language, analytics pipeline, environments | **Poor** — heavyweight/expensive for 15% external traffic |
| **GCP API Gateway** | via Google API keys | ✅ | basic quotas | basic | none | 2M free/mo then $3/M | must become/replace ingress (ESPv2 = hosted Envoy) | **Weak** — architecturally redundant with what we run |
| **Zuplo** | ✅ | ✅ | ✅ | ✅ | ✅ auto-generated | Free tier 100K req/mo; $25/mo Builder+usage; self-hosted option | new vendor; moderate if self-hosted behind Envoy | **Good fallback** — most complete single product |
| **Unkey** | ✅ | ✅ | ✅ | ✅ | none (keys UI only) | OSS (AGPL) free; hosted has own pricing | self-host "not the paved road"; team paused OSS contributions | **Risky** — maturity/governance concerns |
| **Moesif** | none | none | none | ✅ | none | $75/mo/seat+ | additive only, needs auth layer already in place | **N/A alone** — analytics add-on, not core solution |
| **ReadMe** | none (UI only) | none | none | ✅ basic | ✅ docs+key UI | not fully published, scales with usage | additive only, needs key backend already in place | **N/A alone** — docs/portal shell |
| **Zudoku** | none | none | none | none | ✅ docs shell (OSS) | free (self-hosted) | low — static-ish docs app | **Useful only for docs**, not identification |
| **Backstage** | via plugins | via plugins | via plugins | via plugins | ✅ (internal-catalog-oriented) | free (OSS) but heavy | large: Node service + Postgres + plugin maintenance | **Poor fit** — wrong shape (internal catalog, not public portal) |
| **Django baseline** (drf-api-key + Redis + BigQuery) | ✅ | ✅ | ✅ (app-level) | ✅ (existing pipeline) | build (Django page) | $0 new platform cost | small: one library + one throttle class | **Strong** — matches team skills; inherits Varnish gap alone |

## 7. Migration risk with Varnish in the middle (cross-cutting)

Enforcement has to happen in one of three places relative to Varnish, and each has a different
cost:

- **In front of Varnish** (Cloudflare edge, or Envoy Gateway — both already the true front door
  today): sees every request regardless of cache hits/misses; no cache-key changes needed; zero
  new insertion point if it's a system already occupying that position. This is Envoy Gateway's
  and (conditionally) Cloudflare's structural advantage over everything else surveyed.
- **Inside Varnish's cache key** (a query-param key instead of URL-only): fragments the cache per
  key/anonymous state — a real cache-hit-ratio cost the brief explicitly flags as a tradeoff, not a
  free win.
- **After Varnish, at Django**: simplest to build (the baseline in Section 5), but undercounts by
  construction on the ~15 cached GET patterns Varnish serves without ever reaching Django.

Every self-hosted OSS gateway (Kong, Tyk, APISIX, KrakenD) would need to be inserted **before**
Varnish — effectively becoming, or sitting alongside, the ingress currently owned by Envoy Gateway
— to get the front-of-Varnish benefit at all. That's meaningful re-plumbing: DNS/ingress changes,
a new TLS termination point, and a new failure domain between Cloudflare and nginx. GCP API Gateway
and Apigee carry the same risk, arguably worse, since adopting either typically means it *becomes*
the gateway rather than slotting in as an add-on. Zuplo is the one SaaS/managed option that
meaningfully reduces this risk via its self-hosted deployment mode — run as a Kubernetes workload
positioned between Envoy and nginx, it's a new hop and a new failure domain, but not a full
ingress/DNS cutover. Envoy Gateway itself and (if actually present) Cloudflare are the only options
with **zero** insertion-point risk, because they already occupy the front-door position.

## 8. Shortlist for product discussion

1. **Envoy Gateway native enforcement (`SecurityPolicy` APIKeyAuth + `BackendTrafficPolicy` rate
   limiting) as the primary candidate.** Zero new platforms — reuses infrastructure already
   deployed and operated. Structurally solves the brief's hardest constraint (Varnish undercounting)
   by sitting ahead of the cache. The only genuinely new code is a small Django→Kubernetes-Secret
   sync job for key issuance/revocation and a self-serve UI page. Open item before committing:
   confirm the deployed Envoy Gateway version supports `APIKeyAuth` and the `Distinct` selector +
   cost specifier (these landed across releases up to v1.3.0).

2. **Django baseline (`djangorestframework-api-key` + Redis-backed DRF throttling + the existing
   BigQuery log pipeline) as the system of record, paired with #1, not competing against it.**
   Matches the team's existing Django/Python skills, adds no new vendor, and gives richer per-key
   metadata (owner, tier, scope) than a flat Kubernetes Secret can hold on its own. The realistic
   recommendation is likely "both together": Django owns identity, issuance, and the portal;
   Envoy Gateway enforces at the edge to close the Varnish gap. This directly answers the brief's
   open question of "where enforcement lives (edge vs app)" — the honest answer is both, with
   Django as source of truth and Envoy mirroring a subset of that state for fast, edge-level
   rejection.

3. **Zuplo, as a scoped trial, not a default.** If building the self-serve portal UI,
   tiering/monetization, or usage-analytics dashboard in-house turns out to be materially more
   effort than expected, Zuplo's real free tier and integrated key-auth + portal + Stripe
   monetization could shortcut months of internal UI work — and its self-hosted deployment mode
   avoids becoming a new "front door" SaaS dependency. Worth a time-boxed spike specifically to
   de-risk the portal-building estimate for option 2, not as a first move.

**Explicitly not recommended, with the specific reason each fails Sefaria's bar:**

- **Kong** — OSS free-self-host path was materially weakened in March 2025 (no prebuilt OSS
  images, no free mode); rug-pull risk for a nonprofit betting on "free forever."
- **KrakenD Community** — API-key auth is Enterprise-only; the free tier cannot do the one thing
  we need it to do.
- **Tyk (without purchasing Dashboard)** — the gateway is free, but the actual self-serve portal
  the brief asks for is Tyk's proprietary paid product; "free Tyk" doesn't solve the brief's core
  ask.
- **Apache APISIX** — real free features, but requires standing up and operating a new
  distributed-systems dependency (etcd) and a second full proxy layer for capability Envoy Gateway
  already has natively.
- **Google Apigee** — ≥$4,400/year floor before meaningful usage, plus a large new operational
  surface, for a nonprofit whose genuinely-external traffic is ~15% of total API volume today.
- **GCP API Gateway** — architecturally a hosted Envoy (ESPv2) with no portal/metering of its own;
  adopting it duplicates capability already run in-house and forces an ingress rewrite.
- **Backstage** — designed for internal engineering service catalogs, not public self-serve;
  wrong shape, and a heavy new Node+Postgres platform for the wrong problem.
- **Unkey (self-hosted)** — real conceptual fit (a keys-only microservice) undercut by
  self-hosting immaturity, AGPL copyleft, and the maintaining team pausing external contributions.

## Sources

- Kong: [3.10 licensing/OSS-image change writeup](https://tasrieit.com/blog/migrate-kong-oss-to-envoy-gateway-complete-guide) · [Kong license docs](https://developer.konghq.com/gateway/entities/license/) · [Kong pricing 2026 analysis](https://www.truefoundry.com/blog/kong-gateway-pricing-architecture-an-analysis-for-ai-teams-2026-edition) · [Kong pricing page](https://konghq.com/pricing) · [Konnect free tier](https://freetier.co/directory/products/kong-konnect) · [Kong Konnect pricing explainer](https://api7.ai/blog/kong-konnect-pricing)
- Tyk: [Tyk OSS Gateway docs](https://tyk.io/docs/tyk-oss-gateway) · [Tyk open-source page](https://tyk.io/open-source-api-gateway/) · [Tyk self-managed licensing](https://tyk.io/docs/4.2/tyk-on-premises/licensing/) · [Community: no OSS dashboard](https://community.tyk.io/t/how-to-access-tyk-dashboard-in-tyk-oss-open-source-gateway/8313)
- Apache APISIX: [API gateway authentication learning center](https://apisix.apache.org/learning-center/api-gateway-authentication/) · [limit-count plugin docs](https://apisix.apache.org/docs/apisix/plugins/limit-count/) · [APISIX without etcd](https://blog.frankel.ch/apisix-without-etcd/) · [Ingress deployment architecture](https://apisix.apache.org/docs/ingress-controller/concepts/deployment-architecture/) · [Lightweight ingress controller without etcd](https://apisix.apache.org/blog/2023/10/18/ingress-apisix/)
- KrakenD: [API key auth docs (Enterprise Edition)](https://www.krakend.io/docs/enterprise/authentication/api-keys/) · [Feature comparison OSS vs Enterprise](https://www.krakend.io/features/) · [Community/Enterprise switch FAQ](https://www.krakend.io/docs/faq/switch-versions/)
- Envoy Gateway: [API Key Authentication docs](https://gateway.envoyproxy.io/docs/tasks/security/apikey-auth/) · [Rate limiting concepts](https://gateway.envoyproxy.io/docs/concepts/rate-limiting/) · [Global rate limit task docs](https://gateway.envoyproxy.io/docs/tasks/traffic/global-rate-limit/) · [BackendTrafficPolicy concept docs](https://gateway.envoyproxy.io/docs/concepts/gateway_api_extensions/backend-traffic-policy/) · [v1.3.0 rate-limit cost feature](https://dev.to/reoring/envoy-gateway-130-overview-of-the-new-rate-limiting-with-cost-feature-252j)
- Cloudflare: [Rate limiting rules docs](https://developers.cloudflare.com/waf/rate-limiting-rules/) · [API Shield get-started](https://developers.cloudflare.com/api-shield/get-started/) · [Cloudflare rate-limiting pricing analysis](https://blog.blazingcdn.com/en-us/understanding-cloudflares-rate-limiting-pricing) · [Cloudflare API security pricing worth-it analysis](https://blog.blazingcdn.com/en-us/cloudflares-pricing-for-api-security-is-it-worth-it)
- Google Apigee / GCP API Gateway: [Apigee pricing](https://cloud.google.com/apigee/pricing) · [Apigee 2026 tier breakdown](https://apigatewaycost.com/apigee) · [Pay-as-you-go overview](https://docs.cloud.google.com/apigee/docs/api-platform/reference/pay-as-you-go-updated-overview) · [GCP API Gateway pricing 2026](https://apigatewaycost.com/google-cloud) · [Gateway pricing comparison 2026 (Zuplo)](https://zuplo.com/learning-center/api-gateway-pricing-comparison-2026) · [Choosing between Apigee/API Gateway/Endpoints (Google Cloud blog)](https://cloud.google.com/blog/products/application-modernization/choosing-between-apigee-api-gateway-and-cloud-endpoints) · [ESPv2 on GKE docs](https://docs.cloud.google.com/endpoints/docs/openapi/get-started-kubernetes-engine-espv2) · [ESPv2 GitHub](https://github.com/GoogleCloudPlatform/esp-v2)
- Zuplo: [Pricing](https://zuplo.com/pricing) · [Gateway pricing comparison 2026](https://zuplo.com/learning-center/api-gateway-pricing-comparison-2026) · [Zuplo homepage](https://zuplo.com/)
- Unkey: [GitHub repo](https://github.com/unkeyed/unkey) · [Unkey site](https://www.unkey.com/) · [Self-host review 2026](https://www.buildmvpfast.com/blog/unkey-open-source-api-key-management-rate-limiting-2026)
- Moesif: [Pricing](https://www.moesif.com/price) · [Metered API billing](https://www.moesif.com/solutions/metered-api-billing)
- ReadMe: [API Keys docs](https://lucid.readme.io/docs/api-keys) · [Plans and pricing](https://docs.readme.com/main/docs/plans-and-pricing)
- Stoplight: [SmartBear acquisition announcement](https://blog.stoplight.io/smartbear-to-acquire-stoplight-to-deliver-industrys-broadest-portfolio-of-api-development-capabilities) · [Stoplight homepage](https://stoplight.io/)
- Zudoku: [Zudoku site](https://zudoku.dev/) · [GitHub repo](https://github.com/zuplo/zudoku)
- Backstage: [Cloud-native API management portal (Solo.io)](https://www.solo.io/blog/cloud-native-api-management-portal) · [Backstage service-to-service auth docs](https://backstage.io/docs/auth/service-to-service-auth/) · [Backstage plugins](https://backstage.io/plugins/)
- Django baseline: [djangorestframework-api-key GitHub](https://github.com/florimondmanca/djangorestframework-api-key)
