# Survey: How Open-Content, Cultural & Nonprofit APIs Handle Keys, Identification & Anonymous Access

> Part of the sc-45692 API-key research (see [00-brief.md](./00-brief.md)). Desk research compiled
> July 2026 from public developer documentation, blog posts, and API portals. All claims are cited
> inline; anything not independently corroborated is marked **[unverified]**.

## Why these comparables matter for Sefaria

Sefaria's situation — an open, high-traffic, mostly-free content API run by a nonprofit, currently
fully anonymous, wanting to identify consumers without breaking existing integrations — is not
novel. A cluster of open-content/cultural/scholarly-infrastructure organizations have solved
variants of exactly this problem: Wikimedia (largest anonymous-to-authenticated migration in the
space), Crossref (the "polite pool" pattern for coexistence of identified and anonymous traffic),
Internet Archive/Open Library, Europeana, NYT, api.data.gov/NASA (shared key infrastructure,
`DEMO_KEY`), the Met (deliberately no key), and DPLA. This doc surveys each org's answers to the
same questions the brief poses — key requirement, self-serve flow, anonymous tier, enforcement,
rate limits, rollout/communication, key format, stated rationale — then synthesizes patterns
relevant to Sefaria's specific constraints (Varnish URL-only cache key, wildcard CORS, no existing
throttling, extended grace period requirement, first- vs third-party differentiation).

---

## Wikimedia (Wikipedia REST API / MediaWiki Action API)

**Are keys required?** No — anonymous access remains fully supported, but as of a 2026 rollout it
gets materially lower rate limits than identified access. This is the closest real-world precedent
to Sefaria's "keep anonymous working, but make it worse than identified" plan.

**Self-serve signup flow.** A **personal API token** is created from an existing Wikimedia
account (the same account used to edit Wikipedia) via "My clients" → "Create client" → "Personal
API token" in the API Portal. No separate application/approval step — it's a self-service button
click gated only by having a Wikimedia login. Tokens are Bearer tokens, valid indefinitely (no
expiry), sent as `Authorization: Bearer <token>`, and documented as tied to the individual account
(not to be shared/published). Third-party apps that need to act on behalf of arbitrary users
instead register an **OAuth 2.0** client (client-credentials or authorization-code flow), which is
the path for building distributable software rather than personal scripts.
[Personal API tokens documented via search of api.wikimedia.org Authentication page; OAuth via mediawiki.org/wiki/OAuth/For_Developers]

**Anonymous tier.** Explicitly allowed and expected to remain the majority path for casual/human
use — the FAQ states limits were deliberately set "high enough to cover almost all usage" for
that population. **[unverified, paraphrase from WebFetch summary of mediawiki.org FAQ, not
independently re-confirmed against primary text]**

**Rate limits by tier** (from `mediawiki.org/wiki/Wikimedia_APIs/Rate_limits`, rolled out 2026):
- Unidentified request (bare IP, no User-Agent): **10 req/min**
- Unauthenticated but with a compliant User-Agent, or generic browser traffic: **200 req/min**
- Authenticated, new/low-activity account: **200 req/min**
- Authenticated, established editor: **2,000 req/min**
- Bot-flagged accounts / extended-rights holders: exempt from these limits

That is a **20x** spread between an anonymous request with no identifying User-Agent and an
established authenticated account — and even *just adding a compliant User-Agent string* (no
account needed) is worth a **20x** jump on its own (10 → 200). This "identification without
credentials" tier is a notable middle ground: Wikimedia rewards *any* honest self-identification,
not only cryptographic keys.

**Enforcement.** At the gateway layer (in front of MediaWiki), keyed per-minute, returns HTTP 429
with a `Retry-After` header; clients are told to back off exponentially if no header is present.

**How they communicated/rolled it out.** Wikimedia separates *policy* from *enforcement* rollout:
- Aug 26, 2024: "API Policy Update 2024" published as v1.0 on Meta-Wiki — explicitly framed as
  **not a new requirement** but "a statement of existing practices in greater detail" (formalizing
  rules on concurrent connections, request rate, User-Agent labeling, and multi-agent traffic
  hiding that were previously informal/undocumented).
- Aug 28–Sep 13, 2024: two-and-a-half-week public feedback period on the policy text.
- 2026: actual rate-limit *enforcement* (the 10/200/2,000 req/min gateway limits above) rolled out
  separately and later, motivated by a stated surge in automated/bot traffic — "about 40% of page
  views and the majority of our most expensive traffic" by early 2026, and specifically a rise from
  roughly 33% unauthenticated automated requests at end of 2025. Framed as protecting "human
  readers and community members" over "high-volume commercial consumers," and as a deliberate
  strategy shift away from trying to block individual bad actors (who evade detection) toward
  tiered incentives that make identification the path of least resistance.
[mediawiki.org/wiki/Wikimedia_APIs/Rate_limits, mediawiki.org/wiki/Wikimedia_APIs/Rate_limits/FAQ,
meta.wikimedia.org/wiki/Special:MyLanguage/API_Policy_Update_2024]

**Key/token format.** Personal API token = long-lived Bearer token issued from account settings.
OAuth 2.0 client credentials for apps. No API-key-in-query-string option offered for the modern
REST API (contrast with the legacy Action API's session-cookie-based auth).

**User-Agent policy (independent of keys).** Separately from rate-limit tiers, Wikimedia has long
required (`foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines`, and the
underlying User-Agent policy) that all API clients send a descriptive User-Agent of the form
`<client name>/<version> (<contact info: email, URL, or wiki username>) <library/framework>/<version>`.
Generic/default User-Agents (e.g. bare `python-requests`) are explicitly called out as subject to
throttling or blocking even before the 2026 numeric limits existed. Stated rationale: contact info
in the UA string is what makes it *possible* for the Foundation to reach an operator about a
problem — the identification requirement exists to enable a human conversation, not (primarily) as
an access-control gate. This is a **zero-friction identification mechanism** — no signup, no key
issuance, just a header convention — that Sefaria's current stack (UA + referer only, per the
brief) already partially has the infrastructure to lean on harder before building a full key
system.
[foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines]

## Crossref (the "polite pool")

Crossref is the DOI-metadata registration agency for scholarly publishing — a nonprofit membership
org, not a content library, but its REST API is the single most-cited precedent for exactly
Sefaria's "anonymous coexists with identified, no signup required" problem, and it predates
Wikimedia's 2026 move by nearly a decade.

**Are keys required?** No, never, for the free tiers. "Anyone can access the REST API, no signup or
registration is required." The **only** thing gated behind an actual issued API key is the paid
**Metadata Plus** subscription tier (see below) — everything else is open-by-default with
self-identification as an optional, incentivized upgrade.

**The three pools:**
1. **Public pool** — no identification at all. Rate-limited the hardest.
2. **Polite pool** — identify yourself by putting an email address in a `mailto=` query parameter
   *or* an `agent` header (i.e., in your User-Agent string) on every request. No signup, no
   approval, no account — you just start sending the parameter and you're in the polite pool
   immediately. Gets roughly double-to-triple the request rate of the public pool.
3. **Plus pool** — paying Metadata Plus subscribers only, authenticated via
   `Crossref-Plus-API-Token: Bearer <token>` header. Highest limits (150 req/interval, unlimited
   concurrency in earlier docs) and it's the only pool with an actual issued secret credential.
[crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/]

**Self-serve flow for the polite pool.** There isn't one — "self-serve" here means literally
appending `?mailto=you@example.org` to a request URL. No account, no verification that the email
is real or reachable, no key to lose or rotate. This is the cheapest possible identification
mechanism: an honor-system contact string, not a credential.

**Rate limits by tier**, most recent public numbers (effective **December 1, 2025** revision,
first material change since 2013):
- Public pool: 5 req/sec for single-record lookups (1 concurrent), 1 req/sec for list/query
  endpoints (1 concurrent)
- Polite pool (`mailto`): 10 req/sec for single-record (3 concurrent), 3 req/sec for list/query (3
  concurrent)
- Limits are also echoed back in response headers (`x-rate-limit-limit`, `x-rate-limit-interval`)
  so a client can programmatically discover which pool it landed in and its current allowance —
  worth noting as a good practice Sefaria doesn't currently have (brief notes "no throttling
  configured anywhere").
[crossref.org/blog/announcing-changes-to-rest-api-rate-limits/]

**Enforcement.** Exceeding the limit gets you denied for a fixed backoff window (10 seconds, per
the pre-2025 regime) rather than a hard ban — a soft, self-healing throttle rather than a block.

**How they communicated the Dec 2025 change.** A public blog post
(`crossref.org/blog/announcing-changes-to-rest-api-rate-limits/`) plus a companion community-forum
thread, explaining: (a) the *why* — traffic tripled and the metadata corpus grew a third (120M →
180M records) since the 2013-era limits were set, and there had been real outages ("periods where
we haven't been able to keep the API available for all users"); (b) the *guiding principle* stated
explicitly — "keep all of the metadata available to everyone, all of the time" — i.e. the
rate-limit tightening is framed as being *in service of* universal free access, not a monetization
move; (c) a quantified blast-radius estimate — they explicitly said they expected to affect "around
40 users per week" — indicating they had usage telemetry precise enough to model the impact of a
policy change before shipping it, and chose to publish that number to reassure the community the
change was surgical, not sweeping. A related 2017 post
("rebalancing-our-rest-api-traffic") appears to document the original introduction of the
polite-pool split itself. **[unverified — title inferred from search result, not fetched directly]**

**Key format (Plus tier only).** Opaque bearer token, presented as
`Crossref-Plus-API-Token: Bearer <token>`; issued to subscribers on sign-up for the paid service
(mechanics of that signup — Crossref membership/subscription flow — not documented in the technical
API docs, since it's a commercial-relationship step, not a self-serve developer-portal step).

**Why this matters most for Sefaria.** Crossref is the cleanest real-world existence proof that you
can (a) never require a key for free/public use, (b) still meaningfully differentiate and reward
identification with a trivial honor-system parameter (email in a query string or header — no
account, no secret, nothing to leak or rotate), and (c) reserve actual cryptographic API keys only
for a paid/contractual tier layered on top. It directly matches the brief's "identification-first,
quotas as a future lever" priority and its concern about first-party/client-side callers that can't
hold secrets (a `mailto`-style header needs no secrecy at all, so it works even for
Sefaria's Linker embeds running in third-party visitors' browsers).

## Internet Archive / Open Library

Two related but distinct APIs under the same nonprofit (Internet Archive runs Open Library), and
both are close structural analogs to Sefaria: free, mission-driven, no venture funding, API served
by the **same application stack that serves the human-facing website** — meaning API load directly
competes with patron-facing latency, exactly the shared-infra situation implied by Sefaria's
Django/gunicorn web pods serving both.

**Open Library (books metadata API):**
- **No API key, ever, for read access.** Confirmed on the official developer page:
  "Open Library does not require API keys. Access is free and open to all users."
- **Self-identification via header, not credential.** The ask is: send a `User-Agent` header
  naming your app plus a contact email, e.g. `User-Agent: MyLibraryApp (contact@example.org)`. No
  signup, no account, no key — just an honest header, exactly the Wikimedia/Crossref pattern.
- **Rate limits:** unidentified requests get **1 req/sec**; identified requests (UA + email) get
  **3 req/sec** — a 3x multiplier for voluntary self-identification. The Covers API additionally
  rate-limits non-ID-based cover lookups to 100 req/5min per IP.
- **Enforcement & escalation, in the maintainers' own words** (GitHub issue #10585, comment by
  maintainer @mekarpeles, Open Library org): *"The user-agent is used for rate limiting some bots
  and also gives us a way to contact services if we notice behavior where there may be better
  solutions (with discussion) ... If we notice lots of requests from certain networks, then we
  rate limit and sometimes block entirely ... Our policy is to prioritize patrons and end-users
  while offering the best support we can to library partners and other public good book services
  in the ecosystem."* This is a manual/relational enforcement model, not fully automated — small
  nonprofit team, direct outreach to known bulk consumers, with a stated priority order (end users
  > partners > everyone else) that Sefaria's brief effectively mirrors (first-party > known
  nonprofit peers > anonymous/unknown).
  [github.com/internetarchive/openlibrary/issues/10585]
- **Explicit bulk-use redirection**: rather than building tiered API quotas for bulk consumers,
  Open Library's documented policy is to push large-scale users off the live API entirely, toward
  monthly static **data dumps** — "For bulk data needs, users should download monthly data dumps or
  contact the team directly." This is a notable alternative lever Sefaria hasn't obviously
  considered: some of the brief's "hobbyist/nonprofit" long tail doing large bulk reads might be
  better served (and cheaper for Sefaria) by a data-dump/export path than by a higher-tier key.
- **Earlier internal deliberation**: a 2023 GitHub issue (#8534, "Establish API Rate Limiting
  Policy/Approach") shows the *original* proposal was exactly the pattern that shipped: "Rate limit
  requests that do not specify or disclose some sort of header or user-agent identifying the
  request." I.e., identification-via-header-first was the starting design, not an afterthought —
  and by the time a maintainer revisited the issue in 2025 the reply was simply "I think we have
  rate-limiting pretty well established now," suggesting the lightweight header-based scheme was
  sufficient and didn't need to escalate to full API keys even years later.
  [github.com/internetarchive/openlibrary/issues/8534]

**Internet Archive core (IA-S3 API, item/metadata read-write):**
- **Read is unauthenticated; write requires keys.** "Many of the operations on the Internet
  Archive database can be done freely without any authentication or authorization" — this covers
  reads. Uploading, searching-with-write-intent, and modifying metadata require **IA-S3 keys**
  (an access key + secret key pair, deliberately modeled on AWS S3's credential shape), obtained
  self-serve from a logged-in archive.org account at `archive.org/account/s3.php` — i.e. keys are
  gated behind having *any* free archive.org account, not a separate developer-application process.
  [archive.org/developers/tutorial-get-ia-credentials.html]
- **Rate limiting is proactive/queryable rather than just reactive**: clients can *ask in advance*
  whether an upload would be throttled (`?check_limit=1&accesskey=...&bucket=...`) before
  attempting it, and the Tasks API supports a client-side opt-in
  (`X-Accept-Reduced-Priority` header) to voluntarily accept lower priority instead of being
  rejected outright with a 429 — a graceful-degradation pattern (self-throttle instead of getting
  blocked) worth noting for endpoints Sefaria might want bulk consumers to use without banning them.
  [archive.org/developers/ias3.html, archive.org/developers/tasks.html]
- This read/write split maps directly onto Sefaria's own read-heavy API: Internet Archive doesn't
  bother keying the read path at all, only the paths that mutate their data or consume disproportionate
  resources (uploads).

## Europeana (wskey)

Europeana (EU-funded cultural-heritage aggregator, ~50M+ digitized objects from thousands of
institutions) is the cleanest example in this survey of a "key required, but purely for
identification — not for rate limiting" model, which is unusually close to what Sefaria's brief
describes wanting ("identification-first; quotas ... as a future lever").

**Are keys required?** Yes — unlike Wikimedia/Crossref/Open Library, Europeana requires a key
(historically called a **wskey**) for essentially all API access, including plain reads. But
critically: **"all API methods that read information from our databases will always be free to use
and will never have limitations posed upon them"** and, elsewhere, **"You can query our APIs as
often as you like without any throttling or limiting"** (with a polite ask to leave a few
milliseconds between requests). So the key exists purely to *identify* the caller — Europeana
explicitly disclaims using it to *rate-limit* the caller. This is a strong existence proof that
"require a key" and "throttle traffic" are separable decisions, not a package deal.
[europeana.atlassian.net Europeana API FAQ]

**Self-serve signup flow.** Registration moved (as of **May 28, 2025**) into the main Europeana
website account system — you first create an ordinary Europeana user account, then request keys
from a "Manage API keys" panel under the account menu. Two key tiers, deliberately structured as a
**graduated trust ladder**:
- **Personal key**: self-serve, no approval step, issued instantly to any account holder; capped at
  one active personal key per account; explicitly framed as for "testing and discovery," with
  "generous enough" limits for that use case.
- **Project key**: for production/organizational use, "significantly higher usage limits," and —
  notably — **applicants must already hold and have used a personal key first**; a project-key
  request with no prior personal-key history is auto-rejected. This is a low-friction way to filter
  out drive-by/bulk-registration abuse of the higher tier without adding any human review step for
  the low tier.
- A checkbox confirming acceptance of API key Terms of Use is required at request time (per earlier
  search result), i.e. the only "information collected" beyond the account itself is agreement to
  ToS — no application form, no stated purpose required for the personal tier.
[pro.europeana.eu/page/get-api, europeana.atlassian.net Accessing the APIs]

**Anonymous tier.** None for the documented Search/Record/Entity APIs — a key (of some tier) is
always required, but see above: it's an identity credential, not a scarcity gate.

**Key format & transport — a directly relevant migration story.** Europeana **deprecated the
original `wskey` *query-string parameter*** in favor of an `X-Api-Key` *header*, with an explicit
overlapping grace period for migration. Stated rationale: **"public keys included in URLs can be
easily exposed when links are shared or bookmarked."** This is a concrete, citable precedent for a
decision Sefaria will likely face (brief mentions "CORS is wildcard-open," a new custom header would
need to be added to `Access-Control-Allow-Headers"): prefer a header over a query param for the key
itself, precisely because query params leak into browser history, referrer headers, logs, and
shared links — the query-param route is the *easier* one to ship (works with Varnish's URL-only
cache key, notably) but is the one an established peer explicitly walked away from for a documented
security reason.
- Higher-privilege access (write/private data, via a separate Auth Service issuing Bearer tokens)
  is currently restricted to "a selective number of API customers" — i.e. Europeana treats
  write/sensitive access as a manually-vetted allowlist tier above even the Project key, rather than
  self-serve.
[europeana.atlassian.net Accessing the APIs]

**Rate limits by tier.** Not numerically published in the pages fetched — framed qualitatively
("generous enough," "significantly higher") rather than as published req/sec numbers, unlike
Wikimedia/Crossref/Open Library. **[unverified — exact numeric limits not found in this pass;
would need the Europeana developer portal's key-management dashboard, which requires a logged-in
account to view]**

**Why this matters for Sefaria.** Europeana demonstrates: (1) a key can be purely a *name tag*,
decoupled from any throttling decision — directly supporting the brief's "identify first, tier
later" sequencing; (2) a two-tier self-serve/vetted ladder (auto-issued low tier bootstraps
eligibility for a higher tier) avoids needing manual review for the common case while still gating
the tier that matters; (3) the query-param → header migration is a warning shot specifically about
the query-param design Sefaria's Varnish cache-key constraint might otherwise make attractive.

## NYT Developer Network

The outlier in this survey — a commercial publisher, not a nonprofit — included because the brief
asked for it and because it shows the "always require a key, tiered by hard numeric daily/minute
caps" end of the spectrum for contrast with the honor-system nonprofits above.

**Are keys required?** Yes, always — a free NYT Developer Account is required to generate an API
key for any of the NYT APIs (Article Search, Books, Most Popular, etc.); there is no anonymous
tier at all.

**Self-serve signup.** Standard developer-portal flow: create a free account, register an "app" in
the portal, get a key per-app (a developer can have multiple apps/keys, e.g. to separate
rate-limit budgets per project). **[unverified — exact fields collected at signup not
independently confirmed in this pass; standard developer-portal pattern reported consistently
across secondary sources]**

**Rate limits.** Reported consistently (though secondary-sourced, with some inconsistency across
guides — treat exact numbers as **[unverified]**) as roughly **5 requests/minute and 500
requests/day** per key for most APIs, with the Article Search API sometimes cited at up to 10/min,
4,000/day. The spread in numbers across sources suggests either per-API variation or that limits
have changed over time; worth confirming against `developer.nytimes.com` directly before citing a
specific number in a decision doc.

**Why it's a useful contrast, not a model.** NYT is monetized editorial content behind a
metered paywall for humans, and the API exists to extend controlled syndication — the incentive
structure (hard caps, no anonymous access, per-app keys) is designed for exactly the opposite
situation from Sefaria's public-domain/CC-licensed corpus. It's a useful data point for "what a
strict tiered-quota commercial API looks like" but not directly a precedent Sefaria should pattern
its identification-first, anonymous-preserving approach on.
[dlab.berkeley.edu/news/getting-started-nyt-api; github.com/nytimes/public_api_specs]

## api.data.gov / NASA API (shared key infra, `DEMO_KEY` pattern)

**What it is.** `api.data.gov` is a shared API-gateway service (built by 18F/GSA) that many U.S.
federal agencies plug their APIs into — NASA's `api.nasa.gov` (APOD, NeoWs, DONKI, etc.) is the
best-known consumer. It is the closest analog in this survey to a **platform that solves "identify
API consumers" as a horizontal, reusable service** rather than each org building its own key
system — directly relevant to the brief's framing of possible "shared key infra."

**Are keys required?** Yes for real use, but there's a frictionless bridge: a single, publicly
published, shared **`DEMO_KEY`** string works immediately with zero signup, so a developer can
start calling any participating API instantly, then upgrade to a personal key later without
changing anything except the key value.

**Rate limits by tier:**
- `DEMO_KEY` (shared/anonymous-equivalent): **30 requests/hour per IP address**, capped at **50
  requests/day per IP** — deliberately too low for production/automated use, explicitly documented
  as such ("not suitable for production use or automated queries").
- Personal API key (free self-serve signup — name, email, no approval): **1,000 requests/hour**,
  applied *across all api.data.gov-participating APIs combined* (one key, one shared budget, many
  agencies) rather than per-agency.
- Enforcement: exceeding the limit gets the *key* (not just the IP) temporarily blocked; the block
  self-clears after an hour — soft/automatic, no manual intervention needed.
[api.data.gov — DEMO_KEY and personal-key limits corroborated by NASA API docs at
api.nasa.gov/assets/html/authentication.html and multiple secondary NASA-API guides]

**Stated rationale for the shared-infrastructure model** (from api.data.gov's own "About"/developer
material, via search-indexed content — **[unverified primary-source text; WebFetch to the primary
docs was blocked in this pass, so treat these as paraphrases of indexed summaries]**):
- **For developers:** one signup, one key, works across many otherwise-unrelated government APIs —
  removes the N-different-portals friction that would otherwise exist per agency.
  interpret through a Sefaria lens as inspiration if it ever wanted to federate key issuance
  with, say, other Jewish-text nonprofits — currently reads as out of scope but noted.
- **For participating agencies:** they are "freed from worrying about things like API keys, rate
  limiting, and gathering usage stats, so they can focus on building the next great API" — no code
  changes required in the underlying agency API; the gateway can be interposed in front of an
  existing unauthenticated API without that API's own code knowing about keys at all. This is
  architecturally close to what an Envoy-Gateway-level key-check would look like for Sefaria (per
  the brief's stack description, Envoy already sits in the request path and supports inline Lua /
  BackendTrafficPolicy) — i.e., api.data.gov is essentially "Envoy-Gateway-as-a-managed-service,
  purpose-built for API keys," which is suggestive of where enforcement could live without
  Django changes.
- **Abuse containment:** "Your API servers won't see traffic from users exceeding their limits" —
  i.e. the whole point of gateway-level (not app-level) enforcement is that over-limit traffic
  never reaches the origin app, directly relevant to Sefaria's brief noting Django/gunicorn pods as
  the expensive resource to protect.
[api.data.gov/about/, github.com/18F/api.data.gov — via search-indexed summaries, not directly
fetched; flag for direct verification before citing in a decision doc]

**Key format.** Simple opaque alphanumeric string, passed as a query parameter (`?api_key=...`) in
NASA's documented examples — notably the *opposite* of Europeana's header-only migration, and
worth flagging as a design tension: query-param keys are the easiest to demo/curl but carry the
same URL-leakage risk Europeana moved away from.

## Metropolitan Museum of Art Collection API (no-key policy)

The clearest "we deliberately chose not to require a key" case in the survey, and useful precisely
*because* it's a minority position among the orgs surveyed — most others require at least a
header/param for identification even when they don't rate-limit. The Met went further and
requires nothing at all.

**Are keys required?** No. Verbatim from the docs: **"At this time, we do not require API users to
register or obtain an API key to use the service."** No anonymous/identified split — there is only
one tier, and it's open.

**Rate limit.** A single documented guideline, not enforced via any account/key: **"Please limit
request rate to 80 requests per second."** This is a courtesy ask backed presumably by IP-level
infra protections rather than a keyed quota system — the Met is trusting requesters to self-police,
backed by (unstated) infrastructure-level abuse mitigation.

**Stated rationale** (from the Met's own "Scaling the Mission" post, `metmuseum.org/perspectives/
met-collection-api-2`, and its "Introducing Open Access" post, via search-indexed content — treat
exact wording as **[partially unverified — direct fetch was rate-limited (HTTP 429) during this
research pass; sourced via search-engine cache/summary]**):
- Explicit "lower the barrier to entry and encourage experimentation" framing — registration itself
  (even free, even instant) is treated as a barrier worth eliminating, not a neutral step.
- Frames *any* friction — "financial, legal, or simply procedural (like filling out forms or
  waiting for approval)" — as antithetical to the mission of maximizing public access, education,
  and creative reuse of a public-domain/CC0 collection.
- A concrete operational payoff cited: automating a previously-manual weekly upload process (to
  Google Arts & Culture) — i.e. the API's value included *replacing Met staff effort*, not just
  serving external developers, which is a reminder that "who consumes this" isn't only external
  third parties; first-party/partner automation matters too (echoes Sefaria's own first-party
  Linker/MCP/mobile consumers in the brief).
- The collection itself is explicitly CC0 (public-domain-equivalent) for the open-access subset,
  which is a meaningfully different legal/mission position than Sefaria's (which likely wants
  usage visibility for reasons beyond pure copyright licensing, e.g. to see how translations are
  reused) — so "no key at all" travels less well as a precedent for Sefaria's stated goal of
  wanting to *identify* consumers, even if it's a legitimate design for a museum that doesn't need
  to.
[metmuseum.github.io; metmuseum.org/perspectives/met-collection-api-2]

## DPLA (Digital Public Library of America)

A near-exact nonprofit-cultural-aggregator peer to Sefaria in mission shape (federates/serves
public-domain and openly-licensed cultural heritage metadata, nonprofit, nowhere near NYT-scale
commercial pressure), and its policy is the most explicit **written rationale** of any org
surveyed for *why* a key-required-but-unlimited model was chosen.

**Are keys required?** Yes, for all API access — but the signup is the lightest-weight of any
keyed system in this survey: **one HTTP POST to
`https://api.dp.la/v2/api_key/YOUR_EMAIL@example.com`**, no account, no password, no dashboard.
DPLA "captures only your email address" — the API key is generated server-side and **emailed** to
that address; there's no web form, no portal login, just an unauthenticated POST naming an email.
[pro.dp.la/developers/api-basics]

**Rate limits — explicit philosophy, not a number.** DPLA's policy page states the rationale
directly, and it's the single most quotable statement in this survey for Sefaria's
identification-first framing: **"Consistent with its philosophical presumption of openness, in
general, the DPLA will not restrict or rate-limit the use of its API."** and, elsewhere, **"access
to the API will not ordinarily be rate-limited or revoked."** So: key required, but the key is not
being used as a quota mechanism in the normal case — it exists so DPLA *can* act if needed, not so
it *automatically* throttles anyone.

**Enforcement is reserved/discretionary, not automated.** DPLA explicitly reserves — but does not
by default exercise — the right to intervene: *"the DPLA reserves the right to limit or revoke
access to the API if, in its discretion, a user engages in abusive conduct, conduct that materially
degrades the ability of other users to query the API."* This is a **manual, judgment-based
enforcement model** built entirely on the identification the key provides — i.e. the *entire*
value of the key, in DPLA's own design, is that it makes a human-in-the-loop response possible
later, not that it enforces anything automatically today. This is arguably the single cleanest
articulation in the whole survey of "identification now, enforcement-as-a-future-lever" — exactly
the sequencing the brief describes wanting for Sefaria.
[pro.dp.la/developers/policies]

**Key format.** Opaque string emailed to the registrant; used as a query parameter
(`api_key=...`) in DPLA's documented API calls.

## Jewish-text peers: Dicta, National Library of Israel

Brief asked for a light pass on Jewish-text-specific peers; these are considerably less
API-documentation-mature than the cultural-heritage majors above, so confidence here is lower.

- **Dicta** (Israeli nonprofit doing NLP/Torah-text digitization, a named peer/potential
  third-party consumer in Sefaria's own brief) does not appear to publish a general-purpose public
  REST API with a documented key-signup portal comparable to the orgs above — its public presence
  is centered on its website tools (e.g. nikud/punctuation, OCR) and research artifacts rather than
  a documented open data API. **[unverified — could not locate a Dicta developer-portal or
  API-key page in this pass; may exist but wasn't discoverable via search, or Dicta may only offer
  bespoke/negotiated data-sharing rather than a self-serve API]**
- **National Library of Israel (NLI)** exposes structured data (e.g. via a "NLI API" / linked-data
  and IIIF-based access to catalog and digitized-item data) but, similarly, no evidence surfaced in
  this pass of a self-serve API-key portal with published rate limits comparable to Europeana/DPLA.
  NLI is a Europeana data-contributing partner, so some of its metadata is *also* reachable through
  Europeana's own keyed API layer rather than a first-party NLI key system.
  **[unverified — warrants a follow-up pass specifically against nli.org.il developer
  documentation if this peer comparison needs to go into the decision doc; not pursued further
  here to stay within the research budget]**
- Neither peer offers a publicly documented precedent as mature or as directly transferable as
  Wikimedia/Crossref/Open Library/Europeana/DPLA above; recommend treating this section as a
  placeholder for a possible direct-outreach conversation (Sefaria likely has informal
  relationships with both orgs already) rather than further desk research.

---

## Synthesis: patterns relevant to Sefaria

### 1. "Identification" and "credential" are not the same thing — and that split solves Sefaria's client-secret problem

The single most load-bearing pattern across this survey: **Wikimedia (User-Agent), Crossref
(`mailto`), and Open Library (User-Agent + email)** all offer a tier of meaningfully-better access
in exchange for pure self-identification — a header or query param carrying a name/contact
string — with **no account, no secret, no cryptographic key at all**. Only a *further* step up
(Wikimedia personal token/OAuth, Crossref Plus token, Europeana project key, NASA personal key)
introduces an actual credential, and that credential gates a *higher* tier on top of the
identified-but-keyless one, not baseline access.

This maps directly onto the brief's hardest constraint: Sefaria's **web frontend** and **Linker
embeds** run in browsers/on third-party origins and structurally cannot hold a secret (per the
brief's own consumer table). A cryptographic API key requirement forces those two first-party
surfaces into either (a) an extractable, effectively-public "key" (defeats the purpose) or (b) no
identification at all. A **non-secret self-identification header** (a Sefaria-app-name +
version string, analogous to Wikimedia/Crossref/Open Library's convention) sidesteps this
entirely — it doesn't need to be secret to be useful, because its job is *attribution*, not
*authorization*. This suggests Sefaria's identification layer should have (at minimum) two
independent tracks: a **no-secret identification convention** (broad, cheap, works for
browser-based and third-party-origin callers) and a **real API key** (for server-side callers that
can hold secrets and want a trust/quota upgrade) — rather than one mechanism trying to do both
jobs.

### 2. The Crossref polite-pool model is closest to what the brief describes wanting

Crossref is the most direct precedent for "identification-first, anonymous coexists indefinitely,
quotas layered later": no signup ever required for free use; a `mailto` parameter or header lifts a
caller into a better-served pool immediately, with no approval step and no expiry; and a *separate*,
optional, paid tier is the only place an actual issued key exists. Its Dec-2025 rate-limit
change was communicated as being *in service of* universal free access ("keep all of the metadata
available to everyone, all of the time"), not a monetization step — a framing Sefaria will likely
want to borrow verbatim for its own communications, given the brief's donor/nonprofit-consumer
sensitivities.

### 3. Wikimedia's 2026 rollout is the most directly comparable "we have a scraper problem" precedent

Wikimedia's tiered numeric limits (10 → 200 → 2,000 req/min) were introduced specifically to
respond to an AI-scraper-driven traffic surge — the same phenomenon the brief's traffic inventory
identifies as Sefaria's fastest-growing external-traffic segment (the unidentified Supabase/Deno
backend at ~823k req/day is a close cousin of what Wikimedia is describing). Two things are worth
importing directly: (a) Wikimedia separated **policy publication** (2024, framed explicitly as
"not a new requirement," with a public comment period) from **enforcement rollout** (2026, over a
year later) — giving the ecosystem time to comply before anything actually throttled; (b) even the
*lowest* identified tier (just adding a UA string, no account) gets a 20x improvement over
bare-IP-no-UA traffic, meaning the "cost" of good-faith compliance is close to zero while the
"cost" of ignoring the ask compounds quickly — a strong nudge design that doesn't require anyone to
build an account.

### 4. Query param vs. header is a real tension against Sefaria's specific cache architecture — worth resolving explicitly, not by default

Every org in this survey that discussed the choice explicitly (Europeana's wskey→header migration;
NASA/DPLA still using query params) converged on **headers being the safer long-term choice** —
Europeana's stated reason is that URL-embedded keys leak via browser history, referrer headers, and
shared/bookmarked links. But the brief's Varnish layer caches ~15 `/api/*` GET patterns with
**cache key = URL only**, meaning a header-carried key/identifier is invisible to the cache (good
for not fragmenting it, bad for Django-level metering of cache hits) while a query-param key *would*
fragment the cache per key (bad for cache efficiency, but visible end-to-end). This is a genuine
architectural fork, not a style preference, and the surveyed orgs don't resolve it for Sefaria
because none of them run Sefaria's exact cache topology. Two ways the pattern from **api.data.gov**
specifically helps here: its shared-gateway model does key-checking and metering **at the gateway,
in front of the origin app**, explicitly so that "your API servers won't see traffic from users
exceeding their limits" and agencies don't have to change their own code. Sefaria's Envoy Gateway
sits *upstream of Varnish* in the request path (per the brief's stack diagram) — meaning
header-based identification/enforcement at Envoy (inline Lua / BackendTrafficPolicy) can see every
request, keyed or not, cached or not, without needing Varnish's cache key to change at all, and
without Django ever needing to see cache-hit traffic for *enforcement* purposes (only for
usage-analytics purposes, if Django-level logging is also wanted). This suggests the brief's framing
of "any always-enforced scheme needs edge involvement" is exactly right, and that edge involvement
should mean **Envoy**, not a Varnish cache-key change — which also avoids fragmenting the cache and
keeps headers (the safer format per Europeana's precedent) viable.

### 5. Manual/discretionary enforcement is a legitimate, precedented interim state — not a gap to apologize for

Open Library ("we rate limit and sometimes block entirely" based on direct outreach, run by a small
team on shared infra with the public website) and DPLA ("the DPLA reserves the right to limit or
revoke access... in its discretion," but does not do so by default) both explicitly choose
**identification without automated enforcement** as a stable, long-term (not transitional) design.
The entire value of the identifier, in DPLA's own stated model, is that it makes a human
conversation possible later — matching the brief's own phrasing of an "extended
communication/grace period" almost exactly. This is reassuring evidence that Sefaria doesn't need
throttling/quota infrastructure to exist before an identification requirement is worth shipping;
peer nonprofits treat that as a reasonable v1, not a stopgap.

### 6. Graduated, self-serve trust ladders avoid a manual-review bottleneck

Europeana's personal-key-first-then-project-key-eligibility structure, and Wikimedia's
personal-token-vs-OAuth-client split, both give a fully automatic, no-review base tier while
gating the higher-trust tier behind either prior usage history or a heavier registration flow
(OAuth app review). This matches the brief's ask for **self-serve issuance** while leaving room for
the "flexibility to support bigger customers" the brief also asks for — the bigger-customer tier
doesn't need to be designed now, just left as a plausible later gate on top of a self-serve base.

### 7. Bulk/heavy consumers can be redirected, not just rate-limited

Open Library's policy of pushing bulk consumers toward monthly data dumps instead of building
higher API tiers is a lever largely orthogonal to the key/identification question, but directly
relevant to the brief's long-tail "hobbyists (100k–500k req/mo)" segment — some of that volume may
be static/cacheable-at-the-source in a way an export or dump would serve better (and cheaper for
Sefaria) than any tier of live API key.

### 8. Header-name convergence: Sefaria's legacy `X-API-Key` header already matches the modern convention

Europeana's current (post-migration) transport is `X-Api-Key: <key>` as a header — the same header
name/shape as Sefaria's existing (if underused — "honored on exactly one endpoint" per the
current-state doc) `X-API-Key` mechanism. None of the surveyed orgs use a JWT-shaped token for
machine/app identification (JWT appears only for *logged-in user* auth, e.g. Sefaria's own
simplejwt usage) — the norm for app/consumer-level API keys across this entire survey is an opaque
bearer string or a named header, not a JWT. This suggests Sefaria's simplest standards-aligned path
is to harden and extend the header it already has, rather than introduce a new token shape.

## Comparison table

| Org | Key required (base tier)? | Self-serve signup? | Info collected | Anonymous tier? | Identification mechanism | Enforcement | Base-tier rate limit | Rollout communication |
|---|---|---|---|---|---|---|---|---|
| **Wikimedia** | No | Yes (personal token: 1 click from existing wiki account) | Existing Wikimedia account | Yes, but heavily rate-limited | UA string (no cred) → personal token → OAuth | Gateway, per-min, HTTP 429 + `Retry-After` | 10/min (no UA) or 200/min (UA or account) | Policy doc 2024 (feedback period) → enforcement rollout 2026, framed around bot-traffic surge |
| **Crossref** | No (Plus tier only) | N/A for polite pool (just a param); Plus is a paid subscription | Email address only (`mailto`) | Yes, always | `mailto` param or `agent` header | Soft throttle, 10s denial window | Public: 5 req/s single-record; Polite: 10 req/s | Public blog post + forum thread, quantified blast-radius ("~40 users/week") |
| **Open Library** | No | N/A (header convention, no account) | UA string + email in header | Yes, always | `User-Agent` + email | Manual, relationship-based; some automated bot throttling | 1 req/s unidentified, 3 req/s identified | GitHub issue-driven; org policy stated informally by maintainers |
| **Internet Archive (IA-S3)** | No for reads; yes for writes | Yes (any archive.org account) | Standard account signup | Yes, reads only | IA-S3 access/secret key pair (AWS-style) for writes | Proactive limit-check endpoint + 429 + reduced-priority opt-in | Not numerically published (reads unlimited; writes per-account) | Not researched in this pass |
| **Europeana** | Yes, always | Yes (personal key auto-issued; project key requires personal-key history) | Europeana account + ToS acceptance | No | `X-Api-Key` header (migrated from `wskey` query param) | Not enforced as scarcity — key is identity-only; "never...limitations" on read | Not numerically published; qualitative ("generous") | wskey→header migration had an overlap grace period |
| **NYT Developer Network** | Yes, always | Yes (developer portal account, per-app keys) | Account + per-app registration | No | API key, per-app | Hard numeric caps | ~5/min, ~500/day (secondary-sourced, **unverified**) | Not researched in this pass |
| **api.data.gov / NASA** | No (shared `DEMO_KEY`) for trial; yes for real use | Yes (name + email, instant) | Name + email | Yes, via shared public `DEMO_KEY` | Query-param key (`DEMO_KEY` or personal) | Gateway-level, key temporarily blocked on breach, auto-clears in 1hr | `DEMO_KEY`: 30/hr/IP, 50/day/IP; personal: 1,000/hr (all participating APIs combined) | Not researched in this pass |
| **Met Museum** | No, ever | N/A | None | Yes, only tier | None (no header ask even) | None (courtesy rate ask only, 80 req/s) | 80 req/s (unenforced guideline) | Framed publicly as a deliberate mission choice ("Scaling the Mission" post) |
| **DPLA** | Yes, always | Yes (single POST with email; key emailed back) | Email address only | No | API key (emailed), query param | Discretionary/manual only; "will not...rate-limit" by default | Unlimited by policy | Policy page states philosophy directly; no numeric-limit rollout needed |
| **Dicta / NLI** | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | **[unverified — no public developer-portal precedent surfaced]** |

*Sources for each row are cited inline in the corresponding section above; NYT and api.data.gov
rows include entries marked unverified where only secondary/search-indexed sources were available
in this research pass.*
