# Survey: How Big Commercial Platforms Design API Keys & Developer Self-Serve

> Part of the sc-45692 API-key research (see [00-brief.md](./00-brief.md)). Surveys Stripe, GitHub,
> Google Cloud/Maps, OpenAI/Anthropic, Twilio/SendGrid, and AWS SigV4 for patterns Sefaria should
> borrow — with an eye toward the first-vs-third-party and browser-exposed-key problems described
> in the brief. Written July 2026; URLs inline per section.

## Executive summary

- **The load-bearing distinction across every platform is "what can a leaked key cost you," not
  "how well is it hidden."** Stripe (`pk_`) and Google Maps built key tiers explicitly designed to
  survive being fully visible in browser source; OpenAI, Anthropic, and Twilio never built that
  tier because every one of their calls spends metered money and has no safe floor. Sefaria's free,
  no-PII, low-marginal-cost read API sits on the Stripe/Maps side of that line for most traffic.
- **Google Maps' API-key model is the closest existing precedent to Sefaria's exact problem**: one
  flat key, no OAuth handshake, must live in browser JS/app bundles/server code, restricted by
  referrer/IP/app-bundle-id + API allowlist, with Google's own docs candidly admitting referrer
  restriction is best-effort attribution, not a security boundary — because browsers strip
  cross-origin referrers and the key is visible in the network tab regardless.
- **GitHub's prefix+CRC32-checksum token format is the cheapest high-leverage idea in the survey**:
  near-zero entropy cost, enables offline "is this shaped like a real key" validation before any
  database hit, and is a prerequisite for ever joining a secret-scanning partnership later.
- **Stripe's 7-day key-rotation overlap window** is the standout rotation UX — avoids coordinated
  cutovers — and its restricted-key (RAK) permission matrix, GitHub's fine-grained PAT scoping,
  Twilio's policy-object restricted keys, and SendGrid's simple 3-tier model are four different
  granularities of the same "scope the key narrower than the account" idea, useful as an
  escalation path (start SendGrid-simple, grow toward Stripe-granular only if bigger customers need it).
- **AWS SigV4 is the credible-but-wrong answer for Sefaria right now** — it eliminates on-the-wire
  secret exposure entirely via request signing, but requires infrastructure and client-side
  implementation complexity disproportionate to a mostly-anonymous, mostly-nonprofit consumer base
  and Sefaria's stated direction of reducing infra dependencies.
- Full synthesis mapping each pattern to Sefaria's five consumer types (browser, Linker, mobile,
  MCP, third-party long tail) is in §9; concrete candidate recommendations are in §10.

## 1. Stripe

Sources: [API keys](https://docs.stripe.com/keys), [Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys), [Best practices for managing secret API keys](https://docs.stripe.com/keys-best-practices), [Authentication](https://docs.stripe.com/api/authentication).

Stripe is the reference implementation for the **publishable/secret split**, and it's also mid-migration
toward a third tier that matters more for Sefaria: **restricted keys**.

- **Four key types, each with a distinct prefix**: `pk_` (publishable), `sk_` (secret, broad/legacy),
  `rk_` (restricted — Stripe's current recommendation for *all* new server-side integrations), and
  `sk_org_` (organization-level, spans multiple Stripe accounts). Every prefix also carries a mode
  segment: `pk_test_…` / `pk_live_…`, `sk_test_…` / `sk_live_…`, `rk_test_…` / `rk_live_…`.
- **Publishable keys are safe to ship in client code by design, not by obscurity**: they're scoped
  server-side to a fixed, narrow set of operations that can never move money or read sensitive data
  (e.g. tokenizing a card, creating a PaymentIntent client secret) — the *key itself* carries no
  broad privilege, so exposure is a non-event. This is the load-bearing idea for any "public key in
  the browser" design.
- **Restricted keys (RAKs) are secret keys with a self-defined permission scope** — read/write/none
  per API resource, chosen at creation time in the dashboard. Stripe's own guidance: build one RAK
  per integration surface (e.g. a refund-issuing key never gets customer-list read access) rather
  than one broad `sk_` key shared everywhere. This directly generalizes the brief's "differentiate
  first- vs third-party, account for client vs server-side callers" problem — scope-per-integration
  rather than scope-per-tier.
- **Access policies layer on top of scope**: any secret/restricted key can additionally be locked to
  an **IP CIDR range**, or an "advanced policy" combining allowed **ASNs**, allowed **countries**, and
  **blocked source classes** (VPNs, public proxies, residential proxies, Tor exit nodes) — combined
  with AND logic. This is a second axis (network origin) independent of the API-permission axis.
- **Test/live mode is a hard split baked into the prefix**, not a flag on the key: test-mode keys work
  only against sandboxed data, so an accidentally-leaked test key is low-stakes, and code can assert
  `key.startsWith('pk_live_')` before doing anything consequential.
- **Display-once for anything sensitive**: live secret and user-created live restricted keys are shown
  exactly once at creation ("you can't retrieve it later"); only Stripe-*generated* keys (e.g. the
  post-rotation replacement) can be re-revealed via an explicit "Reveal live key" action. Publishable
  keys are always visible (nothing to protect).
- **Rotation has a built-in overlap window**: "Rotate key" lets you pick an expiration — either
  immediate, or a specific date up to **7 days out** — during which *both* old and new keys are valid,
  so traffic can be migrated gradually and monitored to zero before the old key dies. This is the
  cleanest documented "zero-downtime key rotation" UX among the platforms surveyed.
- **Keys can go dormant**: a key unused for payouts/transfers for 180+ days loses that access and must
  be explicitly restored — a soft revocation-by-inactivity pattern.

## 2. GitHub

Sources: [Behind GitHub's new authentication token formats](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/) (engineering blog), [Introducing fine-grained personal access tokens](https://github.blog/security/application-security/introducing-fine-grained-personal-access-tokens-for-github/), [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

GitHub's 2021 token-format redesign is the canonical case study for **making secret-scanning cheap
and reliable via the token format itself**, independent of any lookup service.

- **Three-letter type prefix, `_`-delimited**: `ghp_` (personal access token), `gho_` (OAuth access
  token), `ghu_` (user-to-server, GitHub Apps), `ghs_` (server-to-server, GitHub Apps), `ghr_`
  (refresh token). First two letters identify the *issuer* (GitHub), third identifies *token kind*.
  The underscore is deliberately **not** a Base64 character — old opaque 40-char hex tokens could
  never collide-look-like a new-format token, and it doubles as a UX affordance (double-click
  selects the whole token instead of stopping at the separator).
- **Entropy went up, not down, despite adding a visible prefix**: prior OAuth tokens carried 160 bits
  of entropy (40 hex chars); the new format uses a 30-character Base62-encoded random payload,
  yielding ~178 bits — the prefix is metadata *layered on top of*, not carved out of, the secret
  material.
- **A 6-character trailing CRC32 checksum (Base62-encoded, zero-padded) enables fully offline
  validity screening**: GitHub's own secret-scanning partners (and GitHub itself scanning public
  repos) can compute the checksum locally and discard non-matching strings *before* ever calling
  GitHub's API to check revocation/validity. Combined with the prefix, this dropped projected
  false-positive rate to ~0.5%. This is the single most reusable idea for a small team: cheap,
  offline "is this even shaped like one of our keys" filtering, useful both for GitHub's own
  secret-scanning partnerships and for a lightweight internal leak-detector.
- **GitHub explicitly invites other platforms to copy the scheme** and join its secret-scanning
  partner program so leaked *third-party* tokens embedded in public GitHub repos get proactively
  revoked — a two-sided network effect (issuer defines format + revocation webhook; GitHub scans
  public code for matches).
- **Fine-grained PATs (the scoping model, separate from the format work)**: replace "this token can do
  everything this user can do" with per-token selection of (a) which repos/orgs it applies to and
  (b) a permission matrix per resource type (contents, issues, PRs, etc., each read/write/none), plus
  a **mandatory expiration**. Classic PATs (`ghp_`) remain non-expiring and account-wide by default —
  fine-grained is the escape hatch GitHub is steering everyone toward, mirroring Stripe's `sk_` → `rk_`
  push.

## 3. Google Cloud / Google Maps Platform

Sources: [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices),
[Adding restrictions to API keys](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys),
[Google Maps Platform best practices: Restricting API keys](https://mapsplatform.google.com/resources/blog/google-maps-platform-best-practices-restricting-api-keys/),
[Capping API usage](https://docs.cloud.google.com/apis/docs/capping-api-usage),
[Manage API keys](https://docs.cloud.google.com/docs/authentication/api-keys).

**This is the closest existing precedent to Sefaria's exact problem** — a single flat API key
that legitimately must sit in browser JS / app bundles / server code, with no OAuth handshake
available, used purely to attribute + rate-limit + occasionally bill, not to authenticate a user.

- **One key, two independent restriction axes**: *application restriction* (who/where is allowed to
  use this key — pick exactly one: HTTP referrer, IP address, Android package+SHA-1 fingerprint, or
  iOS bundle ID) and *API restriction* (which APIs/SDKs this key may call, a multi-select allowlist).
  A key is never left unrestricted in Google's own recommended posture — "API key restrictions are
  optional, but Google strongly recommends you restrict all API keys."
- **Google is unusually candid that referrer restriction is weak, not just imperfect**: their own
  security guidance states plainly that modern browsers "typically redact the `Referer` header in
  cross-origin requests, often stripping it down to the Origin" (or omitting it entirely), and that
  locally-loaded/hybrid-app/file:// contexts often send no referrer at all — meaning referrer
  restriction is a **best-effort attribution/abuse-slowing signal, not a security boundary**. The key
  itself is always fully visible in browser source and network tab regardless of restriction; the
  restriction only limits *where a stolen copy of the key can still be used from*.
- **Explicit layered-defense framing, not "the referrer lock solves it"**: Google's own guidance
  recommends stacking referrer/IP/app restriction + API restriction + **quota monitoring for
  anomaly detection** + **splitting client-side and server-side usage into separate projects** so
  different quota ceilings apply +, for client-side calls to APIs with no JS SDK, **proxying through
  your own backend** so the raw key never reaches the browser at all.
- **Mobile app restriction is a structurally stronger analog to Sefaria's mobile-app problem**:
  Android restriction pins a key to a package name **and** the app's signing certificate's SHA-1
  fingerprint (not just a bundle ID string, which is trivially spoofable) — a decompiled/repackaged
  APK with a different signing key is rejected server-side. iOS restriction pins to bundle ID only
  (sent via `X-Ios-Bundle-Identifier` header) — a substantially weaker check, and Google's guidance
  doesn't pretend otherwise.
- **Key ⇒ project ⇒ quota/billing, not key ⇒ user**: an API key's sole job is to associate a request
  with a *Cloud project* for quota and billing attribution — there's no notion of the key "being" an
  identity beyond that. Up to 300 keys per project, up to 1200 application-restriction entries per
  key, keys have an optional display name set at creation for self-serve organization.
- **No client secret at all in this model** — API keys here are the "publishable key" concept taken
  to its logical extreme: a single bearer value, not a keypair, whose entire security model rests on
  restriction + quota + monitoring rather than secrecy. This works because a leaked Maps key can at
  worst run up someone else's bill / count against someone else's quota, not exfiltrate data or
  impersonate a user — same risk shape as Sefaria's public read API.

## 4. OpenAI / Anthropic

Sources: [OpenAI API Key Format explainer](https://vibekit.bot/openai-api-key-format), [List project API keys — OpenAI API Reference](https://platform.openai.com/docs/api-reference/project-api-keys/list), [OpenAI API key hygiene for AI agents](https://authsome.ai/blog/openai-api-key-hygiene-for-ai-agents-project-keys-restricted-keys-and-what-an-agent-should-actua), [Anthropic API Key Format anatomy](https://bip39-phrase.com/anthropic-api-key-format/), [Anthropic Console API keys](https://console.anthropic.com/settings/keys).

Both LLM API vendors converged on the same shape: **Org → Project/Workspace → Key**, with the
*container* — not the individual key — carrying budget, rate limit, and model-access policy.

- **OpenAI's prefix encodes both issuer and key class**: `sk-proj-…` (default since mid-2024,
  scoped to one Project inside an Org — the project owns its own rate limit, spend cap, and billing
  line, so rotating a key inside a project doesn't reset those), `sk-svcacct-…` (service-account key,
  same capability as a project key but not tied to a human's identity — meant for CI/CD, background
  workers, agents), and `sk-admin-…` (manages projects/members/billing via the Admin API but
  explicitly **cannot** call inference endpoints — a structural separation of "manage the account"
  from "spend the account's money"). Legacy unscoped `sk-…` keys still work but are deprecated.
- **Anthropic mirrors the same layering with `sk-ant-api03-…`**: `sk` (secret key, industry-standard
  signal), `ant` (issuer), `api03` (a generation marker, i.e. the format itself is versioned so a
  future redesign doesn't have to guess what's live). Org → Workspace → Key, and a key is minted
  *inside* a specific workspace — it can only generate charges against that workspace's budget, so
  compartmentalizing "Research" spend from "Production" spend is a workspace boundary, not a
  per-key flag.
- **Both vendors push rotation as a named workflow, not an emergency-only action**: Anthropic's
  guidance recommends quarterly rotation as routine hygiene (create new key with a descriptive name
  → cut over → verify → revoke old), independent of compromise. This is the "rotation as calendar
  habit" framing, complementary to Stripe's "rotation as incident response with overlap window."
- **Neither vendor exposes a client-side/publishable key concept** — there's no LLM-API equivalent
  of Stripe's `pk_`/Maps' unrestricted browser key, because every call is metered, costs real money
  per token, and a leaked key is a direct financial-abuse vector with no natural ceiling. This is
  the strongest argument in the survey for *why* Sefaria's read API (near-zero marginal cost per
  request, no PII) is closer to the Maps/Stripe-publishable model than to the OpenAI/Anthropic model.

## 5. Twilio / SendGrid

Sources: [Twilio API keys overview](https://www.twilio.com/docs/iam/api-keys), [Twilio Key Resource v1](https://www.twilio.com/docs/iam/api-keys/key-resource-v1), [SendGrid API Keys](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys), [SendGrid API Key permissions](https://www.twilio.com/docs/sendgrid/api-reference/api-key-permissions).

Twilio (and its SendGrid subsidiary, same auth philosophy) is the clearest **SID + secret**
(public identifier / private secret pair) precedent in the survey, distinct from prefix-only
single-string keys.

- **Account SID and Auth Token are the root credential, explicitly discouraged in production**:
  Twilio's own docs frame the account-level Auth Token as fine for local testing but risky for
  production — the recommended production credential is a scoped **API Key**, minted separately.
- **API Keys are SID+secret pairs, not single strings**: the SID (`SK[0-9a-fA-F]{32}`, always
  34 chars, structurally an *identifier* — safe to log, reference in support tickets, display in a
  UI) is paired with a **secret returned exactly once at creation and never retrievable again** —
  "Twilio returns the secret field only when the API key is first created and never includes the
  secret field when you fetch the resource." Auth uses HTTP Basic with SID as username, secret as
  password. This SID/secret split is functionally the same "safe-to-reference public half /
  display-once private half" pattern as Stripe's key-ID-in-dashboard-with-hidden-secret, just
  modeled as two fields instead of one opaque string.
- **Three key types**: Main (full account privileges, essentially the root token reissued as a
  named key), Standard (broad but not full), and **Restricted**, which requires an explicit
  `policy` object at creation enumerating allowed methods per resource — same permission-matrix
  idea as Stripe RAKs / GitHub fine-grained PATs.
- **Multiple named keys per account, one per developer/subsystem** is explicit guidance — "you can
  issue separate API keys to different developers or different subsystems within your application,"
  i.e. the SID becomes a natural attribution unit for "which integration made this call" independent
  of who owns the account.
- **SendGrid's simpler three-tier model** (Full Access / Restricted-Custom Access / Billing Access,
  mutually exclusive — a key is never both billing-capable and data-capable) is a useful minimal
  reference for a *small* scope taxonomy when a full permission matrix is overkill: just enough
  buckets to separate "can spend money / see billing" from "can do the actual work."

## 6. AWS SigV4 (brief)

Sources: [AWS Signature Version 4 for API requests](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv.html), [Authenticating Requests (SigV4) — S3](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html).

Included as the heavyweight end of the spectrum, mostly to explain **why Sefaria should not go
here**.

- Credentials are an **access key ID + secret access key** pair, but the secret is *never sent on
  the wire at all* — each request derives a per-date/per-service/per-region **signing key** from the
  secret (via nested HMAC), builds a canonical representation of the exact request bytes (method,
  path, headers, query, payload hash), signs *that*, and attaches the signature via an
  `Authorization` header or query params. The server independently recomputes the same signature
  and compares.
- Requests carry a timestamp and are rejected if received more than ~5 minutes outside it — replay
  protection is built into the protocol, not bolted on.
- This eliminates "secret leaks because it was in a request log or a browser network tab" as a risk
  class entirely — the secret truly never leaves the signing party — at the cost of: every client
  needs a correct SigV4 implementation (canonicalization is notoriously fiddly), clock sync matters,
  and it is unusable directly from a browser for a public-read API without still shipping *some*
  credential to derive the signing key from, which recreates the original problem one level down.
  AWS's answer for browser contexts is STS temporary credentials / Cognito identity pools issuing
  short-lived scoped credentials — i.e. push the hard problem onto a token-vending service.
- **Not a realistic target for Sefaria**: the brief's constraint list (no Lua at nginx, stock Envoy,
  small team, "prefer industry standards over custom solutions," Flanksource actively *reducing*
  infra) argues against building or operating request-signing infrastructure for a mostly-anonymous,
  mostly-nonprofit consumer base. Flagged here only so the option is documented and consciously
  rejected rather than never considered.

## 7. Cross-cutting patterns

### 7.1 Key format conventions (prefixes, entropy, checksums)

Every platform surveyed except AWS uses a **human-readable prefix + opaque random payload**, and
the prefix design converges on the same three jobs:

1. **Identify the issuer** (`sk_`→Stripe implied by context, `ghp_`→GitHub, `sk-ant-`→Anthropic,
   `SK`→Twilio) so a string found in a log/scan is instantly attributable without a lookup.
2. **Identify the key class/generation in-band** (Stripe `pk_`/`sk_`/`rk_`, OpenAI
   `sk-proj-`/`sk-svcacct-`/`sk-admin-`, GitHub `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`, Anthropic's
   `api03` generation marker) — so validation code, docs, and support tooling can branch on the
   prefix alone, and a future format change doesn't require guessing what's live.
3. **Use a separator that can't collide with the random payload's alphabet** — GitHub deliberately
   picked `_` because it's not a Base64 character, so no legacy opaque hex/Base64 token could ever
   look like a new-format token, and it's a free UX win (double-click selects the whole token).

GitHub is the only platform that publishes a **checksum**: a 6-char CRC32 (Base62-encoded) trailing
the payload, enabling fully offline "is this even shaped like a real token" validation before any
network call — the mechanism that makes their secret-scanning false-positive rate ~0.5%. Adding a
prefix did **not** cost GitHub entropy: they simultaneously moved from 160 to ~178 bits by switching
to a denser Base62 payload encoding. The lesson: format metadata (prefix + checksum) is close to free
if the random payload is generated with enough bits and a dense encoding.

### 7.2 Publishable vs secret dichotomy

The deepest pattern in the survey, and the one most directly relevant to Sefaria's browser/Linker
problem: **some platforms have a key type designed to be safely exposed, and some don't — and the
difference is about what the key can *do*, not how well it's hidden.**

- Stripe's `pk_` and Google's Maps browser key are safe to ship client-side because they are
  *scoped server-side* to operations that cannot move money, read PII, or exceed a bounded blast
  radius — the exposure is priced into the design, not prevented.
- OpenAI and Anthropic have **no such tier** — every key spends metered money per call, so every
  key must live server-side; there is no LLM-API concept of a "publishable" key.
- Twilio/SendGrid sit in between: Restricted API keys can be scoped narrowly enough to be
  low-stakes, but Twilio doesn't frame any tier as "designed for the browser" — it's still a
  server-side secret in a SID/secret pair.

Sefaria's public read API — free, no PII, near-zero marginal cost per request — is architecturally
closer to Stripe-publishable/Maps than to OpenAI/Anthropic. That argues for treating *most* of
Sefaria's key surface as the "safe to expose, restriction-not-secrecy" tier, reserving a genuinely
secret, revocable tier for write endpoints and higher-trust partners.

### 7.3 Key restriction mechanisms (referrer / IP / bundle-id / scopes)

Two independent axes recur across every platform:

- **Where the request may come from** (network/client-identity restriction): HTTP referrer allowlist,
  IP/CIDR allowlist, ASN/country allow-block, Android package+SHA-1 fingerprint, iOS bundle ID,
  Stripe's combined ASN+country+proxy-class policy.
- **What the request may do** (permission restriction): Stripe RAK's per-resource read/write matrix,
  GitHub fine-grained PAT's per-repo + per-resource-type matrix, Twilio Restricted key's policy
  object, SendGrid's three-tier Full/Restricted/Billing split, Google's API-restriction allowlist of
  which APIs/SDKs a key may call.

Google's guidance is the most explicit about a subtlety worth internalizing: **application
restriction (referrer/IP/bundle-id) is an *attribution and abuse-slowing* control, not a secrecy
control** — the key is fully visible in the browser regardless. Android's package+fingerprint check
is the one meaningfully strong client-side restriction in the survey (a repackaged/decompiled app
with a different signing cert fails), because it validates something the attacker can't forge
without the original signing key; referrer and iOS bundle-ID checks validate something trivially
spoofable by a determined attacker and are best understood as raising the bar for casual copy-paste
misuse, not as cryptographic proof of origin.

### 7.4 Rotation & display-once UX

Two rotation philosophies:

- **Overlap-window rotation** (Stripe): old and new key both valid for a bounded grace period
  (default up to 7 days), so traffic migrates gradually with zero downtime and the deprecation is
  monitorable (watch old-key traffic drop to zero before hard-expiring it).
- **Rotation as calendar hygiene** (Anthropic/OpenAI convention): create new key with a descriptive
  name → cut over → verify → revoke old, recommended on a recurring cadence (e.g. quarterly)
  independent of any suspected compromise.

**Display-once is close to universal for anything secret-capable**: Stripe live secret/restricted
keys, Twilio API key secrets, OpenAI/Anthropic keys are all shown exactly once at creation and
never retrievable again — only re-mintable. Publishable/Maps-style keys are the exception: always
visible, because there's nothing to protect.

### 7.5 Self-serve portal features

Converged minimum feature set across Stripe/GitHub/OpenAI/Anthropic/Twilio dashboards: **a
developer-chosen name/label, creation date, scope/permission summary, and (increasingly) a
last-used timestamp** — the last of these is called out repeatedly in current API-key-management
guidance as table stakes once a user holds more than one or two keys, because a list of identical
masked strings with no dates or labels makes rotation and cleanup impossible. Programmatic issuance
(API/CLI-driven key creation, not just a dashboard button) is increasingly expected so internal
automation and CI can self-serve scoped credentials without a ticket.

### 7.6 Secret-scanning programs

GitHub's **secret scanning partner program** is the ecosystem-scale version of the prefix+checksum
idea: 100+ providers (AWS, Stripe, Twilio, SendGrid, Google Cloud, OpenAI, Anthropic, npm, PyPI,
Slack, Shopify, and others) register their token format with GitHub; GitHub scans public repos and
public package registries (npm, etc.) for matches and notifies the issuing provider, who validates
and revokes/rotates/contacts the affected developer. Participation requires the provider to (a) have
a detectable, low-false-positive token format — which is precisely what the prefix+checksum
convention buys — and (b) run a revocation/notification service GitHub can call. This is a credible,
low-build-cost lever for Sefaria *if* a formatted-key scheme is adopted: the format work is the same
work needed for internal validation either way, and joining the partner program later is additive,
not a redesign.

### 7.7 Client-side keys in the browser — the canonical answer

The industry's converged answer to "how do you put an API key in code that runs in an untrusted
browser" is **not** "hide it better" — it's:

1. Issue a **key class that is safe to lose** (scoped to only what must be exposed — read-only,
   narrow resource set, no spend/mutation capability).
2. Apply a **restriction** (referrer allowlist and/or origin check) as a best-effort abuse-slowing
   and attribution signal, explicitly *not* claimed as a security boundary.
3. **Monitor quota/usage for anomalies** rather than relying on the restriction to be airtight.
4. For any client-side call that *does* need a real secret (an API with no safe client-scoped
   equivalent), **proxy it through your own backend** so the secret never reaches the browser.
5. Accept that a determined attacker can always harvest and reuse a browser-shipped key from
   *some* origin the restriction permits — the goal is raising cost and enabling detection/response,
   not making exfiltration impossible.

This is exactly Google's documented Maps-key posture, and it maps directly onto Sefaria's Linker
problem: a Linker key would be visible on every third-party page that embeds it and cannot be kept
secret, so the only coherent design is "scope it to do nothing worth stealing, restrict+monitor for
abuse, and treat it as an attribution/rate-limit tool, not an auth boundary."

## 8. Comparison table

| Platform | Client-safe key tier? | Format example | Restriction mechanism | Permission scoping | Rotation UX | Display-once | Checksum |
|---|---|---|---|---|---|---|---|
| **Stripe** | Yes — `pk_` | `pk_live_51H…`, `sk_live_…`, `rk_live_…` | IP CIDR, ASN, country, proxy-class policy | RAK: per-resource read/write matrix | 7-day overlap window | Secret/RAK: yes; publishable: no | No |
| **GitHub** | No (all tokens are bearer-secrets) | `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` + 30-char Base62 + 6-char checksum | N/A (scope-based, not network) | Fine-grained PAT: per-repo/org × per-resource matrix; classic PAT: account-wide | Manual; fine-grained PATs mandate expiration | Yes, always | Yes — CRC32, Base62 |
| **Google Cloud / Maps** | Yes — the whole model is client-safe-by-restriction | single opaque string, no public prefix convention | Referrer, IP, Android pkg+SHA-1, iOS bundle ID (pick one) + API allowlist | API/SDK allowlist per key | Manual; no built-in overlap window | No — always visible | No |
| **OpenAI** | No | `sk-proj-…`, `sk-svcacct-…`, `sk-admin-…` | None (server-side only) | Project/workspace = budget & rate-limit container; admin keys can't call models | Manual, recommended calendar cadence | Yes | No |
| **Anthropic** | No | `sk-ant-api03-…` | None (server-side only) | Workspace = budget container | Manual, recommended quarterly | Yes | No (generation marker only) |
| **Twilio** | No | SID `SK[0-9a-f]{32}` + secret | None (server-side only) | Main / Standard / Restricted (policy object) | Manual | Secret: yes; SID: always visible (it's an identifier) | No |
| **SendGrid** | No | opaque string | None (server-side only) | Full / Restricted-Custom / Billing (mutually exclusive) | Manual | Yes | No |
| **AWS SigV4** | N/A — no static key on the wire at all | access key ID + derived signing key (never transmitted) | Request signature ties to exact request bytes + 5-min time window | IAM policy (arbitrarily granular) | Manual key rotation; signing key itself is ephemeral per-request | Secret access key: yes, shown once | No (cryptographic signature instead) |

## 9. Synthesis — mapping to Sefaria

The recurring theme: platforms that split "client-safe" from "secret" keys do so based on **what a
leaked key can cost them**, not on architectural purity. Sefaria's read API (free, no PII, low
marginal cost) sits on the low-stakes end of that spectrum for most traffic, but the brief's own
consumer table shows the trust tiers already vary by consumer — the design should vary with it too.

### 9.1 Browser frontend (React, same-origin)

Already authenticated by session cookie + CSRF for anything that matters; an API key here would
serve identification/attribution, not access control. This is the Stripe-`pk_`/Maps pattern in its
simplest form: a low-privilege, always-visible, referrer-or-origin-restricted key baked into the
page, whose only job is to let Sefaria's own web traffic self-identify cleanly in logs (separating
it from the ~15% genuinely-external traffic the brief flags). Because it's same-origin, an
`Origin`/`Referer` check at nginx (already CORS-aware) is cheap to enforce and hard to spoof for
this specific consumer — no new client-identity mechanism is needed, just a static header/key added
to requests already carrying cookies.

### 9.2 Linker v3 embed (cross-origin, runs on third-party pages)

This is structurally identical to Google's canonical "public key in the browser" case: the key runs
on visitors' browsers on *arbitrary third-party origins*, cannot be kept secret, and referrer
restriction will be unreliable exactly as Google's own docs admit (cross-origin fetches often strip
`Referer` to bare origin or omit it; embeds loaded in odd contexts may send none at all). The
coherent design, per §7.7: scope a Linker key to read-only, low-blast-radius endpoints only (the
brief already ranks `api/strapi`/`api/background-data`/`api/profile` as lowest-blast-radius and
`api/calendars`/`api/sheets` as highest external-dependency — Linker's key should probably not even
need the highest-risk ones), treat referrer/origin as an attribution signal feeding
quota-monitoring rather than a hard gate, and consider a lightweight **embedder registration** step
(a self-serve "register your domain" akin to Maps' website restriction) so legitimate embedding
sites are known even though the key itself can't be hidden from their visitors.

### 9.3 Mobile apps (RN, decompilable)

The brief already correctly notes mobile apps are "No (decompilable/proxyable)" for secrets — this
matches Google's own candor that iOS bundle-ID restriction is weak and only Android's
package+signing-cert-fingerprint check is meaningfully strong. Realistic options, in order of
effort: (a) ship a low-privilege key scoped like the Linker key (accept it's extractable, treat
restriction as abuse-slowing only); (b) layer platform attestation (Play Integrity API / Apple
DeviceCheck) as a *future* lever if mobile abuse becomes a real problem — this is out of scope for
the current low-effort/identification-first phase but worth flagging as the next rung up, since it's
the only mechanism in this survey that cryptographically ties a request to a genuine app install
rather than a copy-pasted key. JWT Bearer already covers the logged-in-user case per the brief and
needs no change.

### 9.4 Sefaria MCP server (server-side, hosted vs local-stdio)

Hosted mode is genuinely server-side and secret-capable — this is the one Sefaria consumer that maps
cleanly onto the OpenAI/Anthropic/Twilio server-side-secret model: a real, revocable, scoped,
display-once key held in Sefaria's own infrastructure, rotated on a calendar cadence per §7.4.
Local-stdio mode runs on a third party's machine with no secret-capable boundary, structurally like
a mobile app or a self-hosted CLI tool — the OpenAI/Anthropic convention for this exact situation is
**the user supplies their own API key via an env var**, i.e. push key custody onto the developer
running the MCP server rather than embedding a Sefaria-owned secret in distributable code. That
also means local-stdio MCP users are a natural first cohort for a self-serve key-issuance portal.

### 9.5 Third-party server-side consumers (the long tail + AI scrapers)

This is the segment every commercial platform surveyed builds its heaviest tooling for: a self-serve
portal issuing named, scoped (read-only by default), display-once, revocable/rotatable keys, with
usage visible per key (borrowing §7.5's converged minimum: name, created date, scope, last-used).
For the uncontactable/anonymous scraper traffic the brief flags (e.g. the 823k req/day Supabase/Deno
backend), the realistic lever isn't a key at all in the near term — it's the **anonymous grace
period** the brief already anticipates, run the way Google frames layered defense: keep serving
unauthenticated traffic, but monitor and rate-limit by IP/UA fingerprint for anomalies, and treat
"requires a key" as a deadline communicated in advance (Stripe's rotation-deadline UX and GitHub's
classic-PAT deprecation-by-steering are both examples of "the old path keeps working until a
communicated date, then it doesn't" — a pattern Sefaria can reuse for the anonymous→keyed
transition itself, not just for key rotation).

## 10. Recommendations for Sefaria (candidate patterns to borrow)

1. **Adopt a prefixed key format with a trailing checksum, GitHub-style**, e.g. `sfk_` + a type
   letter + a dense random payload + a short CRC-style checksum. This is nearly free (format
   metadata doesn't cost meaningful entropy if the payload is generated with enough bits) and buys
   three things at once: instant issuer/type identification in logs, cheap offline validity
   pre-checks (reject malformed keys before a Mongo/lookup hit), and — if ever useful — eligibility
   to join GitHub's secret-scanning partner program later without redesigning the format.
2. **Split key classes by consequence, not by consumer identity**: a "public/attribution" tier
   (Stripe-`pk_`/Maps-style — safe to expose, restriction is best-effort, scope limited to
   low-blast-radius read endpoints) for browser, Linker, and mobile; a "secret/server" tier
   (Twilio/OpenAI-style — display-once, revocable, scoped, held only server-side) for hosted-MCP,
   internal automation, and third-party server-side partners. This maps directly onto the brief's
   "Secret-capable?" column without inventing a new taxonomy.
3. **Treat referrer/origin restriction as attribution, not security**, matching Google's own
   published stance — don't let the design imply a hard security guarantee that browsers can't
   actually provide (cross-origin `Referer` stripping is a browser-vendor decision, not a Sefaria
   engineering gap to fix).
4. **Borrow Stripe's overlap-window rotation** (old + new key both valid for N days) for the
   secret-capable tier specifically — it's the only rotation UX in the survey that avoids a
   coordinated-cutover support burden, which matters given Sefaria's stated preference for low
   ongoing ops cost.
5. **Self-serve portal minimum viable feature set**, per the converged pattern in §7.5: developer-
   chosen name, scope (start with a single "read" scope; a matrix can wait), creation date,
   last-used timestamp, one-click revoke, one-click rotate. Skip building a full Stripe/GitHub-grade
   permission matrix on day one — SendGrid's 3-tier model (not a full matrix) is the right *minimum*
   ambition level given "mostly hobbyist/nonprofit consumers today."
6. **Explicitly reject AWS SigV4-style request signing** for this phase — it solves a problem
   Sefaria doesn't have (no PII, no spend-per-call) at a cost (client-side signing implementations,
   clock-sync, canonicalization bugs) the brief's infra constraints (no Lua at nginx, Flanksource
   reducing dependencies) can't absorb. Revisit only if/when a "bigger customer" genuinely needs
   request-integrity guarantees beyond what a scoped, rate-limited key provides.
7. **Model the anonymous→keyed transition on the industry's "communicated deadline, not a cliff"
   pattern** (Stripe rotation deadlines, GitHub classic-PAT deprecation): identify first via
   optional/soft-encouraged keys during the grace period the brief already calls for, then convert
   the deadline into enforcement the same way Stripe expires an unrotated key on a chosen date —
   giving both Sefaria and its long-tail consumers a predictable, low-drama cutover.

## Sources

- Stripe: [API keys](https://docs.stripe.com/keys) · [Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys) · [Best practices for managing secret API keys](https://docs.stripe.com/keys-best-practices) · [Authentication](https://docs.stripe.com/api/authentication)
- GitHub: [Behind GitHub's new authentication token formats](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/) · [Introducing fine-grained personal access tokens](https://github.blog/security/application-security/introducing-fine-grained-personal-access-tokens-for-github/) · [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) · [Secret scanning partner program](https://docs.github.com/code-security/secret-scanning/secret-scanning-partnership-program/secret-scanning-partner-program) · [About secret scanning for partners](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning-for-partners)
- Google Cloud / Maps: [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices) · [Adding restrictions to API keys](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys) · [Google Maps Platform best practices: Restricting API keys](https://mapsplatform.google.com/resources/blog/google-maps-platform-best-practices-restricting-api-keys/) · [Capping API usage](https://docs.cloud.google.com/apis/docs/capping-api-usage) · [Manage API keys](https://docs.cloud.google.com/docs/authentication/api-keys)
- OpenAI: [OpenAI API Key Format explainer](https://vibekit.bot/openai-api-key-format) · [List project API keys — API Reference](https://platform.openai.com/docs/api-reference/project-api-keys/list) · [OpenAI API key hygiene for AI agents](https://authsome.ai/blog/openai-api-key-hygiene-for-ai-agents-project-keys-restricted-keys-and-what-an-agent-should-actua)
- Anthropic: [Anthropic API Key Format anatomy](https://bip39-phrase.com/anthropic-api-key-format/) · [Claude Console — API keys](https://console.anthropic.com/settings/keys)
- Twilio / SendGrid: [Twilio API keys overview](https://www.twilio.com/docs/iam/api-keys) · [Twilio Key Resource v1](https://www.twilio.com/docs/iam/api-keys/key-resource-v1) · [SendGrid API Keys](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys) · [SendGrid API Key permissions](https://www.twilio.com/docs/sendgrid/api-reference/api-key-permissions)
- AWS: [AWS Signature Version 4 for API requests](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv.html) · [Authenticating Requests (SigV4) — Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html)
- Cross-cutting: [Zuplo — API Key Best Practices for 2026](https://zuplo.com/blog/api-key-best-practices) · [Zuplo — API Key Week Wrap Up](https://zuplo.com/blog/api-key-week-wrap-up)
