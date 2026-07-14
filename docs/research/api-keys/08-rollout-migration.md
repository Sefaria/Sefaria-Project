# Rollout & Migration — How Orgs Moved an Open API to Keyed Without Breaking Their Ecosystem

> Part of the sc-45692 API-key research (see [00-brief.md](./00-brief.md)). Sefaria's read API is
> effectively anonymous today; the mandate is to identify consumers via keys while keeping anonymous
> requests working during an **extended** communication/grace period, given ~15% genuinely-external
> traffic, a long tail of hobbyists/nonprofits, and one large unidentifiable scraper we cannot email.
> This doc is the rollout/migration-mechanics companion to
> [02-survey-open-content-apis.md](./02-survey-open-content-apis.md) and
> [03-survey-commercial-platforms.md](./03-survey-commercial-platforms.md), which already cover
> Wikimedia's and Crossref's *tier and rate-limit* mechanics in detail — this doc instead focuses on
> **timelines, staged communication, backlash, and deprecation machinery**: how each org sequenced
> the change, what notice they gave, what broke, and what a nonprofit with a goodwill-dependent
> hobbyist ecosystem should learn from each. Written July 2026; URLs inline per section.

## Executive summary

The case studies split cleanly into two families. **Hard-cutover, commercially-driven migrations**
(Google Maps 2018, Twitter/X 2023, Reddit 2023) gave weeks not months of notice, offered little or
no grandfathering, and predictably destroyed developer goodwill — in Twitter's and Reddit's cases,
killing thousands of third-party integrations outright, and in all three cases the backlash did not
change the outcome (the companies could absorb the reputational cost because keeping free access
was never the goal). **Gentle, mission-aligned migrations** (Wikimedia, Crossref, and the slower
creep at Flickr/Discogs) never fully remove anonymous access; they throttle it, incentivize
self-identification with a carrot (better rate limit, priority pool), and give the runway in months
or years rather than weeks. Sefaria's situation — nonprofit, mission is open access, cannot afford a
"Torah paywall" narrative, and cannot even email its single largest external consumer — maps almost
entirely onto the second family. The one piece no precedent fully solves is **reaching a consumer
you cannot identify well enough to contact**; no org in this survey solved that with communication —
they solved it with technical throttling applied uniformly to the anonymous tier, plus a low-cost
"maybe they'll notice" signal (docs link in a 429 body, Sunset/Deprecation headers) that never
depends on the recipient reading anything. Section 9 turns this into three candidate playbooks for
Sefaria.

## 1. Google Maps Platform — 2018 keying + billing migration

**Timeline.** Announced May 3, 2018; enforced June 11, 2018 — roughly **five weeks** of notice.
Google consolidated 18 separate Maps APIs into three billing groups (Maps, Routes, Places), made API
keys mandatory (keyless access stopped working entirely), and required every project — including
ones just embedding a map on a contact page — to attach a billing account with a credit card, with
$200/month of free usage before charges kicked in. List prices rose by as much as **1,400%** for
some call types, and the free allowance shrank from an unmetered/generous daily-load model to a
metered ~28,000-load/month-equivalent credit.
[Chaos for Retailers/Websites due to Google Maps API Billing Changes](https://www.linkedin.com/pulse/chaos-retailerswebsites-due-google-maps-api-billing-changes-baker),
[Insane, shocking, outrageous: Developers react to changes in Google Maps API](https://geoawesome.com/developers-up-in-arms-over-google-maps-api-insane-price-hike/),
[Google Maps Platform New Pricing Policy](https://agilestorelocator.com/blog/google-maps-platform-new-pricing-policy/)

**Grandfathering.** Effectively none for the pricing/billing requirement — every project, regardless
of age or size, had to add a credit card or lose access. The one carve-out was narrow and platform-
specific: Google exempted **Mobile Native Static/Dynamic Maps on Android** from the new charges,
protecting its own OS ecosystem rather than the developer base broadly.
[FAQ for the new Google Maps API changes](https://www.wpgmaps.com/faq-for-the-new-google-maps-api-changes/)

**Backlash.** Severe and immediate. Developers reported cost multiples as high as 20x (one Reddit
user: "$10,000 → $200,000/year"); Twitter reaction included accusations that Google was "harvesting
credit card details before GDPR" (GDPR enforcement began three weeks later, May 25, 2018) and public
pledges to migrate to OpenStreetMap/Mapbox.
[Action Required — Google Maps Community thread](https://support.google.com/maps/thread/360225263/action-required-secure-unrestricted-api-keys-immediately-to-avoid-extra-billing-charges?hl=en)

**Outcome.** Google did not roll back or extend grace. The backlash was absorbed as a cost of
business — Google's incentive was revenue extraction and it had enough market lock-in (no serious
substitute for Street View/Places-grade data) that developer anger didn't threaten the business.
**Why this is the negative precedent for Sefaria**: it's the playbook for "we don't need your
goodwill." Sefaria explicitly does — hobbyists and nonprofits are core to its mission — so short
notice + zero grandfathering + payment-card gating is the pattern to avoid, not emulate.

## 2. Wikimedia API Portal — 2020-2026 gateway rollout (anonymous preserved)

Wikimedia is the closest real-world analog to Sefaria: nonprofit, mission-bound to open access,
enormous anonymous long tail, and a slow multi-year migration rather than a cutover. Doc
[02](./02-survey-open-content-apis.md) covers the resulting tier/rate-limit numbers in detail; this
section covers how the *rollout itself* was staged.

**The two parallel tracks.** Wikimedia has been running two related but distinct efforts:
1. A **new API Gateway** (`api.wikimedia.org`, built 2020-2021) sitting in front of the legacy
   Action API, offering Bearer-token personal API tokens and OAuth — additive, not a replacement;
   the old anonymous-friendly Action API kept working unchanged.
   [API Gateway — Wikitech](https://wikitech.wikimedia.org/wiki/API_Gateway)
2. A **global rate-limit tightening** (rolled out starting ~March 2026) applying materially lower
   limits to anonymous/non-browser-like traffic, motivated by a post-2024 surge in AI-scraper load.
   [New global API rate limits — wikitech-l](https://lists.wikimedia.org/hyperkitty/list/wikitech-l@lists.wikimedia.org/thread/GBFZTN3A233IR6F4HEENCIUCVI2ZH6YB/)

**Formal policy update, staged like a mini-RFC.** The Foundation published API Policy Version 1.0 on
**August 26, 2024**, framed explicitly as *codifying existing practice, not introducing new rules*
("This is not a change in the requirements to use the API. This is a statement of existing practices
in greater detail") — a deliberate softening move to avoid the policy itself reading as an
enforcement announcement. A **formal feedback window ran August 28–September 13, 2024** on the
policy's talk page, with an explicit escalation path (`legal@wikimedia.org`) for edge cases and
exceptions. [API Policy Update 2024 — Meta-Wiki](https://meta.wikimedia.org/wiki/API_Policy_Update_2024),
[Policy: WMF API Usage Guidelines](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines)

**Community RFC mechanics.** Infrastructure changes (like the 2026 global rate limits) are announced
on the `wikitech-l` mailing list and cross-posted to affiliated lists (`cloud@`, `wiki-research-l@`),
where technical users ask clarifying questions in-thread (e.g., ambiguity over OAuth1 token support
under the new limiter) that WMF engineers answer directly — a lightweight, low-ceremony RFC process
compared to a formal IETF-style draft, but still public, timestamped, and archived.
[Wikitech-l thread](https://www.mail-archive.com/wikitech-l@lists.wikimedia.org/msg97202.html)

**User-Agent policy as a pre-key identification layer.** Independent of any token system, Wikimedia
has required a meaningful, contact-bearing User-Agent string since 2010 — this is a *free*,
frictionless identification channel that predates and doesn't require registration, and it is one of
the two axes (the other being IP) the anonymous rate limiter keys on.
[API:Etiquette](https://www.mediawiki.org/wiki/API:Etiquette)

**Escape valves instead of one enforcement path.** Rather than a single "get a key or get
throttled" binary, Wikimedia offers three off-ramps of increasing formality: a free **bot flag** for
identified automated accounts, free infrastructure access via **Toolforge/WMCS** (Wikimedia's own
hosted compute, which is inherently identified), or a **paid Wikimedia Enterprise API** for
commercial-grade reusers. This gives every consumer class — hobbyist script, nonprofit tool, and
commercial scraper — a legitimate identified path that fits its actual relationship to Wikimedia,
rather than forcing everyone through the same self-serve developer-portal flow.

**Even the *portal itself* gets a multi-year deprecation runway.** Wikimedia's own formal
deprecation policy (used when retiring the old `api.wikimedia.org` REST gateway in favor of newer
infrastructure) budgets **January–May 2026 for content migration and user outreach**, then
**July 2026–June 2027** — a full year — for "gradual deprecation... that will include a period of
several months before the endpoints stop working," announced via a dedicated
`mediawiki-api-announce` mailing list, a changelog page, and talk-page notices.
[API Portal/Deprecation — Wikitech](https://wikitech.wikimedia.org/wiki/API_Portal/Deprecation)

**Net effect.** After 15+ years, anonymous access has never been switched off. The lever pulled is
always rate limit, never a hard identity gate, and identification is *rewarded* (a bare User-Agent
alone is worth a large rate-limit multiplier per doc 02) rather than *required*. No developer
backlash of the Google Maps/Twitter/Reddit kind is documented for any stage of this — the multi-year
horizon and the "clarification, not new rule" framing appear to have kept it uncontroversial.

## 3. Crossref — polite pool / public pool (incentive-only, no enforcement)

Crossref (DOI-metadata registry for scholarly publishing, also a nonprofit) runs the purest
incentive-only model in this survey, predating Wikimedia's move by nearly a decade.

**Mechanics.** Since **September 18, 2017**, any HTTPS request that includes a `mailto` parameter
(or a `mailto:` in its User-Agent) gets routed to a "polite pool" of servers with better performance
and higher limits; everyone else lands in the "public pool." There is **no registration, no key, no
verification that the email is real** — it's an honor-system identification layer whose only
enforcement is a rate limit, and the stated purpose of collecting the address isn't gatekeeping, it's
being able to reach someone if their traffic looks abusive.
[Access and authentication — Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/),
[REST API pools: which to use and when — Crossref community](https://community.crossref.org/t/rest-api-pools-which-to-use-and-when/15317)

**First rate-limit revision since API launch, eight years later.** Crossref announced (implementation
beginning **December 1, 2025**) its first change to rate limits since the REST API's 2013 launch,
driven by 3x traffic growth over five years and 50% growth in the underlying metadata corpus
(120M → 180M records). New limits: public pool 5 req/s (1 concurrent) for single-record lookups and
1 req/s for list queries; polite pool 10 req/s (3 concurrent) and 3 req/s respectively — roughly a 2x
differential, not a hard wall. Crossref's own estimate was that only **~40 weekly users** would be
materially affected, and the announcement frames it as protecting stability, not extracting revenue
or forcing registration. [Announcing changes to REST API rate limits — Crossref](https://www.crossref.org/blog/announcing-changes-to-rest-api-rate-limits/)

**Why this is the cleanest low-friction precedent for Sefaria's hobbyist tail.** No account, no
dashboard, no key-rotation UX, no CORS/browser-exposure problem (a `mailto` param or header carries
no secret) — just a documented convention that rewards honesty with a better experience. It solves
identification-of-the-willing perfectly and solves nothing about the unwilling or the unreachable —
which is exactly Sefaria's split between the long tail (willing, if asked nicely) and the
unidentified Supabase/Deno scraper (unwilling or genuinely can't be reached).

## 4. Twitter/X 2023 and Reddit 2023 — cautionary tales

### 4.1 Twitter/X

**Timeline.** Announced **February 2, 2023** that free API access would end in seven days (by
Feb 9) — among the shortest notice windows in this survey. The Feb 9 deadline slipped ("a few more
days," announced Feb 13), and pricing/tier *details* weren't published until **March 29, 2023** — a
45+ day gap during which developers knew free access was ending but not what would replace it.
Launched tiers: **Free** (1,500 posts/month, write-mostly, no meaningful read access — useless for
the read-heavy third-party-client use case), **Basic** (~$100/month), and **Enterprise** (custom,
reported into five figures/month). [Twitter announces new API with only free, basic and enterprise levels — TechCrunch](https://techcrunch.com/2023/03/29/twitter-announces-new-api-with-only-free-basic-and-enterprise-levels/),
[Twitter Ends Its Free API — Forbes](https://www.forbes.com/sites/jenaebarnes/2023/02/03/twitter-ends-its-free-api-heres-who-will-be-affected/)

**No grandfathering, no migration window that mattered.** Established, long-running third-party apps
— **Tweetbot and Twitterrific**, each roughly a decade old with millions of cumulative users — were
killed by API-access suspension in January 2023, *before* the official pricing even existed, because
Twitter had already begun blocking third-party clients outright. Xbox, PlayStation, and Nintendo
progressively dropped native Twitter-sharing integrations through 2023-2024 as the economics stopped
making sense.

**Outcome / durability of the decision.** The company kept revising its own model for years
afterward — by **February 2026**, X had replaced the flat-tier model with pay-per-use/credit-based
pricing as the new default, demoting Basic/Pro to legacy-only for existing subscribers. Three years
of continued churn on the pricing model is itself evidence the original abrupt rollout never found a
stable equilibrium — it optimized for an immediate revenue signal, not developer retention, and the
company is still correcting course. [X Tests Pay-Per-Use API Model to Win Back Developers](https://www.techbuzz.ai/articles/x-tests-pay-per-use-api-model-to-win-back-developers)

### 4.2 Reddit

**Timeline.** Announced **April 18, 2023**; effective **July 1, 2023** — about ten weeks of notice,
longer than Twitter's but still short relative to Wikimedia/Crossref timescales. Pricing: $0.24 per
1,000 API requests. [Reddit API controversy — Wikipedia](https://en.wikipedia.org/wiki/Reddit_API_controversy)

**Third-party death toll was disclosed in advance, not discovered after the fact.** On **May 31**,
Apollo's developer Christian Selig published that Reddit's pricing would cost his app **~$20M/year**
at current usage, making continued operation impossible — Reddit knew the economics were
unsurvivable for major clients well before the deadline and did not adjust. Sync, Pager, ReddPlanet,
and RIF all announced shutdowns on the same trajectory.
[Reddit in Mass Revolt Over Astronomical API Fees — Vice](https://www.vice.com/en/article/reddit-api-apollo-app-controversy-explained/)

**The blackout.** On **June 12, 2023**, over 7,000 (peaking past 9,000) subreddits — representing a
combined 2.7 billion subscribers, including nearly every top-100 community — went private or
restricted in protest, planned as 48 hours but extended indefinitely by many moderators. This is the
largest coordinated developer/user protest in the survey by a wide margin.
[Over 7K Reddit communities go dark — Marketing Dive](https://www.marketingdive.com/news/reddit-subreddits-go-dark-in-protest-over-api-pricing-increase/652798/),
[NPR coverage](https://www.npr.org/2023/06/12/1181376050/reddit-communities-go-dark-protest-new-developer-fees)

**Outcome — the protest changed nothing.** Pricing took effect exactly as announced on **July 1,
2023**; Apollo, Sync, Pager, and ReddPlanet shut down as scheduled on June 30. CEO Steve Huffman's
dismissive public comments about the protest deepened the backlash without altering the company's
position. [These Popular Third-Party Reddit Apps Will Disappear Saturday — Forbes](https://www.forbes.com/sites/antoniopequenoiv/2023/06/30/these-popular-third-party-reddit-apps-will-disappear-saturday-as-api-changes-take-effect-despite-weeks-of-user-protest/)

**Why Twitter/Reddit are cautionary rather than instructive for mechanics.** Both show that even the
most visible possible backlash (mass service blackout covering billions of subscribers, in Reddit's
case) does not move an organization whose actual goal is monetization/control rather than developer
retention. The lesson for Sefaria isn't "don't anger developers" in the abstract — it's that **the
outcome of a rollout is determined by what the organization is actually optimizing for**. Sefaria is
optimizing for *identification* and *continued goodwill*, not revenue extraction or route-everyone-
through-our-own-client control, so a Twitter/Reddit-style abrupt, ungrandfathered cutover would
combine those companies' backlash with none of their compensating business rationale — worst of both.

## 5. Other mid-size / slower migrations

These are less dramatic than Maps/Twitter/Reddit but show a different shape: **gradual tightening
over years rather than a single cutover date**, usually keeping old keys/behavior grandfathered.

**Flickr — a decade of incremental tightening, old keys untouched.** Flickr's API key model started
open (free key on request, minimal friction) and tightened in discrete, narrow steps rather than one
migration: **May 6, 2014** — new keys issued from that date on were restricted to HTTPS-only calls
(existing keys kept working over HTTP); more recently, **new API key issuance was restricted to Pro
(paying) subscribers**, while keys issued to free accounts before that change continued working.
Each step gated *new* issuance, never retroactively broke *existing* keys — the grandfathering-by-
default pattern. [Flickr Services — API keys](https://www.flickr.com/services/api/misc.api_keys.html),
[Flickr API – Flickr Help Center](https://www.flickrhelp.com/hc/en-us/articles/4404070036884-Flickr-API)

**Discogs — partial gating by endpoint sensitivity, not a global switch.** Basic search/browse
endpoints remain callable without any authentication; a user token (simple, non-OAuth) is required
only once a caller touches personal-data or write endpoints. This is the same shape as Sefaria's own
blast-radius ranking — gate the sensitive/expensive slice first (or only), leave low-risk read
endpoints open indefinitely.
[Discogs API Documentation](https://www.discogs.com/developers),
[python3-discogs-client — Authentication](https://python3-discogs-client.readthedocs.io/en/latest/authentication.html)

**OpenWeatherMap — creeping from free-key to credit-card-required.** OWM has long required a free,
self-serve API key (never had a truly anonymous tier), but the **One Call API 2.5 → 3.0** migration
(2.5 access closed **June 2024**) forced existing integrations onto 3.0, which requires a credit card
on file even to use its free 1,000-calls/day tier. This mirrors Google Maps' free-key-to-required-
billing creep, just executed slower and against a smaller, more price-tolerant developer base.
[Migration Guide from AccuWeather to OpenWeather](https://openweathermap.org/api/accuweather-openweather-migration),
[How to transfer from One Call API 2.5 to 3.0](https://openweathermap.org/api/one-call-transfer)

**NYT — "born keyed," not a migration at all.** The NYT Developer Network has always required a free
self-serve key with modest limits (10 calls/min, 4,000/day); there was never an anonymous tier to
migrate away from, so it's a useful data point on steady-state self-serve key UX (see doc 02/03) but
not a rollout case study.

## 6. Deprecation machinery — the staged-communication toolkit

Independent of which specific companies were consulted, the deprecation/API-management literature
(Zuplo, Nordic APIs, Moesif, OneUptime, Zalando's public REST API guidelines) converges on the same
staged sequence, and GitHub is the clearest real-world implementation of the harder end of it.

### 6.1 Staged comms sequence

The consistently-recommended order — and the one GitHub, Wikimedia, and the generic deprecation
guides all implement in some form — is: **blog post/changelog entry → docs banner on the affected
endpoint's reference page → passive response headers (Deprecation/Sunset) added to every response,
readable even by clients that never check docs → direct email to registered/identified developers →
"warn mode" (still works, but logs/flags/degrades gracefully) → scheduled brownouts (temporary,
escalating-duration outages that force integrators' own alerting to fire) → hard enforcement.**
Each stage is a strictly cheaper filter than the next: headers cost nothing and reach every client
automatically; email only reaches identified developers; brownouts are the last resort for
*surfacing* consumers who ignored every passive signal, deployed before the irreversible cutover
rather than as the cutover itself.
[How to Sunset an API — Zuplo](https://zuplo.com/learning-center/how-to-sunset-an-api),
[How to Smartly Sunset and Deprecate APIs — Nordic APIs](https://nordicapis.com/how-to-smartly-sunset-and-deprecate-apis/),
[Zalando REST API Guidelines — deprecation chapter](https://github.com/zalando/restful-api-guidelines/blob/main/chapters/deprecation.adoc)

### 6.2 RFC 8594 Sunset header and the Deprecation header

**RFC 8594** (IETF, 2019) defines the `Sunset` HTTP response header: a single timestamp announcing
when a resource is expected to stop responding, plus an optional `sunset` link relation pointing to
a human-readable page with migration details. It's intentionally passive and machine-readable —
tooling can scan for it without a human reading anything, which matters for reaching consumers who
never open documentation. [RFC 8594 — The Sunset HTTP Header Field](https://datatracker.ietf.org/doc/html/rfc8594)

The companion **`Deprecation` header** (`draft-ietf-httpapi-deprecation-header`, IETF httpapi working
group, at draft revision 09 as of this research — not yet a numbered RFC but already implemented by
several API gateways and referenced in Zalando's public guidelines) marks the *start* of a
deprecation window; `Sunset` marks the *end*. Used together, the gap between the two headers is
exactly the migration window communicated to every caller, authenticated or not, on every single
response. [The Deprecation HTTP Header Field](https://greenbytes.de/tech/webdav/draft-ietf-httpapi-deprecation-header-latest.html),
[draft-ietf-httpapi-deprecation-header-09](https://datatracker.ietf.org/doc/draft-ietf-httpapi-deprecation-header/09/)

Directly relevant to Sefaria: **these headers are the one mechanism in this whole survey that reaches
even a fully anonymous, uncontactable caller** — no email, no docs page visit, no registration
required for the signal to be technically present in every response.

### 6.3 Brownout tests

Documented in detail via GitHub's own changelog for its 2020-2021 removal of query-parameter API
authentication. GitHub **deprecated** the feature in **February 2020**, then ran three **scheduled,
escalating-duration brownouts** — temporary, announced outages of the deprecated auth method — before
the permanent cutover: **May 5, 2021** (first brownout), **June 9, 2021** (second), and **August 11,
2021, for 48 hours** (third and final) — after which query-parameter auth was permanently disabled.
Each brownout is explicitly designed to trip the *integrator's own* monitoring/alerting, surfacing
consumers who never read the deprecation notice or the passive headers, while the outage is still
short and reversible enough not to cause lasting damage. Best-practice guidance recommends scheduling
brownouts "during normal business hours" — when a human is likely to notice and can react, but end-
user impact stays contained. [Sunsetting API Authentication via Query Parameters — GitHub Changelog](https://github.blog/changelog/2021-04-19-sunsetting-api-authentication-via-query-parameters-and-the-oauth-applications-api/),
[Brownout Notice (May 2021, 12h)](https://github.blog/changelog/2021-05-04-brownout-notice-api-authentication-via-query-parameters-and-the-oauth-applications-api-for-12-hours/),
[Brownout Notice (June 2021, 24h)](https://github.blog/changelog/2021-06-08-brownout-notice-api-authentication-via-query-parameters-and-the-oauth-applications-api-for-24-hours/),
[Brownout Notice (Aug 2021, 48h)](https://github.blog/changelog/2021-08-10-brownout-notice-api-authentication-via-query-parameters-for-48-hours/)

This translates directly to Sefaria's blast-radius ranking: run the *first* brownout on the
lowest-external-dependency endpoint (`api/strapi` or `api/background-data`, per the brief's ranking)
as a low-risk rehearsal, both to shake out any hidden dependents nobody knew about and to validate
that the Varnish/Envoy layer actually enforces the brownout (given the brief's cache-key caveat — a
brownout on a cached GET pattern needs a VCL `pass` or edge-level block, or Varnish will keep serving
stale 200s straight through it).

### 6.4 Grandfathering patterns

The survey shows a real spectrum:

| Org | Grandfathering |
|---|---|
| Google Maps (2018) | None — every existing project required to add billing |
| Flickr | Full — old keys keep working forever; only *new* issuance gets restricted |
| OpenWeatherMap (2.5→3.0) | None — hard migration deadline, old version closed outright |
| Discogs | N/A — gating is by endpoint sensitivity, not by key age |
| Wikimedia | De facto full — anonymous access has never been switched off in 15+ years, only throttled |
| Crossref | N/A — no keys to grandfather; pool assignment is per-request based on the `mailto` signal |

The pattern that avoided backlash (Wikimedia, Flickr, Crossref) always let *something that already
worked keep working*, even if worse. The pattern that caused backlash (Maps, OpenWeatherMap 2.5)
had a hard date after which the old behavior simply stopped.

## 7. Reaching unidentified/anonymous consumers

This is the one problem no case study fully solves — nobody in this survey had to deal with a
consumer that is both (a) large enough to matter and (b) genuinely uncontactable (no email, rotating
IPs, no stable User-Agent), which is Sefaria's ~823k req/day Supabase/Deno scraper. What the survey
does offer are partial techniques, roughly in decreasing order of how much they depend on the
recipient's cooperation:

- **Self-identification incentive (Crossref's `mailto`).** Cheapest possible ask — a header or query
  param, no verification — paired with a real benefit (better pool). Solves the problem *only* for
  consumers willing to identify themselves; does nothing for a deliberately opaque scraper. Still
  worth doing first, since it's near-zero cost and will likely convert most of the honest long tail
  (hobbyists, nonprofits) without any enforcement at all.
- **Passive, response-level signals that don't require the recipient to look anywhere** — the
  `Sunset`/`Deprecation` headers (§6.2) and, as a same-shape technique for enforcement rather than
  pure deprecation, a `Link` header pointing at the registration docs attached to every `429`
  response body. These reach automated clients that log or surface response metadata even if no
  human ever reads a changelog. This is standard, low-cost practice recommended across the
  deprecation-tooling literature (Zuplo, OneUptime) even though it isn't documented as an
  "anonymous-scraper outreach" technique per se — it's a generic deprecation-signal best practice
  that happens to be the only one in this survey that doesn't require an email address.
- **Uniform throttling of the anonymous tier as the actual mechanism, not communication as the
  mechanism.** This is what Wikimedia actually does for its unidentifiable ~33% of traffic: it does
  not try to reach them, it rate-limits the *bucket* they fall into (no compliant User-Agent, no
  token, off-Toolforge). The throttle itself is the message. For Sefaria's unidentified scraper, this
  is the realistic fallback — accept it will likely never register, and decide in advance whether the
  policy is "tolerate it at a capped rate" or "block by IP/ASN/UA fingerprint once it exceeds that
  rate," as a track separate from the keying rollout rather than blocked on it.
- **Per-endpoint staged enforcement starting from the lowest external-blast-radius endpoint**
  (§6.3's brownout logic generalized) is itself a technique for *discovering* who's out there before
  committing — a brownout or soft-enforcement window on `api/strapi`/`api/background-data`/
  `api/profile` will surface any anonymous consumers hitting those specific endpoints without
  risking the high-external-dependency ones (`api/calendars` 0.97, `api/sheets` 0.81) where breaking
  something anonymous is most likely to be visible and costly.
- **What nobody in this survey does, and Sefaria should not expect to invent from precedent**:
  actively fingerprinting/watermarking responses to de-anonymize a specific scraper. This shows up in
  adjacent domains (bot-management vendors like Cloudflare/Akamai use response-side honeypot markers
  for abuse detection) but was not found as a documented practice for *this* problem — API-provider-
  side outreach to a scraper it wants to legitimately onboard, not block. Treat it as a speculative,
  unvalidated option rather than an industry pattern.

## 8. Comparison table — timelines, grace periods, backlash, outcome

| Org | Notice given | Grandfathered? | Backlash | Outcome |
|---|---|---|---|---|
| Google Maps (2018) | ~5 weeks | No | Severe (developer forums, press) | Held; no rollback |
| Twitter/X (2023) | 7 days → tiers detailed 45+ days later | No | Severe; killed decade-old apps | Held for ~3 years, then re-architected pricing again (2026) |
| Reddit (2023) | ~10 weeks | No | Largest protest in survey (7-9k subreddits, 2.7B combined subscribers) | Held exactly as announced |
| Wikimedia (2020-2026) | Months-to-years per stage; policy update had a 2.5-week formal feedback window | De facto full (anonymous never removed) | None documented | Ongoing, low-friction |
| Crossref (2017; revised 2025) | Blog-announced; 2025 change had ~2-month lead to Dec 2025 effective date | N/A (no keys) | None documented | Stable since 2017 |
| Flickr | Incremental over a decade | Full (old keys keep working) | None documented | Stable |
| OpenWeatherMap (2.5→3.0) | Deadline-driven (closed June 2024) | None for 2.5 | Minor (openHAB/community threads) | Held |
| Discogs | N/A (endpoint-scoped, not time-scoped) | N/A | None documented | Stable |
| GitHub (query-param auth, 2020-2021) | ~1 year (Feb 2020 deprecated → Aug 2021 final) with 3 brownouts | N/A (auth method removed) | Minor (expected, well-telegraphed) | Held; clean removal |

## 9. Candidate rollout playbooks for Sefaria

### 9.1 Playbook A — phased by endpoint blast-radius

Sequence enforcement by the brief's existing blast-radius ranking: start with `api/strapi`,
`api/background-data`, `api/profile` (lowest genuinely-external dependency). For each endpoint tier:
add `Deprecation`/`Sunset` headers and a docs banner with no behavior change; run a GitHub-style
brownout (short, announced, escalating) to surface hidden anonymous dependents; move to warn-mode
(anonymous still works, logs a warning / returns an extra header); only then require a key, with
anonymous access continuing at a throttled rate rather than a hard 401/403 (Wikimedia model, not
Google Maps). Once a tier is clean, move to the next; save `api/calendars` (0.97 external
dependency) and `api/sheets` (0.81) for last, with the longest grace windows, since breaking them is
most visible and most likely to generate the kind of press Google Maps got.

**Risks.** Doesn't target the big unidentified scraper unless it happens to concentrate on early
tiers (unlikely, since scrapers usually hit read-heavy text/search endpoints, which are in the
*high*-blast-radius group). Per-endpoint enforcement state adds real complexity given the brief's
Varnish URL-only-cache-key constraint — each gated endpoint needs either a VCL `pass` or edge-level
(Envoy) enforcement, since Django-level checks alone won't see cache-hit traffic. Slower to reach
full coverage since the riskiest endpoints are deliberately last.

### 9.2 Playbook B — phased by consumer class

Sequence by *who*, not *what*: (1) first-party (web, mobile, MCP, Linker) — Sefaria controls this
code, so migrate to keys/JWT with a deploy, zero external communication needed, no blast radius since
nothing anonymous breaks. (2) Known third parties (Otzaria, Dicta, Hadran, OU Torah apps, the
Google Docs plugin) — direct outreach (email/GitHub issue/community post) with months of notice,
self-serve portal invite, and a Crossref-style incentive (better rate limit for showing up) rather
than a deadline threat. (3) Long-tail hobbyists — no individual outreach (can't scale to it); blog
post + docs banner + passive headers + an *extended*, possibly indefinite, throttled-but-working
anonymous tier, matching the brief's explicit requirement and Wikimedia's precedent. (4) Unidentified/
uncontactable (the scraper) — explicitly *not* a communications target; addressed purely by uniform
throttling of the anonymous bucket plus the passive header/429-docs-link signal, with a separate
policy decision (tolerate vs. block by IP/ASN/UA) made independently of the keying rollout's timeline.

**Risks.** Consumer-class identification is manual and imperfect (today's UA+referer-only visibility,
per the brief, makes it hard to even build the class-2 contact list confidently). Requires product/
support bandwidth Sefaria may not have budgeted. Slower than blast-radius phasing to get *any*
endpoint fully enforced, since it's gated on human outreach cycles for class 2.

### 9.3 Playbook C — incentive-only (Crossref-style polite pool), as a low-risk Phase 1 for either A or B

Do nothing punitive in year one: ship self-serve key issuance and give keyed callers a strictly
better experience (higher rate limit, priority handling, first access to any future tier/quota
features) while anonymous access continues completely unchanged. Announce via blog post/changelog
only — no deadline, no threat. This is the gentlest possible on-ramp and matches the brief's
"extended communication period" requirement almost exactly; it also directly tests self-serve portal
UX and key-format decisions (docs [04](./04-key-design-fundamentals.md)) against real traffic before
any enforcement risk is introduced.

**Risks.** Low identification yield on its own — Crossref's own data shows most of the ecosystem
doesn't bother opting in even after 8 years unless the incentive is compelling; the low-effort long
tail Sefaria most wants to identify is exactly the population least likely to self-select without a
push. Does nothing for the deliberately anonymous scraper. Best framed as **Phase 1 of A or B**, not
a complete strategy on its own — it buys goodwill and adoption data before any endpoint moves to
warn-mode or enforcement.

### 9.4 Risk comparison

| Playbook | Backlash risk | Identification yield | Time to meaningful coverage | Ops complexity |
|---|---|---|---|---|
| A — blast-radius phased | Low (grace period on each tier) | Medium (misses scraper unless it hits early tiers) | Slow (highest-value endpoints last, by design) | High (per-endpoint edge/Varnish state) |
| B — consumer-class phased | Low-Medium (depends on outreach quality) | High for known long tail, near-zero for the anonymous scraper regardless | Medium, gated on manual outreach cycles | Medium (mostly process, not infra) |
| C — incentive-only first | Near-zero | Low-Medium on its own | Fast to ship, slow to convert | Low |

None of the three, alone, solves identification of the unidentified scraper — every precedent in
this survey that reached that population did so through uniform throttling, not communication. The
realistic path is **C as Phase 1, then A and B run concurrently as Phase 2** (blast-radius ordering
governs *when* an endpoint gets enforcement; consumer-class outreach governs *who* gets contacted
before it does), with the scraper handled as a standing throttling/abuse-policy decision that is
explicitly decoupled from the keying rollout's communication timeline.

## Sources

- [Chaos for Retailers/Websites due to Google Maps API Billing Changes](https://www.linkedin.com/pulse/chaos-retailerswebsites-due-google-maps-api-billing-changes-baker)
- [Insane, shocking, outrageous: Developers react to changes in Google Maps API — Geoawesome](https://geoawesome.com/developers-up-in-arms-over-google-maps-api-insane-price-hike/)
- [Google Maps Platform New Pricing Policy — Agile Store Locator](https://agilestorelocator.com/blog/google-maps-platform-new-pricing-policy/)
- [Action Required — Google Maps Community thread](https://support.google.com/maps/thread/360225263/action-required-secure-unrestricted-api-keys-immediately-to-avoid-extra-billing-charges?hl=en)
- [FAQ for the new Google Maps API changes — WP Go Maps](https://www.wpgmaps.com/faq-for-the-new-google-maps-api-changes/)
- [API Gateway — Wikitech](https://wikitech.wikimedia.org/wiki/API_Gateway)
- [New global API rate limits — wikitech-l thread](https://lists.wikimedia.org/hyperkitty/list/wikitech-l@lists.wikimedia.org/thread/GBFZTN3A233IR6F4HEENCIUCVI2ZH6YB/)
- [Wikitech-l mail-archive copy](https://www.mail-archive.com/wikitech-l@lists.wikimedia.org/msg97202.html)
- [API Policy Update 2024 — Meta-Wiki](https://meta.wikimedia.org/wiki/API_Policy_Update_2024)
- [Policy: Wikimedia Foundation API Usage Guidelines](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines)
- [API:Etiquette — MediaWiki](https://www.mediawiki.org/wiki/API:Etiquette)
- [API Portal/Deprecation — Wikitech](https://wikitech.wikimedia.org/wiki/API_Portal/Deprecation)
- [Wikimedia APIs/Rate limits — MediaWiki](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits)
- [Access and authentication — Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/)
- [REST API pools: which to use and when — Crossref community](https://community.crossref.org/t/rest-api-pools-which-to-use-and-when/15317)
- [Announcing changes to REST API rate limits — Crossref](https://www.crossref.org/blog/announcing-changes-to-rest-api-rate-limits/)
- [Twitter announces new API with only free, basic and enterprise levels — TechCrunch](https://techcrunch.com/2023/03/29/twitter-announces-new-api-with-only-free-basic-and-enterprise-levels/)
- [Twitter Ends Its Free API: Here's Who Will Be Affected — Forbes](https://www.forbes.com/sites/jenaebarnes/2023/02/03/twitter-ends-its-free-api-heres-who-will-be-affected/)
- [X Tests Pay-Per-Use API Model to Win Back Developers](https://www.techbuzz.ai/articles/x-tests-pay-per-use-api-model-to-win-back-developers)
- [Reddit API controversy — Wikipedia](https://en.wikipedia.org/wiki/Reddit_API_controversy)
- [Reddit in Mass Revolt Over Astronomical API Fees — Vice](https://www.vice.com/en/article/reddit-api-apollo-app-controversy-explained/)
- [Over 7K Reddit communities go dark — Marketing Dive](https://www.marketingdive.com/news/reddit-subreddits-go-dark-in-protest-over-api-pricing-increase/652798/)
- [Thousands of Reddit communities 'go dark' — NPR](https://www.npr.org/2023/06/12/1181376050/reddit-communities-go-dark-protest-new-developer-fees)
- [These Popular Third-Party Reddit Apps Will Disappear Saturday — Forbes](https://www.forbes.com/sites/antoniopequenoiv/2023/06/30/these-popular-third-party-reddit-apps-will-disappear-saturday-as-api-changes-take-effect-despite-weeks-of-user-protest/)
- [Flickr Services — API keys](https://www.flickr.com/services/api/misc.api_keys.html)
- [Flickr API — Flickr Help Center](https://www.flickrhelp.com/hc/en-us/articles/4404070036884-Flickr-API)
- [Discogs API Documentation](https://www.discogs.com/developers)
- [python3-discogs-client — Authentication](https://python3-discogs-client.readthedocs.io/en/latest/authentication.html)
- [Migration Guide from AccuWeather API to OpenWeather API](https://openweathermap.org/api/accuweather-openweather-migration)
- [How to transfer from One Call API 2.5 to 3.0 — OpenWeatherMap](https://openweathermap.org/api/one-call-transfer)
- [RFC 8594 — The Sunset HTTP Header Field](https://datatracker.ietf.org/doc/html/rfc8594)
- [The Deprecation HTTP Header Field (editor's draft)](https://greenbytes.de/tech/webdav/draft-ietf-httpapi-deprecation-header-latest.html)
- [draft-ietf-httpapi-deprecation-header-09](https://datatracker.ietf.org/doc/draft-ietf-httpapi-deprecation-header/09/)
- [How to Sunset an API — Zuplo](https://zuplo.com/learning-center/how-to-sunset-an-api)
- [How to Smartly Sunset and Deprecate APIs — Nordic APIs](https://nordicapis.com/how-to-smartly-sunset-and-deprecate-apis/)
- [Zalando REST API Guidelines — deprecation chapter](https://github.com/zalando/restful-api-guidelines/blob/main/chapters/deprecation.adoc)
- [Sunsetting API Authentication via Query Parameters — GitHub Changelog](https://github.blog/changelog/2021-04-19-sunsetting-api-authentication-via-query-parameters-and-the-oauth-applications-api/)
- [Brownout Notice, May 2021 (12h) — GitHub Changelog](https://github.blog/changelog/2021-05-04-brownout-notice-api-authentication-via-query-parameters-and-the-oauth-applications-api-for-12-hours/)
- [Brownout Notice, June 2021 (24h) — GitHub Changelog](https://github.blog/changelog/2021-06-08-brownout-notice-api-authentication-via-query-parameters-and-the-oauth-applications-api-for-24-hours/)
- [Brownout Notice, August 2021 (48h) — GitHub Changelog](https://github.blog/changelog/2021-08-10-brownout-notice-api-authentication-via-query-parameters-for-48-hours/)
