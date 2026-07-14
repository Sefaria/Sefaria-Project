# Differentiating First-Party from Third-Party Traffic (sc-45692)

> See [00-brief.md](./00-brief.md) for full context. This doc researches how industry
> distinguishes first-party from third-party API traffic when first-party clients run on
> untrusted devices/origins (browser JS, embedded widgets, mobile apps) — i.e. contexts where
> "the key is public" is a starting assumption, not a failure.

## TL;DR

- Industry's core trick: stop treating the key as a secret. A **publishable/public key** is an
  *identifier*, not a credential — extraction is safe precisely because the key grants nothing
  beyond what anonymous access already grants, plus attribution. Stripe, Firebase, Algolia,
  Sentry, and Segment all ship this model. This maps directly onto Sefaria's situation: the read
  API is already "effectively anonymous," so a client-visible key for web/Linker/mobile can be
  purely an attribution tag, not a gate.
- **Origin/Referer/bundle-ID binding is a friction layer, not a lock.** It stops casual
  copy-paste reuse and raises the cost of impersonation from "trivial" to "must run
  server-side," but a determined actor can always defeat it outside a real browser. Treat it as
  raising signal quality for identification/abuse-detection, not as security.
- **Mobile/device attestation (App Check, Play Integrity, App Attest) is real security** but
  disproportionate machinery for a nonprofit read API today — it's a lever for later if
  mobile-client impersonation becomes a measured cost, not a v1 requirement.
- **Embedded widgets solve exactly Sefaria's Linker problem**: GA, Segment, Sentry, Stripe.js,
  and Intercom all issue a distinct, non-secret public ID *per installing site*, baked into the
  snippet each publisher copies onto their page. Sefaria's Linker currently has no such
  per-install identity — it's the "one shared key" anti-pattern every one of these platforms
  deliberately avoids.
- **First-party web frontends generally don't need an API key at all.** Session cookie +
  same-origin is already a stronger, more scoped first-party signal than any embeddable key
  could be. The interesting problem is Varnish: cache-key = URL-only means any identity signal
  carried in a header/cookie is invisible to Django on cache hits — the standard resolution is
  to *not* try to differentiate anonymous-equivalent cached GETs at all, since first-party web
  and anonymous readers are authorized identically anyway.
- **Server-side first-party (MCP hosted mode, cron) is the one case that can hold a real
  secret** — because it never reaches an untrusted device. Industry pattern is one key-issuance
  system with an `internal=true`/trust-tier flag, not a parallel bespoke mechanism.
- Spoofability is a spectrum, not a binary: UA string < Referer < Origin < bundle-ID/cert
  binding < IP allowlist < device attestation < server-held secret. Each rung requires more
  effort to defeat but none except the last is unforgeable by a sufficiently motivated
  server-side actor.

## 1. The publishable-key model (keys as identifiers, not secrets)

The pattern repeated across every major platform researched: split keys into two tiers by
**blast radius**, not by how hard they are to obtain.

- **Stripe**: publishable keys "identify your account in client-side code... they are designed
  to be exposed in a browser or app bundle, so they can only do safe things like tokenizing a
  card or confirming a payment that your server already set up." Secret keys, by contrast, "must
  stay in your server environment" because they can move money or read customer data outright.
  ([docs.stripe.com/keys](https://docs.stripe.com/keys),
  [docs.stripe.com/keys-best-practices](https://docs.stripe.com/keys-best-practices))
- **Firebase**: "API keys for Firebase services are OK to include in code or checked-in config
  files." The documentation is explicit that the key is a *project identifier*, not an access
  gate — "unlike how API keys are typically used, API keys for Firebase services are not used to
  control access to backend resources; that can only be done with Firebase Security Rules... and
  Firebase App Check." ([firebase.google.com/docs/projects/api-keys](https://firebase.google.com/docs/projects/api-keys))
- **Algolia**: ships a **search-only** key explicitly "safe to use in your production frontend
  code," strictly separated from the Admin key, which must never leave a trusted backend.
  Real-world breach data backs up why this split matters: a security researcher found 39 Algolia
  **admin** keys (not search keys) exposed in doc-site configs — i.e., failures happen when teams
  don't respect the tier boundary, not when the public tier itself leaks.
  ([algolia.com/doc/guides/security/api-keys](https://www.algolia.com/doc/guides/security/api-keys),
  [support.algolia.com — can the search key be public](https://support.algolia.com/hc/en-us/articles/18966776061329-Can-the-search-API-key-be-public),
  [benzimmermann.dev — 39 exposed admin keys](https://benzimmermann.dev/blog/algolia-docsearch-admin-keys))
- **Sentry DSN**: "the DSN is a public key, not a secret, and it is safe to include in
  client-side JavaScript, mobile apps, and other code that users can read... it serves solely to
  identify the project within Sentry to which the events should be sent."
  ([docs.sentry.io/concepts/key-terms/dsn-explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/))
- **Segment writeKey**: "a unique identifier for each source that lets Segment know which source
  is sending the data" — again an attribution tag, not a secret.
  ([segment.com/docs/connections/find-writekey](https://segment.com/docs/connections/find-writekey/))
- **Google's own framing** (Cloud Endpoints docs) states the general principle cleanly: "API keys
  identify the calling project... while authentication tokens identify individual users." API
  keys are for blocking anonymous traffic, tracking usage, and filtering logs by
  application — not for "secure authorization." Google explicitly warns API keys "are generally
  not considered secure" for that purpose and says to layer real auth (OAuth, Firebase Auth) on
  top when user-level access control matters.
  ([docs.cloud.google.com/endpoints/docs/openapi/when-why-api-key](https://docs.cloud.google.com/endpoints/docs/openapi/when-why-api-key))

**The invariant**: a client-exposed key's worst case if stolen is that someone else borrows your
*attribution/quota bucket* to do things anonymous users could already do (or, if the key is
write-scoped like a Segment writeKey, inject noise into your account) — not a data breach. That's
what makes extraction a non-event rather than an incident. It only holds if the key's scope is
genuinely capped at "what anonymous access already grants"; a key that unlocks anything more
(write access, PII, elevated rate limits) reverts to needing real secrecy.

## 2. Origin binding (Referer/Origin allowlists, bundle-ID/package restrictions, IP allowlists)

**HTTP Referer allowlisting (Google Maps' original mechanism)**: configured per-key in Cloud
Console against a domain pattern. Google's own security guidance is candid about its limits:
"Modern web browsers typically redact the Referer header in cross-origin request for privacy
reasons, often stripping it down to the Origin," and researchers have demonstrated bypassing
referrer restrictions to exhaust another project's quota.
([developers.google.com/maps/api-security-best-practices](https://developers.google.com/maps/api-security-best-practices),
[Medium — exhausting Maps API key quota by bypassing restrictions](https://n0sandb0x.medium.com/exhausting-google-map-api-key-quota-by-bypassing-restrictions-fc7a357d62b2))

The asymmetry that matters: **Referer cannot be forged by a page's own JavaScript** in a real
browser (it's on the fetch/XHR "forbidden header" list — `XMLHttpRequest.setRequestHeader` throws
if you try), but it is trivially set to anything by any non-browser HTTP client (`curl -H
"Referer: ..."`, a Python script, a proxy). So Referer-checking defeats "another web page
accidentally or casually embeds your key," but does nothing against a purpose-built scraper.
([GitHub mdn/content#2660 — Referer is a forbidden header](https://github.com/mdn/content/issues/2660))

**Origin header** is the CORS-era successor and is somewhat more reliable: it's mandatory on
cross-origin fetch/XHR/CORS-preflighted requests, can't be overridden by page JS, and (unlike
Referer) isn't strippable by a site's `referrer-policy`. But it's the same category of protection
under the hood — a browser-enforced guarantee that only holds for actual browser JS callers.
Security guidance is explicit that it should not be treated as an authentication mechanism on its
own: "it is not possible to be 100% certain that any request comes from an expected client
application, since all information of a HTTP request can be faked" by non-browser clients.
([howhttpworks.com/headers/origin](https://howhttpworks.com/headers/origin),
[OWASP — CORS OriginHeaderScrutiny](https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny))

**Bundle-ID / package-name restriction (mobile)**: Google's mechanism has the app attach
`X-Android-Package` + `X-Android-Cert` (the app's SHA-1 signing-certificate fingerprint) or
`X-Ios-Bundle-Identifier` headers, checked server-side against an allowlist. This is a step up
from Referer because the cert fingerprint is tied to the developer's actual signing key — harder
to casually replicate than a header string — but it is still just a static value attached to the
request, not a per-request cryptographic proof; anyone who extracts the fingerprint from a
decompiled APK can replay it from a script.
([docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys),
[Guardsquare — Google API key restrictions and mobile app security](https://www.guardsquare.com/blog/google-api-key-restirctions-mobile-app-security))

**IP allowlisting** is the strongest binding available and Google explicitly recommends it over
Referer for server-side callers: "server-side applications relying on API keys are best secured
through IP address restrictions rather than referrer restrictions, as IP addresses are harder to
spoof than HTTP headers." It's the right fit for infrastructure Sefaria fully controls (internal
scripts, hosted MCP), and explicitly impractical for mobile/cloud clients with dynamic IPs.
([developers.google.com/maps/api-security-best-practices](https://developers.google.com/maps/api-security-best-practices))

**Net assessment**: origin-style binding is a friction/moat, not a lock. It raises the bar from
"trivial for anyone" to "must be done server-side, deliberately." That's still valuable —
it filters out accidental misuse and low-effort abuse — but none of Referer/Origin/bundle-ID
survives a motivated, server-side adversary. Only IP allowlisting (network-level) and true
device attestation (below) meaningfully raise the cost further.

## 3. Mobile attestation (App Attest/DeviceCheck, Play Integrity, Firebase App Check)

Firebase App Check is the common wrapper: the app asks the platform's attestation service (Apple
App Attest/DeviceCheck, or Google Play Integrity on Android) to vouch that it is a genuine,
untampered build of the real app running on a genuine, unrooted device (Play Integrity also
verifies the app was installed via Play and is unmodified). The attestation is exchanged for a
short-lived App Check token that accompanies API calls; the backend verifies the token via
Firebase.
([firebase.google.com/docs/app-check](https://firebase.google.com/docs/app-check),
[Play Integrity provider docs](https://firebase.google.com/docs/app-check/android/play-integrity-provider),
[App Attest provider docs](https://firebase.google.com/docs/app-check/ios/app-attest-provider))

**Cost/effort**: this is real engineering, not a config flag — per-platform SDK integration,
token TTL tuning (30 min–7 days; shorter TTLs mean stronger security but more frequent
re-attestation, added latency, and faster quota consumption), debug-token flows for CI/testing,
and graceful fallback for emulators/rooted devices. Apple doesn't publish hard limits and says
they're "generally high enough to support massive, production-scale applications"; Android's Play
Integrity has a quota-increase request process for apps expecting to exceed default limits.
There's no metered dollar cost, but nontrivial engineering and operational surface.

**Is it warranted for Sefaria today?** Attestation defends against a fake or tampered client
*impersonating the real mobile app* — e.g., to bypass rate limits or scrape at volume while
posing as legitimate app traffic. That's a real threat category but a low-severity one for a
nonprofit read API where anonymous access is already broad and the content itself carries no
confidentiality requirement. This is heavier machinery than the current threat model justifies —
better framed as a future lever (per the brief's "quotas/tiers researched lightly as a future
lever") if mobile-client impersonation becomes a measured cost, not v1 infrastructure. Worth
noting Sefaria mobile already uses Firebase Remote Config for `MOBILE_APP_KEY`, so App Check would
extend an existing vendor relationship rather than introduce a new one — but that's a
"cheaper if needed later" observation, not a reason to build it now, especially given the
Flanksource direction of *reducing* infra dependencies.

## 4. Embedded-widget attribution (per-site public IDs: GA, Stripe.js, Algolia, Intercom)

Every embeddable-widget platform researched identifies **the installing site**, not just "the
product," via a small, non-secret, per-installation ID baked into the snippet the site owner
pastes onto their own page:

- **Google Analytics**: a Measurement ID (`G-XXXXXXXXXX`) per data stream/property. Using one
  Measurement ID across multiple sites is explicitly discouraged — "using one Measurement ID
  across multiple sites combines all the data into a single property, making it almost
  impossible to analyze individual site performance." The standard pattern is one ID per site.
  ([support.google.com/analytics/answer/12270356](https://support.google.com/analytics/answer/12270356))
- **Segment**: writeKey is per-*source* — i.e., per integration point, which in practice tracks
  per-site/per-app installs.
  ([segment.com/docs/connections/find-writekey](https://segment.com/docs/connections/find-writekey/))
- **Sentry**: DSN is per-*project*, and "if your application consists of multiple components or
  services, you'll typically create separate projects for each component, each with their own
  DSN." ([docs.sentry.io/concepts/key-terms/dsn-explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/))
- **Stripe.js / Connect embedded components**: the publishable key identifies the Stripe
  *account*; for platforms embedding components on behalf of connected accounts, each connected
  account gets its own identifiers so the platform's embed can be attributed per underlying
  merchant. ([docs.stripe.com/connect/get-started-connect-embedded-components](https://docs.stripe.com/connect/get-started-connect-embedded-components))
- **Intercom**: uses a workspace-scoped `app_id` in its snippet (well-established pattern,
  consistent with the others above — not independently re-verified via primary docs in this
  pass).

**Directly applicable to the Sefaria Linker.** Today the Linker is architecturally the "one
shared product key" anti-pattern every platform above deliberately avoids: any third-party site's
visitor browsers call the Sefaria API with only Referer/UA to identify them, with no per-site
identity at all (per the brief: "Linker v3 embed... Referer/UA only," "Identity today is UA +
referer only"). The precedented fix is a **per-site public Linker ID**, issued self-serve at
install time (timesofisrael.com gets a different, non-secret ID than Hadran's install), embedded
directly in the Linker snippet each publisher copies onto their page. This is safe to expose
under the Section 1 model — the ID grants nothing beyond what anonymous Linker traffic already
gets — and it turns the currently-invisible 11.5% "Linker on 3P sites" bucket (per the brief's
traffic inventory) into per-install-attributable traffic, with the ability to throttle or revoke
one abusive or defunct install without affecting the others.

## 5. First-party web frontend: dogfooding vs internal auth, and interaction with edge caching

**Does the platform's own frontend call its public API with a key?** This varies and wasn't
possible to confirm definitively for any single flagship example in this pass — GitHub's own
documentation covers external OAuth-app/PAT authentication for the public REST/GraphQL API in
detail, but doesn't document whether github.com's own web frontend routes through that same
token-gated public API surface internally versus separate session-authenticated endpoints.
Treat that specific claim as unconfirmed rather than asserting it. What *is* well-established,
generic web-architecture practice: a first-party web frontend that already has an authenticated
browser session (cookie) has no need for a redistributed API key to prove "this is a logged-in
first-party user" — the cookie already does that, and does it better (HttpOnly-protectable,
SameSite-scoped, tied to actual login state) than any key baked into page-source JS could, since
a static key in the bundle is exactly as extractable/replayable as no key at all.

This is exactly Sefaria's existing web-frontend row: "same-origin fetch, session cookie + CSRF
meta tag." That's already the correct first-party pattern for browser traffic — no key is needed
to *authenticate* it. The open question is purely **attribution/identification** (per the brief's
"identification-first" priority): if Sefaria wants the web frontend to carry a distinguishable
tag in the same key-tracking system as every other client, a publishable-style key (Section 1)
baked into the page bundle is the right shape — its extraction is a non-event since it grants
nothing beyond what the existing cookie-authenticated or anonymous session already gets.

**The caching interaction is the real design constraint.** Per the brief: "Varnish cache-key =
URL only... Django never sees cache-hit requests → metering/limits at Django level miss cached
traffic." This is a structural property of edge caching that shows up whenever a platform tries
to layer identity onto content that's cached because it's *not* user-specific. Cloudflare's own
token-authentication design for caching protected content works by validating tokens **at the
edge**, before the cache/origin round-trip, precisely so origin-level (Django-level, here)
logic never needs to see the distinction — but that requires the edge tier itself (Envoy/nginx,
per Sefaria's stack) to do the identity check, which is more infrastructure than "check a header
in Django."
([blog.cloudflare.com — token authentication for cached private content and APIs](https://blog.cloudflare.com/token-authentication-for-cached-private-content-and-apis/))

For Sefaria specifically, the pragmatic reading of Section 1's invariant resolves this cleanly:
**first-party web traffic and anonymous traffic are authorized identically** (the brief states
the read API is "effectively anonymous"). Since there's no *security* reason to fragment the
cache between them — only an *attribution* reason — the standard move is to **not** try to
differentiate them on the ~15 cached GET patterns at all: identify this slice via edge-layer
log/UA sampling (BigQuery pipeline, already in place) rather than a Django-level header check
that cache hits would bypass anyway. Reserve any hard, always-enforced key check for (a) the
uncached majority of endpoints, or (b) a deliberate Envoy/nginx `pass`-style carve-out on
requests carrying a distinguishing key, consciously accepting undercounting on cached GETs as the
brief already flags.

## 6. Server-side first-party (MCP, cron): internal service tokens vs same key system

MCP's own authorization guidance recommends full OAuth 2.1 (PKCE, bearer tokens, a
`/.well-known/oauth-authorization-server` discovery endpoint) for **remote MCP servers reachable
by external/arbitrary clients**. But the same guidance draws a distinction for purely internal
service-to-service calls: "for internal deployments where the client is another service rather
than a human user, Bearer token authentication with pre-shared API keys or JWTs is a simpler
alternative to OAuth 2.1," often paired with mTLS at the network layer.
([modelcontextprotocol.io/docs/tutorials/security/authorization](https://modelcontextprotocol.io/docs/tutorials/security/authorization),
[Red Hat — MCP security: authN/authZ](https://www.redhat.com/en/blog/mcp-security-implementing-robust-authentication-and-authorization))

**This maps onto a real distinction within Sefaria's own "MCP server" row that the brief's table
collapses into one line.** The brief notes hosted mode is "secret-capable" and local-stdio mode
is not — that's not incidental, it's the whole trust boundary:

- **Hosted MCP** (Sefaria-operated server process making the API calls) is architecturally a
  genuine internal caller — the secret never reaches an untrusted device — and can hold a real,
  non-extractable key, exactly like the existing legacy `SEFARIA_BOT_API_KEY` pattern for
  internal scripts. *However*, if hosted-MCP is proxying requests on behalf of arbitrary external
  AI-agent users (not just Sefaria's own jobs), the traffic behind that server-held key is
  functionally third-party even though the transport hop into Sefaria's API is server-side —
  worth flagging as a design question (does hosted MCP get one shared internal key regardless of
  who's behind it, or does per-user/per-session identity need to propagate through?), separate
  from the pure infra question of "can this hop hold a secret."
- **Local-stdio MCP** runs entirely on a third party's own machine with no embedded secret
  possible — architecturally indistinguishable from "someone's personal script calling the API,"
  i.e., an untrusted-device client like the browser or mobile app. It should get, at most, a
  publishable-style key (Section 1) or rely on UA/anonymous-grace-period identification, not a
  secret.

**Internal service token vs "same key system, internal flag"**: the surveyed guidance and
Sefaria's own existing legacy pattern both point the same direction — don't build a parallel
auth mechanism for internal callers. One key-issuance system with an `internal=true` (or
trust-tier) flag that relaxes rate limits/quotas for internally-issued keys is the standard
shape (mirrored by how Google Cloud API keys and Stripe both support restricting/tiering keys
within a single system rather than a bespoke internal-only mechanism). This also matches the
brief's stated preference for industry standards over custom solutions and Flanksource's
push to reduce added infrastructure — a second, separate internal-auth system would cut against
both.

## 7. Spoofability matrix

| Mechanism | Who can defeat it, and how | Effort to defeat | What it actually buys you |
|---|---|---|---|
| Nothing / raw anonymous | Anyone | None | No signal |
| User-Agent string | Anyone (`curl -A`, or trivially in-browser) | Trivial | Almost no signal; good-faith identification only |
| Referer header | Any non-browser client sets it freely; **cannot** be forged by a real browser's own page JS on a genuine cross-origin request | Trivial server-side; near-impossible from in-browser JS alone | Filters casual/accidental misuse from other web pages; useless against a standalone scraper |
| Origin header (CORS) | Same category as Referer — browser-enforced and unforgeable by page JS, but any script/curl/proxy sets it freely | Trivial server-side | Marginally more reliable than Referer (always present, not policy-strippable); explicitly not recommended as sole auth |
| Bundle-ID / package-name + signing-cert headers (mobile) | Requires extracting static header values from a decompiled binary, then replaying them from a script — the values themselves aren't re-derived per request | Low-moderate (one-time extraction, then trivial replay) | Stops casual key reuse across apps; doesn't stop a dedicated scraper posing as the app |
| Publishable/public key alone (no binding) | Not "defeated" — it isn't a secret; copying it just borrows the attribution/quota bucket | Trivial to copy, but low-stakes by design | Pure attribution/metering, safe because scope = anonymous scope |
| Origin/IP-locked key (public key + binding combined) | Must know the key **and** either spoof the binding server-side (easy for origin/referer, hard for IP) | Moderate–high depending on which binding | Meaningfully raises cost above any single factor |
| Mobile/device attestation (App Check, Play Integrity, App Attest) | Requires a rooted/jailbroken or emulated device plus active bypass technique, or racing a short-lived token's TTL | High | Defeats casual reuse and most scripted abuse; not immune to well-resourced reverse engineering |
| IP allowlist (server-to-server) | Requires compromising or operating inside the allowlisted network | High, but operationally brittle for dynamic-IP clients | Strong binding for infra Sefaria controls |
| mTLS / server-held secret (never reaches an untrusted device) | Requires compromising the server itself | Highest | The only tier that's a true secret in the classic sense |

## 8. Applying each mechanism to Sefaria's five consumer types

**1. Web frontend (React)** — same-origin fetch, session cookie + CSRF meta tag today. No API
key is needed to *authenticate* this traffic; per Section 5, cookie + same-origin is already the
strongest available first-party browser signal. If a client-visible identifier is wanted purely
for attribution parity with other consumers in a unified key/logging system, issue a single
publishable-style key (Section 1) baked into the page bundle — extraction is a non-event since it
grants nothing beyond current anonymous access. Critically, keep that key **out of the Varnish
cache key** for the ~15 cached `/api/*` GET patterns (Section 5); identify this slice via
edge-layer log/UA heuristics instead of a Django-level check that cache hits bypass, accepting
the brief's flagged undercounting rather than forcing a `pass` on high-traffic cached paths.

**2. Linker v3 embed** (cross-origin, runs on third-party sites' visitors' browsers, Referer/UA
only today) — the clearest fit for Section 4's per-site public-ID pattern. Issue each installing
site its own non-secret Linker key at self-serve install time, embedded in the snippet each
publisher pastes onto their page (mirrors GA/Segment/Sentry/Stripe/Intercom exactly). Layer
Section 2's origin binding on top: the browser will send a real, JS-unforgeable Origin header on
the Linker's cross-origin fetch, so pairing "timesofisrael's Linker key" with "expected to arrive
with `Origin: timesofisrael.com`" raises the bar from zero to "someone would have to deliberately
run a script posing as that site" (Section 7) — sufficient for attribution and abuse detection,
even though it's not unforgeable server-side. This directly resolves the brief's currently-opaque
11.5% "Linker on 3P sites" bucket into per-install-attributable traffic, with per-site
revoke/throttle independent of other installs.

**3. Sefaria MCP server** — bifurcate per Section 6, since the brief's single row hides two
different trust boundaries. Hosted mode is a legitimate internal caller and should carry a real,
non-extractable secret key from the same key-issuance system, flagged `internal=true` for relaxed
limits — not a bespoke mechanism, formalizing the existing `SEFARIA_BOT_API_KEY` pattern. Worth
resolving explicitly whether hosted-MCP traffic on behalf of external AI-agent end users should
carry a distinct identity from Sefaria's own internal hosted-MCP calls (functionally third-party
riding a server-side hop). Local-stdio mode has no embedded-secret capability (per the brief) and
is architecturally identical to any other untrusted-device client — treat it like the web
frontend or mobile app: publishable-style key at most, or fall back to UA/grace-period
identification.

**4. Mobile apps (RN)** — Section 3's device attestation is the textbook-correct heavyweight
answer but disproportionate for a nonprofit read API today (Section 3). Recommend the same
publishable-key model as the web frontend (Section 1): a non-secret, per-platform app key baked
into the RN bundle — extraction is expected and acceptable, especially since the brief already
notes the app is "decompilable/proxyable" regardless of what's done. Keep the existing JWT Bearer
auth for logged-in-user calls as the actual access-control boundary (Section 5's cookie-parallel
for mobile); the app key is attribution only. Revisit App Check/Play Integrity/App Attest as a
later lever specifically if mobile-client impersonation becomes a measured abuse/cost problem.

**5. Internal scripts** (legacy `SEFARIA_BOT_API_KEY`) — already correctly modeled as a genuine
server-held secret (Section 7's top tier), since it runs only on Sefaria-controlled
infrastructure that never reaches an untrusted device. The brief's flagged issues (plaintext
Mongo storage, unscoped, one-per-user `db.apikeys`) are secret-hygiene problems, orthogonal to
first-vs-third-party differentiation — recommend migrating this credential into whatever new
key-issuance system is built, marked `internal=true`, rather than redesigning its trust model.
(The `sefaria-eval` browser-fetch-hardcoded-to-prod row is the same shape as the web frontend —
publishable-key-if-wanted, otherwise low priority given its negligible traffic per the brief's
"identification-first" note.)
