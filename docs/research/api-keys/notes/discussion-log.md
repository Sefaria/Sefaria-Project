# Working notes — API-key discussions (post-research, pre-ADR)

Raw running log of decisions and open threads from the sc-45692 discussions (2026-07-16 → 07-19).
NOT a deliverable doc — the eventual product doc / ADR gets compiled from these once details are
flushed out. Docs 00–11 are the research base; where these notes contradict a doc, the notes win
(they're newer).

## Decisions taken in discussion (Daniel, 07-16 → 07-19)

1. **Numeric rate limits, not warning-only.** We will define and publish actual numeric limits.
   Rationale: adoption requires limiting non-key usage; warnings alone don't move anyone.
2. **Cached traffic is basically free — don't gate it.** Varnish hits cost us ~nothing, so rate
   limits should target **origin-hitting traffic** (cache misses + writes + uncached endpoints),
   not cache hits. This dissolves most of the "Varnish can't do per-caller" problem: the traffic
   we want to limit is exactly the traffic Django/the origin already sees.
   - Open consequence (not yet decided): if limits only apply to origin-hitting traffic, plain
     Django + Redis counting becomes sufficient for enforcement — which competes with the
     "single system at Envoy" preference below. Needs one decision: count/enforce at Django
     (sees exactly the billable traffic, zero new infra) vs at Envoy (uniform layer, also covers
     the abuse tier, Flanksource offered to build it). Candidate resolution to explore: Envoy
     can't easily know hit-from-miss (it's in front of Varnish) — that fact may force the
     counting to Django or to Varnish-signaled logging. Flag for the architecture round.
3. **No two-pronged system — Envoy is the strategic layer** (ingress is migrating there anyway,
   per Lev/Brendan Slack 07-14). But see the tension in (2).
4. **Metering/analytics backbone unchanged:** Sefaria nginx pod logs → BigQuery (`nginx-production`,
   daily tables since 2020). Confirmed unaffected by the ingress migration (only the
   ingress-controller nginx is replaced; verified against the 07-09 inventory — Envoy-fronted
   traffic chains through the Sefaria nginx pod, 100% path match).
5. **Warn/notice at launch, enforcement later** (unchanged from earlier discussion), but the
   warning now advertises *numeric* limits (RateLimit-Policy style), not a vague notice.
6. **All consumer cohorts at once** (first-party + known third parties + long tail); first-party
   keyed at/before launch is the prerequisite for any anonymous-tier pressure.
7. **Primary analytics goal: per-project attribution** (ticket's "who uses our API for what");
   other uses (abuse, endpoint decisions) are secondary beneficiaries.
8. **Outreach ownership is an org matter** — out of the document's scope.
9. **Registration friction desired: logged-in account + confirmed email.** See SSO findings below.
10. **Hold off writing further polished docs** (incl. revisions to 11-anonymous-tier-options.md,
    whose warn-first framing is now partially superseded by (1)/(2)) until details are settled;
    keep everything in these notes meanwhile.

## SSO: scope findings (looked up 07-19)

- **Epic 22621 "Register & Sign In via Google & Apple (SSO)"** — in progress, objective
  "Understand our Users". It is *social login* (Google + Apple OIDC), not enterprise SSO.
  Email/password registration **remains** as a method alongside the providers.
- Status: sc-44751 (auth-flow QA coverage), sc-44749 (secure account linking), sc-44746 (React
  login/register integration) all **In QA**. Backlog: sc-45082 (Apple on web), sc-45182 (deploy
  web+apps simultaneously), sc-44779 (show SSO identity in settings).
- Code: branch `sso` (active; `sso-poc` was the React prototype). New Django app `sso/`
  (adapters/views/tests ~450 lines), React auth flow rebuilt (`static/js/auth/*`), Google One Tap.
- **Key fact for us: sc-44749 requires verified provider email claims before any mutation.** So
  SSO-registered/linked users have IdP-verified emails by construction.
- **Implication for key issuance:** "confirmed email" comes for free for SSO-linked accounts;
  only email/password accounts need a verification step. Cheapest coherent policy: at first key
  request, SSO-linked → already verified, proceed; password-only → send one confirmation email
  (verify-at-issuance). Sefaria signup itself still has no verification (`sefaria/forms.py:43`) —
  unchanged by the SSO epic, and out of our scope to change platform-wide.
- Coordination: epic owners Mickey, Yitzhak, Akiva. If key issuance piggybacks on SSO linkage,
  sequencing dependency is soft (verify-at-issuance works regardless; SSO just removes friction
  for a growing share of accounts).

## Distinct-users-per-project (open thread)

- Server-side integrations hide their user counts (all traffic from the project's backend IPs);
  client-side integrations (publishable key on end-user devices) leak distinct-IPs-per-key ≈ DAU
  proxy. Ticket explicitly wants users-per-project.
- Question raised (Daniel): can we *require* projects to report their user numbers? Precedent
  answer drafted: hard requirement is unenforceable + off-culture for a free open API; the seemly
  version is reporting as consideration for a **partner tier** (higher limits in exchange for
  lightweight usage reporting — Wikimedia Enterprise pattern), plus an optional "estimated users"
  registration field, plus the client-side IP proxy. To discuss.

## Parallel tracks to reconcile

- **Lev (CTO)** is working on API-key architecture from the abuse/miner angle ("analytic reasons,
  likely converge"). Slack 07-14: Lev asked nginx-vs-Envoy for gating; Brendan Galloway
  (Flanksource): main clusters almost fully on Envoy, offered to implement key gating there;
  Sefaria nginx pod stays. **Action: share this branch with Lev before the arch solidifies twice.**
- SSO epic (above) — touches the same accounts/registration surface as the portal.

## Update 2026-07-19: Lev's "API Key Program" doc lands — technical spine settled

Lev (CTO) wrote an architecture doc that decides the technical questions. Not copied verbatim here
(it's Lev's doc; this repo is public) — key decisions it fixes:

- **Purpose framing:** keys for identification, not security (identity / communication / usage
  understanding / abuse remediation).
- **Gate in front of Varnish**, implemented in Envoy from the get-go (nginx an interim option);
  key validation against a **map file in a k8s secret**, regenerated from the DB on update; rate
  limit class per key in the map file.
- **Transport:** header (`X-Sefaria-API-Key`); optional `?api_key=` accepted and normalized into
  the header at the gate.
- **Request-classification ladder:** (1) has key → per-key attribution/limits; (2) browser context
  (Sec-Fetch-Site / Origin / Referer) → untouched; (3) verified crawler UA → untouched; (4) our
  mobile apps by UA (Android needs explicit UA; next releases embed client-id key → rung 1);
  (5) everything else = unkeyed programmatic → phased notice → shared limit → per-endpoint 401.
- **Tiers:** browser/first-party/crawler untouched; keyed generous; partner lifted per agreement;
  unkeyed programmatic phased pressure.
- **Key model:** self-serve, verified email required, org/URL/use optional, instant issuance;
  keys in our DB; *possibly extend `db.apikeys`*.
- **MCP:** one keyed consumer (rung 1); per-user OAuth identity a separate project.
- **Phases:** 0 instrument (add Sec-Fetch-Site/Origin/Host/key-presence to nginx logs, validate
  ladder) → 1 soft launch T+1mo (portal, notice header, outreach, MCP keyed) → 2 pressure T+3mo
  (shared per-IP limit on rung 5) → 3 per-endpoint key requirement T+6mo (401 + registration URL,
  grandfather windows; start api/sheets, api/search-wrapper, api/calendars, api/words). Gated on
  measurements, not calendar. Comms plan per phase (Discord, dev site, dev email, 1:1).

**Consequence for remaining work:** our documents now focus on the PRODUCT surface — portal/signup
flow, dev-portal content updates, ToS/attribution, SSO-vs-confirmation choice, distinct-users
options. Architecture questions route to Lev's doc.

**Engineering flags to feed back on Lev's doc:**
1. Extending `db.apikeys` needs the cleanup attached: hash keys, close the `index_api` staff-check
   gap (reader/views.py:2013 privilege escalation), index the collection.
2. `?api_key=` normalization must STRIP the param from the URL pre-Varnish (else per-key cache
   fragmentation), not just copy it into the header.
3. Instant issuance ⇒ portal→DB→k8s-secret→gate-reload pipeline runs per registration; latency
   between "here's your key" and "gate knows it" needs an owner in the portal design.
4. "Phase out our nginx": ambiguity vs Brendan's Slack statement that the Sefaria nginx pod stays
   (only ingress nginx is replaced). Matters because that pod's logs ARE the BigQuery analytics
   backbone (tables since 2020). Recommend: coexistence through the key rollout; folding nginx
   into Envoy is a separate later project. Clarify with Lev/Brendan.
5. Cached-vs-uncached limits: gate can't see hit/miss (it's pre-Varnish). Practical substitute:
   per-path limit classes (cached families generous, origin-hitting paths real limits) in the same
   map-file design. Caveat: unique-URL sprays miss every time despite "cached family" limits —
   extension point is a coarse second limiter behind Varnish (Django+Redis sees exactly
   misses+writes) or the abuse tier. Noted as designed-in extension, not built now.

## Product-doc positions settled 07-19 (Daniel)

- **SSO & key issuance:** present product with two options — (a) require SSO (Google/Apple) to
  get a key (verified email for free via sc-44749's verified-claims requirement), or (b) build our
  own email-confirmation at key issuance. Product chooses.
- **Distinct users per project:** present options to product WITHOUT depth: (a) we record client
  IPs, so client-side integrations yield distinct-users-per-key automatically — make sure IP
  recording is stated; (b) optional self-reporting field/mechanism (expected to be declined);
  no bonus-credit/partner-tier incentive for reporting (explicitly rejected).
- Numeric-limit placement: decided by Lev's doc (gate/map-file) — no longer our open question.

## Update 2026-07-20: product-doc round 2 (Daniel feedback applied to 12-product-decisions.md)

- **Timing assumption: work happens after SSO ships** — Decision 1 reframed (SSO available at
  launch; A = require SSO zero-build, B = confirmation-at-issuance small build).
- **URL field: recommendation, not mandate** — softened wording.
- **Project model made explicit** (was research Decision 1): registration creates a *project*;
  one account ↔ many projects, each with own key(s) and limits. Engineering-side note (NOT in the
  product doc, not flagged to Lev per Daniel): Lev's "extend db.apikeys" is a one-key-per-user
  schema — the project model needs a schema change there.
- **New Decision 5: where the registration page lives** — sefaria.org account area vs
  developers.sefaria.org entry (ReadMe can't issue keys; its version hands off), or both.
- **Old Decision 5 (terms) slimmed to Decision 6**: ownership question dropped (policy team
  obviously owns text); only the attribution posture remains as the product call.
- **MCP keyless-today made explicit** in touchpoints (gets its key at soft launch per arch plan).
- **Linker reminder answered**: research recommended per-site keys but explicitly deferred to
  product (ask #5 in 10-decision-points); Lev's doc leaves Linker unkeyed at rung 2; no one has
  decided — hence it stays a decision item (middle-path rec).
- **PDF regenerated**: `.claude/scratch/api-keys/Sefaria-API-Keys-Product-Decisions.pdf`
  (source `product-decisions.html` alongside; render via headless Chrome — weasyprint shim broken
  in senv). **Next: Daniel reviews the PDF and gives feedback.**

## Pending explanation threads (Daniel wants step-by-step)

- Caching/Varnish/Envoy architecture walkthrough — basics (Part 1) and cache-key mechanics
  (Part 2) delivered 07-19. Part 3 pending: key's full journey (portal → Mongo → k8s secret →
  gate map-file → enforcement → nginx log → BigQuery attribution) = the portal's integration
  points list.
