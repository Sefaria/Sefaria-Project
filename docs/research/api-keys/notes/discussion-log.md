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

## Pending explanation threads (Daniel wants step-by-step)

- Caching/Varnish/Envoy architecture walkthrough — started 07-19, basics first, incremental.
