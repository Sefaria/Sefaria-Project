# Self-Serve Developer Portal / Key Management UX

> Part of the sc-45692 API-key research (see [00-brief.md](./00-brief.md)). Focuses specifically on
> the *portal UX layer* — the screens, fields, and flows a developer walks through to register and
> manage API access — as distinct from key format/entropy (04), first-vs-third-party mechanics (05),
> rate limiting (06), and gateway/platform choice (07). Written July 2026; URLs inline per section.

## Executive summary

- **The single highest-leverage field for Sefaria's stated goal ("how many distinct projects consume
  our API?") is a project/app name + one-line description, captured once at key issuance.** Every
  portal surveyed that asks for this (NYT, Wikimedia OAuth, Europeana Project keys) can answer that
  question; the one that doesn't (api.data.gov, name+email only) explicitly can't — GSA/NASA have no
  better visibility into "what's being built" than Sefaria does today, just a mailing list.
- **Friction should scale with privilege, not be a flat gate.** Wikimedia's two-tier model (personal
  token: one click, no metadata, 5,000 req/hr vs OAuth consumer registration: full app form,
  admin-reviewed, higher/custom limits) and Europeana's Personal-vs-Project key split are the cleanest
  versions of this. Sefaria's minimal option below borrows this shape.
- **"App/project owns the key(s)," not "user owns a key."** Google Cloud, X/Twitter, Auth0, GitHub
  Apps, and Europeana Project keys all model an app or project as the credential-holding entity, with
  a user or org as its owner — this is what lets one developer run several distinct things (and lets
  Sefaria count projects instead of people), and it's what lets credentials outlive one person leaving.
- **Full-featured key management (Stripe, GitHub) converges on the same feature set**: named keys,
  display-once + copy, prefix-only display afterward, last-used timestamp, a scopes/permissions
  matrix, rotate-with-overlap-window, one-click revoke, an audit/security log, and leak-detection
  notifications. None of this is exotic — it's table stakes once a portal exists at all.
- **Platform *type* (web / native-mobile / server / script) is a first-order field**, not a footnote —
  Reddit and Auth0 both branch the whole registration flow on it, and critically, some types (mobile,
  installed apps, Reddit's "installed app") never get issued a client secret at all, because there's
  nowhere safe to keep one. This maps directly onto Sefaria's own client/server split for Linker and
  mobile apps.
- **Attribution/ToS acceptance works best as a one-time checkbox against a short, stable policy page,
  reinforced by data-level redundancy** (Europeana embeds the rights statement in every API response;
  Wikimedia enforces its User-Agent policy at the HTTP layer independent of any token) — so the
  requirement survives a key-holder who never read the fine print.
- **Internal/first-party credentials should not flow through the public self-serve portal at all.**
  Every mature platform separates them: GitHub Apps (org-owned, admin-installed) vs personal PATs;
  Stripe's internal infra vs customer-facing key types; Auth0 M2M apps provisioned by an org's own
  admins. Sefaria's web frontend, Linker, MCP server, mobile apps, and internal scripts belong in an
  admin-issued path, not a "sign up like everyone else" flow.
- **Build vs buy leans Django-native given Sefaria's constraints.** Gateway-attached dev portals
  (Kong, Tyk) presume adopting their gateway — a bigger infra commitment than the brief's
  infra-reduction mandate supports. Docs-first SaaS (ReadMe.io) explicitly doesn't issue/rotate keys.
  OSS building blocks (djangorestframework-api-key, django-oauth-toolkit's Application model, or a
  self-hosted Unkey) each remove some work but add either a dependency or a data-model mismatch;
  a hand-rolled Project/App + APIKey Django model, surfaced on the existing profile page, is the
  lowest-risk starting point.
- **Usage dashboards are cheap goodwill and self-policing.** The minimum viable version is just
  rate-limit response headers (api.data.gov's `X-RateLimit-*`); the fuller version exposes usage as
  an API in its own right (Twilio's Usage Records resource), so sophisticated consumers build their
  own monitoring off the same data the portal shows.
- Two concrete options are sketched in §9: a minimal, low-friction key-request flow that still
  captures project identity (answering the brief's core question), and a fuller app/key-management
  surface for later, once enforcement and tiers matter.

## 1. Minimal viable key UX: registration friction vs data quality

### 1.1 NASA / api.data.gov (name + email, no account)

api.data.gov is shared infrastructure operated by GSA that many federal agencies' APIs sit behind,
including NASA's `api.nasa.gov` and GovInfo — one shared key works across all of them
([docs](https://api.data.gov/docs/developer-manual/), [agency manual](https://api.data.gov/docs/agency-manual/)).
The signup form ([api.data.gov/signup](https://api.data.gov/signup/)) asks for essentially just name
and email (the GovInfo-branded variant of the same form also asks a postal code). On submission you
are immediately issued a 40-character API key, sent by email — **there is no account, no password,
no login, no dashboard.** You authenticate every request with `x-api-key: <key>` (or `api_key=` query
param). Documentation examples default to a shared `DEMO_KEY`, which works with no signup at all but
is rate-limited far below a real key (the default per-key limit is on the order of 1,000 requests/hour;
`DEMO_KEY` is a small fraction of that). Every response carries `X-RateLimit-Limit` /
`X-RateLimit-Remaining` headers, so usage visibility is entirely self-serve via response headers —
there's no portal page to check it on.

Because there's no account, there is also **no self-serve way to see your own key again, rotate it,
or revoke it** — that requires emailing the operators. This is about as frictionless as issuance gets:
name, email, key, done, in under a minute.

### 1.2 NYT Developer Network (account + apps + keys)

The NYT portal requires a real account (real name, organization, email) and then a distinct
**"Apps"** concept: from the account menu you go to Apps and create a new app by giving it a name and
an optional description
([D-Lab Berkeley walkthrough](https://dlab.berkeley.edu/news/getting-started-nyt-api);
[public API specs](https://github.com/nytimes/public_api_specs)). Each app is then used to
**opt in to specific product APIs** (Article Search, Books, Archive, etc.) one at a time — enabling an
API on an app is what actually mints the key for that API/app pair, and a single app can hold keys for
several of NYT's ~10 public APIs. One account can hold multiple apps, each separately named. NYT's own
developer documentation site (developer.nytimes.com) blocks automated fetches, so exact field labels
beyond name/description weren't independently confirmed here, but the account-then-apps-then-keys
shape is corroborated by the tutorial and by the public OpenAPI specs repo.

This is a light-touch middle ground: friction is one account + one short form (name, optional
description) per app, in exchange for NYT knowing, per key, which app it belongs to and roughly what
it's for (if the developer bothered to fill in the description).

### 1.3 Wikimedia (OAuth clients + personal API tokens)

Wikimedia runs a genuine two-tier model:

- **Personal API tokens** — created in a couple of clicks from account preferences, no app metadata
  at all, capped at 5,000 requests/hour, explicitly positioned for "evaluation and prototyping"
  ([Rate limits FAQ](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits/FAQ)).
- **OAuth consumer registration** (`Special:OAuthConsumerRegistration/propose`) — a full application
  form: name, description, contact email, application URL, source-code/documentation URL, callback
  URL, the specific grants (scopes) requested, an optional IP-range restriction, and (OAuth 1.0a only)
  a public RSA key. A checkbox marks the consumer **"owner-only"** — usable solely by the registering
  account, in which case it skips review entirely and is usable immediately. Multi-user, public
  consumers go through admin review, though apps requesting only minimal/identify-only permissions are
  auto-approved, and the registering developer can test their own app live before official approval
  completes ([OAuth/For Developers](https://www.mediawiki.org/wiki/OAuth/For_Developers);
  [Owner-only consumers](https://www.mediawiki.org/wiki/OAuth/Owner-only_consumers)).

The split matters: a hobbyist script gets essentially NASA-style frictionless access (personal
token), while anything that will act as a distinct multi-user "app" — the thing Sefaria actually wants
to track — goes through a real registration form, without that heavier form gatekeeping the
lightweight path.

### 1.4 What friction buys you — the data-quality tradeoff

| Field asked | What it buys | Who asks it |
|---|---|---|
| Name + email only | Converts intent to key in seconds; buys almost no inventory data — GSA/NASA can't say what's being built any better than Sefaria can today, just who to email | api.data.gov/NASA |
| + Project/app name + short description | The cheapest field that actually answers "what projects exist" — freeform text, no validation, but queryable | NYT, Wikimedia OAuth consumers, Europeana Project keys |
| + Homepage / callback / source URL | Reachability and verifiability — required anyway for any user-delegated OAuth redirect flow; optional for pure server-to-server | Wikimedia OAuth, Reddit web/installed apps, Auth0 |
| + Category / expected volume | Enables tiering and capacity planning, but is the least reliable self-report (developers guess low) and adds the most friction — better deferred to an approval-time or upgrade-time question than gating first-key issuance | Not commonly asked upfront by any surveyed portal; closer to what gateway products like Kong/Tyk ask when subscribing to a paid plan |

The cross-cutting pattern: **every surveyed platform reserves its heaviest gate (admin review, org
verification) for elevated privilege — a public multi-user OAuth app, a production/project key, a
higher rate tier — and never for the first, low-privilege key.**

## 2. Full-featured patterns (Stripe/GitHub-grade key management)

### 2.1 Key naming & multiple keys per project

Stripe lets you create any number of named restricted keys per account (e.g. `billing-service-prod`),
each independently scoped, always separate from test-mode keys
([Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys)). GitHub similarly allows
multiple fine-grained personal access tokens per user, each with its own name, repository list, and
permission set
([Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)).
The naming field is what makes "why does this key exist" answerable months later.

### 2.2 Display-once, copy-to-clipboard, prefix display

Both platforms show the full secret exactly once, at creation, with a copy button and an explicit
"you won't be able to see this again" warning; only a hash is retained server-side. After creation,
the management UI shows only the key's prefix (and, for GitHub, a few trailing characters) — enough to
recognize which key is which without the value ever being retrievable again
([Stripe API keys](https://docs.stripe.com/keys); [best practices](https://docs.stripe.com/keys-best-practices)).

### 2.3 Last-used timestamp

GitHub's token settings pages surface a "last used" date per personal access token, SSH key, and
deploy key — the primary UI signal developers use to decide whether a credential is safe to prune. It
directly supports GitHub's automatic revocation of tokens unused for a year
([Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation)).

### 2.4 Scopes / restrictions UI

Stripe's restricted-key editor is a per-resource permission matrix (None / Read / Write across every
API resource type), reachable via "Manage access policy" on any key
([Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys)). Google Cloud/Maps API keys
carry **two independent restriction axes**: an *application restriction* (HTTP referrer, IP address,
Android package name + SHA-1, or iOS bundle ID — i.e., who is allowed to present this key) and an *API
restriction* (which specific Google APIs the key may call) — and the console now requires at least one
API restriction before a key can be created at all
([Manage API keys](https://docs.cloud.google.com/docs/authentication/api-keys);
[Adding restrictions](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys)).

### 2.5 Rotation

Stripe's rotate flow keeps the old and new key both valid for up to 7 days, explicitly to allow a
gradual, zero-downtime migration — the docs recommend deploying the new key to a subset of servers
first and watching logs before fully cutting over
([Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys)). GitHub instead leans on
expiration policies: fine-grained PATs can carry an expiration date (orgs can mandate one, up to a
366-day default enterprise policy), forcing periodic regeneration rather than ad hoc rotation
([New PAT rotation policies](https://github.blog/changelog/2024-10-18-new-pat-rotation-policies-preview-and-optional-expiration-for-fine-grained-pats/)).

### 2.6 Revoke

Both support immediate one-click revoke. GitHub additionally auto-revokes any classic or fine-grained
PAT it detects pushed to a public repository or gist via its secret-scanning partner program, and
shipped a **Credential Revocation API** (GA April 2025) so third parties (security researchers,
scanners) can bulk-revoke tokens they find exposed elsewhere without going through the UI
([Credential revocation API GA](https://github.blog/changelog/2025-04-29-credential-revocation-api-to-revoke-exposed-pats-is-now-generally-available/)).

### 2.7 Audit log

GitHub's organization security log records token lifecycle events (e.g. `oauth_authorization.destroy`
on expiry or revocation), and revocations triggered via the Credential Revocation API are separately
logged to the token owner's personal audit log
([Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation)).
Stripe's dashboard exposes a filterable API request/event log that can be scoped to a specific key,
serving the same "what has this credential actually done" function.

### 2.8 Notifications

GitHub emails on new PAT creation and warns ahead of expiration; both platforms' leak-detection
programs notify (and in GitHub's case, auto-revoke) the moment a secret-scanning partner flags a
credential in a public location. This closes the loop between "issue a key" and "know when it's been
compromised" without requiring the developer to be watching a dashboard.

## 3. The "application/project" abstraction

### 3.1 Why platforms model apps, not just keys

Usage, quota, and billing naturally attach to a *product* or *project*, not to the person who happened
to click "create key" — one developer may run several distinct things, and an organization's key may
outlive any single employee. This is also structurally what Sefaria needs: the brief's core question
is "how many distinct **projects** consume our API," not "how many users." GitHub makes the rationale
explicit for its own App model: **GitHub Apps are not tied to a user account and remain installed even
when the person who installed them leaves the organization**
([Deciding when to build a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app);
[GitHub App vs OAuth App](https://nango.dev/blog/github-app-vs-github-oauth/)).

### 3.2 User ↔ org ↔ app ↔ key hierarchies across platforms

| Platform | Hierarchy | Notes |
|---|---|---|
| Google Cloud | Org → Project → API keys (+ service accounts) | Keys are restricted to the specific APIs enabled on their parent project ([Manage API keys](https://docs.cloud.google.com/docs/authentication/api-keys)) |
| X/Twitter | Developer account → Project → App(s) → keys/tokens | Number of Apps per Project is tier-limited; legacy pre-Projects credentials live on as ungoverned **"Standalone Apps"** outside the structure — a cautionary precedent for migrating an existing unregistered population later ([Projects overview](https://developer.x.com/en/docs/projects/overview); [Apps overview](https://developer.twitter.com/en/docs/apps/overview)) |
| Auth0 | Tenant → Applications (typed at creation: Native / SPA / Regular Web App / Machine-to-Machine) | The type determines whether the platform issues a confidential client + secret or a public client with none ([Applications in Auth0](https://auth0.com/docs/get-started/applications)) |
| Reddit | Account → Apps (typed: script / web app / installed app) | **Installed apps get no client secret at all** — there's nowhere safe to keep one on a mobile/client-side app — the exact shape of Sefaria's Linker/mobile problem ([Reddit API app guide](https://redaccs.com/reddit-api-guide/)) |
| Europeana | User account → Personal API key (1 per user, non-production) *or* Project API key (production, can span multiple software solutions) | Closest single-org analog to Sefaria's nonprofit/cultural situation ([Get an API key](https://pro.europeana.eu/page/get-api)) |
| GitHub | User/org → installed GitHub App (org-owned) vs personal PAT (user-owned) | Org-owned-app vs personal-token is its own axis, orthogonal to project/app naming |

### 3.3 Fields platforms collect when registering an app

Across all of the above, the superset of fields is: **app/project name** (universal), **description**
(near-universal, sometimes optional), **homepage/website URL**, **platform/client type**
(native / SPA / regular web / server / script — determines whether a secret is issued and what
integration guidance is shown), **callback/redirect URI** (only for user-delegated OAuth flows),
**contact email**, **source/repo URL** (Wikimedia specifically, used for trust evaluation during
review), and **organization name** (NYT, Europeana Project keys).

## 4. ToS / attribution acceptance at key creation

### 4.1 Wikimedia (attribution, User-Agent policy)

Wikimedia content is CC BY-SA/GFDL; attribution is a baseline term of reuse (title, author, source,
license, or a hyperlink back) rather than a per-key checkbox
([API Usage Guidelines](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines)).
Separately — and enforced *technically*, independent of any token — the **User-Agent policy** requires
every request to identify the operator; an absent, empty, or generic User-Agent gets a hard HTTP 403
regardless of authentication status
([User-Agent Policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)).
The Usage Guidelines also forbid sublicensing or reselling access to the API.

### 4.2 Europeana (rights statements, usage guidelines)

Europeana layers three things: a general Terms of Use, a separate **Usage Guidelines for Metadata**
document (attribution, linking back to the source, maintaining an "update mechanism" if you cache
their metadata), and — notably — a **rights statement embedded in every API response** on the
`edm:rights` field of each digital object, so the reuse condition travels with the data itself rather
than depending on the key-holder remembering the ToS they clicked through once
([Usage Guidelines for Metadata](https://www.europeana.eu/en/rights/usage-guidelines-for-metadata);
[Understanding rights statements](https://pro.europeana.eu/page/available-rights-statements)). As of a
May 2025 migration, getting an API key requires (and implies acceptance via) a regular Europeana user
account ([Get an API key](https://pro.europeana.eu/page/get-api)).

### 4.3 Pattern: acceptance as a gate, not a formality

The strongest version of this pattern is: **one checkbox, against a short and stable policy page,
accepted once at signup (not re-prompted per key)** — plus, wherever content licensing is actually at
stake, encoding the requirement in the data itself (a rights/license field on every response) as
technical redundancy for what is fundamentally a social/legal contract. For Sefaria this maps
naturally onto its existing CC-licensed-text attribution requirements — the developer-portal
acceptance checkbox would formalize something Sefaria already asks of everyone, not introduce a new
obligation.

## 5. Internal/first-party token management vs public self-serve keys

### 5.1 Why platforms separate issuers

Internal and public credentials differ in trust level, lifecycle owner (a known employee/system vs an
unknown third party), blast radius of compromise, and required friction (internal issuance typically
skips email verification and ToS click-through that a public path needs). Every mature platform
surveyed keeps them on structurally separate rails rather than routing first-party integrations through
the same "sign up" flow as everyone else.

### 5.2 Examples

- **GitHub**: personal access tokens are the self-serve, individual path; **GitHub Apps** are the
  org-owned, admin-installed path recommended for anything meant to outlive one person or scale past
  personal rate limits (installation tokens pool at a much higher, repo/org-count-scaled rate limit)
  ([Differences between GitHub Apps and OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)).
- **Stripe**: the customer-facing dashboard only ever issues publishable/secret/restricted keys through
  one UI; Stripe's own internal systems run on separate infrastructure-level credentials never exposed
  through that dashboard at all.
- **Auth0**: Machine-to-Machine applications are typically provisioned by an organization's own admins
  for its own back-end services — conceptually identical to Sefaria minting its own
  `MOBILE_APP_KEY`/`SEFARIA_BOT_API_KEY`-style credentials outside any public flow
  ([Register M2M Applications](https://auth0.com/docs/get-started/create-apps/machine-to-machine-apps)).

### 5.3 Implication for Sefaria's first-party consumers

The consumer table in the brief (web frontend, Linker embed, Sefaria MCP server, mobile apps, internal
scripts) describes exactly the population that should **not** go through a public self-serve portal.
They should get credentials from an internal/admin-only issuance path — a Django-admin action,
deploy-time secret injection, or a "system apps" allowlist seeded outside the public UI — kept
structurally separate from whatever gets built for third-party developers. None of the platforms
surveyed conflate the two paths, even ones (GitHub) that built their own full OAuth/PAT stack from
scratch.

## 6. Build vs buy for the portal layer

### 6.1 Django-native (profile page section)

Sefaria already has user accounts and a profile page. A Project/App model plus a hashed APIKey model
(FK'd to the app, not directly to the user), surfaced as a new section of the existing profile UI, is
the lowest-infra-cost option and aligns with the brief's note that the Flanksource engagement is
actively *reducing* infrastructure dependencies. This is pure Django app-development effort — no new
service to operate.

### 6.2 SaaS dev-portal products vs OSS docs frameworks

- **Kong Konnect Dev Portal** and **Tyk Enterprise Developer Portal** are gateway-attached: developers
  sign up, register an app, and get credentials issued automatically, with admin-approval gating
  configurable per portal
  ([Kong self-service](https://developer.konghq.com/dev-portal/self-service/);
  [Tyk approving self-registering requests](https://tyk.io/docs/tyk-stack/tyk-developer-portal/enterprise-developer-portal/managing-access/approve-self-registering-requests/)).
  Both presume you're running (or migrating to) their gateway — a materially bigger infra commitment
  than Sefaria's current Envoy + nginx + Varnish stack, and in tension with the brief's
  infra-reduction direction.
- **ReadMe.io** is API-documentation-plus-analytics with an interactive "try it" console, but it
  explicitly does **not** issue, store, or rotate API keys tied to a gateway — you'd still need your
  own key-issuance backend behind it ([readme.com](https://readme.com/)).
- **Zudoku** ([zudoku.dev](https://zudoku.dev/)) is an open-source, self-hosted, Vite-based
  docs/portal framework with pluggable auth providers and wiring points for API-key management — a
  "buy the docs shell, still build the key backend" middle path, closer to build than the gateway
  products.

### 6.3 OSS building blocks

- **djangorestframework-api-key** ([github.com/florimondmanca/djangorestframework-api-key](https://github.com/florimondmanca/djangorestframework-api-key))
  gives hashed-key storage and a `HasAPIKey` DRF permission class out of the box, but its built-in
  model is unscoped and single-tier — using it for a Project/App-owns-keys, scoped model would mean
  subclassing its abstract base classes, which is supported but is real work, not a free ride.
- **django-oauth-toolkit** ([django-oauth-toolkit.readthedocs.io](https://django-oauth-toolkit.readthedocs.io/))
  ships a full `Application` model (client id/secret, redirect URIs, grant types) plus scope-checking
  permission classes (`TokenHasScope`) — its `Application` model is exactly the "app owns credentials"
  abstraction this doc argues for, even if Sefaria has no present need for full OAuth2 authorization-code
  flows (a read API with no user-delegated data). Worth mining for the data model even if not adopting
  OAuth2 wholesale.
- **Unkey** ([github.com/unkeyed/unkey](https://github.com/unkeyed/unkey), [unkey.com](https://www.unkey.com/))
  is a purpose-built, open-source (AGPL) key-issuance/rate-limiting/analytics service: hashed key
  storage, scoped permissions, rotation, temporary keys, and per-key usage analytics out of the box.
  It's genuinely self-hostable but by the maintainers' own account self-hosting isn't the smooth "paved
  road" yet (thin docs, externally-paused PRs as of this research), and running it adds a new service
  (MySQL + Redis) to Sefaria's stack.

### 6.4 Recommendation framing

Given (a) Sefaria already has Django accounts/profiles to build on, (b) the explicit infra-reduction
mandate, and (c) an identification-first initial scope with quotas deferred, the **Django-native path —
a Project/App model + hashed APIKey model, either hand-rolled or seeded from
djangorestframework-api-key, surfaced on the profile page — is the lowest-risk starting point.**
Gateway-attached portals (Kong/Tyk) or a dedicated key service (Unkey) are worth reconsidering only if
quotas, multi-tier billing, or self-service volume later make a bespoke Django solution genuinely
burdensome to maintain — not before.

## 7. Developer-facing usage dashboards

### 7.1 Why show consumers their own usage

It's goodwill (developers can self-diagnose an integration bug before filing a support ticket), it's
self-policing (visible quota/usage discourages accidental overuse and surfaces things like retry
storms to the developer who caused them, not only to Sefaria's ops team), and it's a natural channel
for Sefaria to also push its own notices (deprecations, policy changes) to precisely the population
that needs to see them.

### 7.2 Examples

- **api.data.gov**: the minimum viable version — no dashboard page at all, just `X-RateLimit-Limit` /
  `X-RateLimit-Remaining` headers on every response, self-serve via `curl` with zero UI to build.
- **GitHub**: exposes live rate-limit state via response headers on every API call, plus a per-token
  usage view in account settings.
- **Twilio**: Console's Usage pages give per-product, per-subaccount breakdowns and spend history, but
  notably also expose the same data as a public **Usage Records REST API**
  ([docs](https://www.twilio.com/docs/usage/api/usage-record)) — so sophisticated consumers can pull
  usage into their own monitoring rather than being limited to Twilio's own UI. This "usage-as-an-API"
  pattern is worth keeping in mind if Sefaria's own usage data (already flowing into BigQuery per the
  brief) is ever exposed back to developers.

## 8. Annotated walkthroughs (4 exemplar portals)

**NASA / api.data.gov — frictionless, no-account** ([signup](https://api.data.gov/signup/)):
1. Visit the signup page; enter name and email (no password, no org, no project description).
2. Submit — a 40-character key is generated and emailed immediately.
3. Use the key via `x-api-key` header or `api_key=` query param against any participating agency API
   (NASA, GovInfo, FAC, etc.) — one key, many APIs.
4. Check remaining quota via `X-RateLimit-Remaining` response headers; no dashboard exists.
5. To rotate or revoke, email the operators — there's no self-serve account to log back into.

**Wikimedia — OAuth consumer registration (the "real app" path)**
([OAuth/For Developers](https://www.mediawiki.org/wiki/OAuth/For_Developers)):
1. Log in with an existing Wikimedia account; navigate to
   `Special:OAuthConsumerRegistration/propose`.
2. Fill in application name, description, contact email, application URL, optional
   source-code/documentation URL, and a callback URL (localhost acceptable for testing).
3. Check "This consumer is for use only by ⟨you⟩" if it's a single-user tool — this skips review
   entirely and the consumer is immediately usable.
4. Otherwise, select the grants (scopes) requested; submit for admin review. Low-privilege
   (identify-only) requests are auto-approved; the registering account can test the app live before
   formal approval completes.
5. Once approved (or immediately, if owner-only), the app has its own client id/secret independent of
   any personal token, usable by other users who authorize it via the standard OAuth dance.

**Stripe — creating and rotating a restricted key**
([Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys)):
1. In the Dashboard's API keys page, click "Create restricted key."
2. Give it a descriptive name (e.g. `billing-service-prod`).
3. Set a permission (None/Read/Write) per API resource the integration actually touches.
4. Save — the full secret (`rk_live_…`) is shown once with a copy button; afterward only the prefix
   is visible in the list.
5. To rotate later: click Rotate — a new key is issued while the old one stays valid for up to 7 days,
   letting the developer redeploy gradually and watch logs before the old key is fully retired.

**Europeana — Personal vs Project API key**
([Get an API key](https://pro.europeana.eu/page/get-api)):
1. Create (or log into) a regular Europeana account.
2. Request an API key from the account section — choose **Personal** (one per user, non-production,
   evaluation/prototyping use) or **Project** (production-level, can be shared across one or more named
   software solutions/apps).
3. Accept the Terms of Use / Usage Guidelines as part of the same account flow.
4. Use the key against the API; every returned digital-object record carries its own `edm:rights`
   rights-statement field, so attribution/reuse terms travel with the data regardless of what the
   key-holder remembers from step 3.

## 9. Sefaria product options: minimal vs fuller portal scope

### 9.1 Option A — Minimal

**Screens**: one page, "Get an API key," reachable from the profile menu and from API docs.

**Fields**: project/app name (required, free text), one-line "what are you building" description
(required, free text — this is the field that answers the brief's core question), contact email
(prefilled from the existing Sefaria account), and a single "I agree to the attribution and usage
policy" checkbox (required, linking to a short, stable policy page per §4.3).

**Flow**: submit → key generated immediately → shown once with a copy button and a "you won't see this
again" warning → done. No approval step, no scopes UI (single implicit read-only scope), no expiry.

**Identity**: piggybacks on the existing Sefaria account/login rather than going fully anonymous
NASA-style — unlike NASA/GovInfo, which spans many unrelated agencies with no shared login, Sefaria
already has the identity layer, so reusing it costs nothing and gets a self-serve "see my key again"
page for free that api.data.gov can't offer without a support email.

**Explicitly deferred to later**: self-serve revoke/rotate (support-mediated in v1), a usage dashboard,
scopes beyond read-only, multiple keys per project.

**What this buys**: the identification-first priority from the brief — a queryable inventory of
project name + description per key — for close to the minimum possible engineering and user friction.

### 9.2 Option B — Fuller

**Screens**:
1. Profile → "Developer" tab: a list of Apps the user owns.
2. "New App" form: name, description, homepage URL, **platform type** (web / server / mobile — used
   to decide what integration guidance to show, e.g. warning mobile/client apps that any embedded
   secret is extractable, per the brief's client- vs server-side distinction), and an optional
   category dropdown (research / education / product / personal / AI-training / other) for
   coarse-grained analytics on top of the freeform description.
3. App detail page: one or more **named** keys per app (dev/prod split supported from day one), each
   showing prefix + last 4 characters, created and **last-used** timestamps, a scopes picker (once
   scopes exist beyond read-only), and rotate/revoke buttons — rotate following Stripe's
   dual-validity-window pattern.
4. Per-app usage panel: requests/day and error rate, sourced from the BigQuery pipeline the brief
   already describes as ingesting nginx logs — no new telemetry pipeline required, just a query surface.
5. ToS/attribution acceptance recorded per app with a version stamp, so a future policy change can be
   selectively re-prompted rather than silently grandfathered.

**Notifications**: email on new key creation; optional "this key hasn't been used in N months" prune
nudge, modeled on GitHub's unused-token cleanup.

**What this buys over Option A**: multiple keys per project (dev/prod separation), self-serve
lifecycle management (no support-ticket round-trip to rotate or revoke), the platform-type field that
downstream enforcement work (05/07) will want, and a usage dashboard that reduces support load and
builds goodwill — at the cost of meaningfully more screens and a scopes/permissions model that doesn't
need to exist on day one.

### 9.3 Open decisions this doesn't resolve

- **Grace-period policy** — whether unauthenticated/legacy traffic keeps working indefinitely or on a
  deprecation clock is 05/08's territory; this doc assumes the portal can launch before that policy is
  finalized, since issuing keys doesn't require deprecating anonymous access on day one.
- **Where enforcement actually lives** given the Varnish URL-only cache-key constraint from the brief
  is 06/07's territory. This doc deliberately treats the portal as issuing and displaying keys only —
  build order can decouple "get identification working" (this doc) from "get enforcement working"
  (rate limiting / edge involvement), since none of the surveyed portals' UX changes based on where
  enforcement happens.
- **Whether Option A's account-gated flow is the right call at all**, given some of Sefaria's likely
  registrants (hobbyists, AI-scraper operators who may not want to identify themselves) might prefer
  anonymity-adjacent friction closer to api.data.gov's name+email model. Leaning toward reusing
  Sefaria's existing accounts by default — unlike api.data.gov's many-unrelated-agencies situation,
  Sefaria's identity layer already exists and reusing it is close to free — but this is a product call,
  not a foregone conclusion.

## Sources

- api.data.gov: [Signup](https://api.data.gov/signup/), [Developer manual](https://api.data.gov/docs/developer-manual/), [Agency manual](https://api.data.gov/docs/agency-manual/)
- NYT Developer Network: [D-Lab Berkeley walkthrough](https://dlab.berkeley.edu/news/getting-started-nyt-api), [public API specs (GitHub)](https://github.com/nytimes/public_api_specs)
- Wikimedia: [OAuth/For Developers](https://www.mediawiki.org/wiki/OAuth/For_Developers), [OAuth/Owner-only consumers](https://www.mediawiki.org/wiki/OAuth/Owner-only_consumers), [Rate limits FAQ](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits/FAQ), [API Usage Guidelines](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines), [User-Agent Policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)
- Europeana: [Get an API key](https://pro.europeana.eu/page/get-api), [Usage Guidelines for Metadata](https://www.europeana.eu/en/rights/usage-guidelines-for-metadata), [Understanding rights statements](https://pro.europeana.eu/page/available-rights-statements)
- Stripe: [API keys](https://docs.stripe.com/keys), [Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys), [Best practices](https://docs.stripe.com/keys-best-practices)
- GitHub: [Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation), [Managing personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [Credential Revocation API GA](https://github.blog/changelog/2025-04-29-credential-revocation-api-to-revoke-exposed-pats-is-now-generally-available/), [PAT rotation policies](https://github.blog/changelog/2024-10-18-new-pat-rotation-policies-preview-and-optional-expiration-for-fine-grained-pats/), [Deciding when to build a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app), [GitHub Apps vs OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps), [GitHub App vs OAuth (Nango)](https://nango.dev/blog/github-app-vs-github-oauth/)
- Google Cloud: [Manage API keys](https://docs.cloud.google.com/docs/authentication/api-keys), [Adding restrictions to API keys](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys)
- X/Twitter: [Projects overview](https://developer.x.com/en/docs/projects/overview), [Apps overview](https://developer.twitter.com/en/docs/apps/overview)
- Auth0: [Applications in Auth0](https://auth0.com/docs/get-started/applications), [Register M2M Applications](https://auth0.com/docs/get-started/create-apps/machine-to-machine-apps)
- Reddit: [How to create a Reddit API app](https://redaccs.com/reddit-api-guide/)
- Kong: [Developer self-service](https://developer.konghq.com/dev-portal/self-service/)
- Tyk: [Approve self-registering requests](https://tyk.io/docs/tyk-stack/tyk-developer-portal/enterprise-developer-portal/managing-access/approve-self-registering-requests/)
- ReadMe.io: [readme.com](https://readme.com/)
- Zudoku: [zudoku.dev](https://zudoku.dev/)
- djangorestframework-api-key: [GitHub](https://github.com/florimondmanca/djangorestframework-api-key)
- django-oauth-toolkit: [docs](https://django-oauth-toolkit.readthedocs.io/)
- Unkey: [GitHub](https://github.com/unkeyed/unkey), [unkey.com](https://www.unkey.com/)
- Twilio: [Usage Records API](https://www.twilio.com/docs/usage/api/usage-record)
