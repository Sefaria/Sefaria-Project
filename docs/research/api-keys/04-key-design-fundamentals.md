# API Key / Token Design — Technical Fundamentals and Standards

> Research doc for sc-45692 (epic "Track off-Platform Data Usage"). Read against
> `00-brief.md`. Scope: technical fundamentals of API key/token design — taxonomy,
> transport, generation/format, storage, relevant standards, common pitfalls, and
> Django/Python building blocks. Not Sefaria-specific decisions (those live in the
> ADR); this doc ends with a "recommendations distilled for Sefaria" section that
> maps the fundamentals onto Sefaria's constraints.

## 1. Token taxonomy: which mechanism for which job

Four mechanisms come up whenever "API key" gets discussed; they solve different problems and are
not interchangeable.

**Opaque bearer keys** — a random string with no embedded structure, looked up server-side against
a stored (hashed) value. This is what "API key" means in ~90% of public-API contexts (Stripe,
GitHub, SendGrid, OpenAI). It identifies *an application/integration*, not a human user, has no
built-in expiry semantics, and is cheap to implement: generate, hash, store, compare on each
request. [RapidAPI's State of APIs work is cited as putting API-key usage at roughly two-thirds of
public APIs](https://www.scalekit.com/blog/apikey-jwt-comparison).

**JWT (JSON Web Token)** — a signed (optionally encrypted), self-contained, structured claim set.
The point of a JWT is that a resource server can verify it *without a database round-trip or a call
to an issuer* — the signature is enough. That property is valuable for short-lived, frequently
re-issued *user*-session tokens in stateless/microservice architectures (mobile app login, SPA
session), not for long-lived machine credentials: JWTs are awkward to revoke early (you need a
denylist, which reintroduces the state you were trying to avoid) and carry no more inherent secrecy
than an opaque key of equivalent random entropy. [Comparison writeups converge on: JWT for
user-identity/session tokens that must be stateless and verifiable without a DB hit; opaque keys for
long-lived machine/service identity](https://navanathjadhav.medium.com/api-keys-vs-jwt-vs-oauth-which-should-you-use-da51c461f554).
Sefaria already uses JWT (simplejwt) for logged-in mobile users per the brief — that's the
correct use case; it should not be conflated with the separate "identify which app/service is
calling" problem this research is about.

**OAuth2 client-credentials grant** — a *protocol*, not a token format. It exists to let a
service authenticate itself to an authorization server and receive a short-lived, scoped access
token (usually a JWT or opaque token) without ever transmitting a long-lived secret on every call.
Its value proposition is (a) centralized token issuance/introspection/revocation infrastructure,
(b) fine-grained, potentially delegated scopes, (c) short token lifetimes reducing blast radius of
leakage. It is the right answer when there's already an OAuth authorization server, when
third parties need delegated (on-behalf-of-user) access, or when enterprise customers require it
contractually. It is overkill — extra infrastructure, extra hop, extra ops burden — for the "which
app is calling my read API" identification problem: [Auth0's own migration guide argues for OAuth2
over static API keys specifically for scenarios needing scoped, revocable,
short-lived credentials](https://auth0.com/blog/why-migrate-from-api-keys-to-oauth2-access-tokens/),
not as a blanket replacement for simple identification.

**HMAC request signing** — the client and server share a secret; instead of transmitting the
secret, the client signs the request (commonly the body, sometimes headers/timestamp too) and sends
the signature. The server recomputes and compares. This is the dominant pattern for **webhooks**
(inbound, server-to-server, no human/browser involved) because it authenticates the *payload*, not
just the caller, and is replay-resistant when combined with a timestamp
— [HMAC-SHA256 with timestamp validation is described as "the industry standard," used by roughly
65% of webhook implementations](https://www.hooklistener.com/learn/webhook-signing-hmac-verification-best-practices).
It's a poor fit for a read-heavy, GET-dominated, browser-and-server-mixed API surface like
Sefaria's: signing requires the caller to implement a signing routine per language/SDK (friction for
hobbyist developers), and it buys payload-integrity guarantees that a GET-only public read API,
served over TLS, doesn't especially need.

**Consensus for plain "identify the caller" read APIs**: nearly every practitioner source agrees
that for read-only or low-privilege public APIs where the point is caller identification and
coarse quota/analytics — not delegated user authorization — an opaque bearer key is sufficient and
is what the majority of comparable APIs (Stripe read endpoints, GitHub's unauthenticated-vs-keyed
rate limits, most REST-API-as-a-product companies) actually ship. Reach for JWT when you need
stateless verification of *user* identity; reach for OAuth2 when a third party needs delegated,
scoped, revocable access to *someone else's* resources; reach for HMAC when you need to authenticate
a payload rather than a caller (webhooks). None of those conditions describe "which project is
calling api/texts."

Sources:
[OAuth2 Access Tokens vs API Keys — Using JWTs (Medium)](https://medium.com/@robert.broeckelmann/oauth2-access-tokens-vs-api-keys-using-jwts-651f97df9e19),
[API Keys vs JWT vs OAuth (Medium)](https://navanathjadhav.medium.com/api-keys-vs-jwt-vs-oauth-which-should-you-use-da51c461f554),
[API key vs JWT: Secure B2B SaaS with modern M2M authentication (Scalekit)](https://www.scalekit.com/blog/apikey-jwt-comparison),
[Why You Should Migrate to OAuth 2.0 From API Keys (Auth0)](https://auth0.com/blog/why-migrate-from-api-keys-to-oauth2-access-tokens/),
[Webhook Signing & HMAC Verification Best Practices (Hooklistener)](https://www.hooklistener.com/learn/webhook-signing-hmac-verification-best-practices),
[HMAC vs API Keys for Webhook Auth (WebhookVault)](https://www.webhookvault.com/blog/webhook-authentication-methods-hmac-vs-api-keys).

## 2. Transport: where the key travels

Three real options, one clear standards-based winner for browser-adjacent traffic, with a genuine
caching wrinkle that matters for Sefaria specifically.

**`Authorization: Bearer <token>` (RFC 6750)**. Written for OAuth2 but by convention reused for any
bearer credential. [RFC 6750 defines exactly three transmission methods — the Authorization header
(resource servers MUST support it, clients SHOULD prefer it), a form-encoded body parameter (only
allowed under narrow content-type conditions), and a URI query parameter (explicitly discouraged,
"included for completeness," meant for legacy clients only)](https://datatracker.ietf.org/doc/html/rfc6750).
Practical advantages: it's a registered HTTP mechanism client libraries and API tooling (Postman,
OpenAPI, curl `-H`) understand natively without documentation; and — significant for a CDN-fronted
stack — [a response is not implicitly cached by shared caches when it varies on/contains an
Authorization header, whereas caching infrastructure does not automatically treat `X-Api-Key`-bearing
requests as private](https://www.codestudy.net/blog/place-api-key-in-headers-or-url/), meaning
Authorization gets safer default behavior from intermediate caches that don't know your app's
semantics.

**`X-Api-Key` custom header**. Extremely common in practice (AWS API Gateway, many SaaS APIs) despite
not being a registered standard. Functionally similar to Authorization for logging/caching purposes
as long as it's *configured* correctly, but that configuration is the caller's/operator's
responsibility rather than the platform default, and it doesn't get automatic tooling recognition —
[API documentation/client tooling doesn't know what a custom header means without explicit
annotation](https://www.codestudy.net/blog/place-api-key-in-headers-or-url/). Its main practical
advantage over Authorization is semantic clarity when a service accepts *both* a user
Authorization/session credential and a separate app-identifying key concurrently — the two headers
don't collide or need multiplexing into one scheme string.

**Query parameter (`?api_key=...` / `?apikey=...`)**. Legacy Sefaria's `apikey` POST/query param
falls here. Universally discouraged in current guidance: [OWASP's REST Security Cheat Sheet says
plainly that passwords, security tokens, and API keys must not appear in the URL because they get
captured in web server logs](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html),
and beyond logs, query-string keys leak via browser history, Referer headers on outbound links,
proxy/CDN access logs, and shoulder-surfed/shared URLs. The one place query params remain
defensible is exactly the scenario the brief flags: **cache-key fragmentation**. Sefaria's Varnish
layer keys its cache purely on URL; a header-carried credential is invisible to Varnish and can't
fragment the cache (so metering built only on Django-level header inspection silently undercounts
cache-hit traffic), while a *query-param*-carried key would fragment the Varnish cache per key
automatically, at the cost of reintroducing all the logging/leakage problems above and shrinking
cache-hit rates. This is a real architecture-level tradeoff to flag for the ADR, not a settled
technical-standards question — the standards are unanimous that keys don't belong in URLs, but
Sefaria's specific cache topology creates a countervailing engineering pressure most companies
citing that guidance don't have.

**CORS preflight interaction** (relevant because Linker embeds run cross-origin from third-party
sites and CORS is currently wildcard-open at nginx per the brief). A cross-origin `fetch`/XHR is a
"simple request" — no preflight `OPTIONS` round-trip — only if it uses GET/HEAD/POST with a small
whitelisted header set (`Accept`, `Accept-Language`, `Content-Language`, `Content-Type` restricted to
a few MIME types) and no other custom headers. [Adding `Authorization` or `X-Api-Key` to a
cross-origin request always triggers a preflight `OPTIONS`, and the server's response to that
preflight must explicitly list the header in `Access-Control-Allow-Headers` or the browser blocks
the real request](https://medium.com/@chienhsin_yang/cors-preflight-requests-every-web-developer-must-understand-d80c78dbd32f).
A query-parameter key, by contrast, doesn't touch headers at all and stays a simple request — no
preflight, no extra round-trip, no `Access-Control-Allow-Headers` config to get right. For a
latency-sensitive, high-volume, cross-origin embed like Linker (browsers on visitors' machines on
third-party sites), that's a real cost difference: header-based auth roughly doubles round-trips for
uncached preflights (mitigatable with `Access-Control-Max-Age` caching of the preflight result, but
that's one more moving part) versus a query param's zero added round-trips. This is the standards
tension for Sefaria in a nutshell: RFC 6750 + OWASP say "Authorization header, never the URL";
Sefaria's own topology (Varnish cache-key=URL, cross-origin browser-side Linker calls) creates two
independent, unrelated pressures pointing back toward query params for specific call sites.

**Bottom line consensus**: Authorization Bearer is the standards-preferred transport for
server-to-server and general API traffic — better default cache-privacy behavior, standard tooling
support, explicit RFC backing. `X-Api-Key` is an accepted, extremely common alternative when you
need to distinguish app-identity from user-identity concurrently, at the cost of manual CORS/caching
configuration. Query params are the standards-discouraged option, defensible only under the narrow,
Sefaria-specific pressure of an edge cache that keys on URL alone.

Sources:
[RFC 6750 — The OAuth 2.0 Authorization Framework: Bearer Token Usage](https://datatracker.ietf.org/doc/html/rfc6750),
[Should You Put API Keys in Headers or URLs? (codestudy.net)](https://www.codestudy.net/blog/place-api-key-in-headers-or-url/),
[REST Security Cheat Sheet (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html),
[CORS Preflight Requests: Every Web Developer Must Understand (Medium)](https://medium.com/@chienhsin_yang/cors-preflight-requests-every-web-developer-must-understand-d80c78dbd32f),
[CORS for REST APIs (AWS docs)](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html).

## 3. Generation & format

**Entropy.** [128 bits of entropy is the widely-cited NIST-aligned floor for a long-term
cryptographic secret; 256 bits (32 random bytes) is described as a "comfortable default" that
costs essentially nothing extra in storage or transport](https://articles.mergify.com/api-keys-best-practice/).
The generator must be a CSPRNG — Python `secrets` module (`secrets.token_bytes` /
`secrets.token_urlsafe`), not `random`. This is a one-line requirement but worth stating explicitly
because it's the single most common implementation bug in home-grown key generators.

**Encoding.** Raw bytes need a text encoding for transport in headers/URLs. Base64url is the
generic default; **base62** (`[0-9A-Za-z]`, no symbols) is preferred by API-key-specific guidance
[when the alphabet needs to stay safely double-click-selectable, URL-safe without percent-encoding,
and free of characters that could be confused with delimiters](https://apikeys.guide/docs/implementation/key-generation) —
GitHub's tokens use base62 for exactly this reason, and their underscore prefix separator was
deliberately chosen because `_` is not a base62/base64 character, [so it can't appear inside the
random portion and can't accidentally be produced by unrelated random strings like git SHAs,
which also makes the whole token reliably select as one unit on double-click](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/).

**Prefixes for identification and secret-scanning.** A structured prefix converts an otherwise
opaque random string into something a human, a log line, or an automated secret-scanner can
recognize at a glance — service, environment, and sometimes key type — without needing a database
lookup. Two real-world reference designs:
- **Stripe**: `sk_live_...` / `sk_test_...` / `pk_live_...` etc. — [encodes key type (secret vs
  publishable) and environment (live vs test) as the first tokens before the random
  secret](https://apikeys.guide/docs/implementation/key-formats-and-prefixes), and this
  `sk_live_`/`pk_test_` convention is now described as the de facto industry standard, [widely
  supported by GitHub's secret-scanning partner program specifically because the prefix makes the
  string classifiable](https://rafter.so/blog/api-keys/stripe-api-key-security).
- **GitHub**: 3-letter type prefixes (`ghp_` personal access token, `gho_` OAuth token, etc.)
  followed by base62 random, followed by a **6-character embedded checksum** —
  [CRC32 of the token content, base62-encoded, zero-padded — placed in the last 6 characters. GitHub
  states this checksum "virtually eliminates false positives" for offline secret scanning because a
  scanner (or GitHub's own push-protection) can validate structural well-formedness without a
  network round-trip to the database](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/).

Both examples matter for the "identify projects" goal in the brief: a prefix scheme is essentially
free identification infrastructure — nginx/BigQuery log analysis, secret-scanners, and support
tooling can all classify a key from the string alone, before any DB lookup, which is directly useful
for Sefaria's log-based attribution pipeline.

**Key-ID vs secret split.** Rather than one opaque blob, several designs (Stripe conceptually, most
"access key / secret key" pairs, OAuth client_id/client_secret) split the credential into a
non-secret **identifier** (safe to log, index, display in a UI list, and use as a fast DB lookup
key) and a **secret** (never logged, only ever compared via hash). [The split-token pattern: use
the client_id/key-id to find the row (indexed lookup, no scanning), then hash the presented secret
and compare against the stored hash with a constant-time comparison
function](https://medium.com/procedureflow-engineering/building-api-authentication-at-procedureflow-4d1fe78bb293).
This avoids the alternative of hashing an entire opaque key and doing a full-table scan or relying
on the hash itself as a lookup index (which is workable but couples lookup and secrecy in a way the
split avoids). A short prefix (e.g., first 6-8 chars of the random portion, stored in cleartext
alongside the hash) is a common lightweight compromise that gives both display-friendliness ("key
ending in ...4f2a") and lookup speed without a fully separate ID field — this is what
djangorestframework-api-key does (see §7).

**Constant-time comparison.** Comparing a presented secret to a stored value with a naive `==` /
byte-by-byte-with-early-exit comparison leaks timing information: [comparison time increases
proportionally to the number of correct leading bytes, because most implementations exit the loop at
the first mismatch — an attacker sending many guesses and statistically analyzing response latency
can recover a secret in thousands of requests instead of an infeasible brute-force
space](https://dev.ngockhuong.com/posts/timing-attack-a-hidden-risk-when-comparing-secrets/). This is
not theoretical: [a 2024 vLLM security advisory documented exactly this class of vulnerability in
API-key validation](https://github.com/vllm-project/vllm/security/advisories/GHSA-wr9h-g72x-mwhm).
Fix is a solved problem in every mainstream language/framework: Python `hmac.compare_digest`,
Django's `django.utils.crypto.constant_time_compare`, Node's `crypto.timingSafeEqual`. In practice
this matters less if keys are *hashed* before comparison (see §4) and the comparison is over
fixed-length hash digests rather than the raw secret — but the constant-time discipline should still
be applied to the digest comparison itself as defense in depth, and is essentially free to add.

Sources:
[apikeys.guide — Key Generation](https://apikeys.guide/docs/implementation/key-generation),
[apikeys.guide — Key Formats & Prefixes](https://apikeys.guide/docs/implementation/key-formats-and-prefixes),
[On API Keys Best Practices (Mergify)](https://articles.mergify.com/api-keys-best-practice/),
[Behind GitHub's new authentication token formats (GitHub blog)](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/),
[Stripe API Key Security: Best Practices for 2026 (Rafter)](https://rafter.so/blog/api-keys/stripe-api-key-security),
[Securing Your API With Long-Lived Authentication Keys (ProcedureFlow Engineering)](https://medium.com/procedureflow-engineering/building-api-authentication-at-procedureflow-4d1fe78bb293),
[Timing Attack - A Hidden Risk When Comparing Secrets](https://dev.ngockhuong.com/posts/timing-attack-a-hidden-risk-when-comparing-secrets/),
[vLLM: API key authentication vulnerable to timing attack (GHSA-wr9h-g72x-mwhm)](https://github.com/vllm-project/vllm/security/advisories/GHSA-wr9h-g72x-mwhm).

## 4. Storage: hashing, display-once, revocation

**Hash at rest — but the SHA-256-vs-bcrypt/Argon2 debate resolves differently for keys than for
passwords.** The password-hashing consensus (bcrypt/scrypt/Argon2, deliberately slow, memory-hard)
exists because human passwords have low entropy and are vulnerable to offline dictionary/brute-force
attacks — slow hashing is the defense. A CSPRNG-generated API key with 128-256 bits of entropy is a
fundamentally different threat model: [the security comes from randomness and length, not from
hashing speed, and offline brute-force of the *key itself* (as opposed to guessing it) is
computationally infeasible regardless of hash speed — meanwhile a slow hash imposes a real,
continuous cost because, unlike a password, an API key is verified on every single request, not
once at login](https://cybersierra.co/blog/bcrypt-performance-issues-api/). The practical
consequence cited: [bcrypt's deliberate slowness becomes a CPU/latency bottleneck when every API
call pays that cost, whereas a fast, salted SHA-256 (or SHA-512) is considered secure for API keys
specifically because the entropy — not hash cost — is doing the security work, and a per-key salt
still defeats rainbow-table precomputation](https://cybersierra.co/blog/bcrypt-performance-issues-api/).
This is the position [djangorestframework-api-key](https://github.com/florimondmanca/djangorestframework-api-key)
actually implements: it moved from Django's password hashers (PBKDF2/bcrypt-family, slow) to a
dedicated fast SHA-512-based hasher for API keys, citing 10-30x faster validation with negligible
security cost given the keys' entropy (details in §7). Net: fast, salted hash (SHA-256/512) is the
right choice for high-entropy machine credentials; reserve slow/memory-hard hashing for
human-chosen secrets.

**Display-once.** [The now-standard pattern — GitHub, AWS, Stripe, "most modern API
platforms" — is to show the full secret exactly once, at creation time, and never again; only a
prefix or fingerprint is retrievable afterward](https://oneuptime.com/blog/post/2026-02-20-api-key-management-best-practices/view).
This is both a security property (a UI that can redisplay the full secret is a standing leak
surface — screenshots, screen-share, support-tooling access) and an implementation consequence: if
you only ever store a hash, you *cannot* redisplay the key even if you wanted to, so display-once
isn't really a policy choice so much as a natural result of hashing at rest. The retained
**prefix** (first several characters of the random portion, stored in cleartext) is what lets a
dashboard show "key ending in `...4f2a`, created Jan 2026, last used yesterday" for identification
purposes without ever holding the secret in a retrievable form.

**Revocation, rotation, expiry.** Recommended defaults from current practice:
- **Expiry**: default new keys to a bounded TTL and require an explicit opt-in for a non-expiring
  key, on the reasoning that ["keys without expiration dates are keys that never get
  rotated"](https://guptadeepak.com/ciam-compass/best-practices/api-key-rotation/); typical cited
  windows are ~90 days for sensitive/high-privilege keys, up to 365 for low-risk ones.
- **Rotation with overlap**: support two live keys simultaneously during a rotation window (commonly
  ~30 days) so a consumer can adopt the new key before the old one is cut off, rather than a
  hard cutover that breaks anyone who hasn't rotated yet.
- **Revocation**: immediate and irreversible (mark inactive / delete row so a hash lookup simply
  fails); should be self-serve from the same dashboard that issued the key.
- **Audit logging**: log issuance, rotation, and revocation events with actor/timestamp — [without
  that trail, a leaked key can't be traced back to when/how/by whom it was
  issued](https://oneuptime.com/blog/post/2026-02-20-api-key-management-best-practices/view), which
  matters both for incident response and, for Sefaria's stated goal, for understanding who's
  actually consuming the API over time even after a key rotates.

None of expiry/rotation/revocation is exotic — they're dashboard/lifecycle features, not
cryptographic ones — but they're easy to omit when a key system is built as a one-off ("just add a
`db.apikeys` row"), which is exactly the shape of Sefaria's existing legacy mechanism per the brief
(plaintext, unscoped, no expiry, no rotation story).

Sources:
[Why bcrypt Will Kill Your API Performance (CyberSierra)](https://cybersierra.co/blog/bcrypt-performance-issues-api/),
[Irretrievable vs Retrievable API Keys (CyberSierra)](https://cybersierra.co/blog/secure-api-keys-guide/),
[djangorestframework-api-key security docs](https://github.com/florimondmanca/djangorestframework-api-key/blob/master/docs/security.md),
[API Key Management Best Practices (oneuptime)](https://oneuptime.com/blog/post/2026-02-20-api-key-management-best-practices/view),
[API key rotation: do's and don'ts (CIAM Compass)](https://guptadeepak.com/ciam-compass/best-practices/api-key-rotation/),
[How to Become Great at API Key Rotation (GitGuardian)](https://blog.gitguardian.com/api-key-rotation-best-practices/).

## 5. Standards to align with

**[OWASP API Security Top 10 (2023 edition)](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)**
— the field's reference risk taxonomy, most relevant items for a key-based identification system:
- **API2:2023 Broken Authentication** (still #2, unchanged rank since 2019): covers weak/insecure
  token handling generally. Two directly actionable lines for this project: ["API keys should not
  be used for user authentication — they should only be used for API client
  authentication"](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)
  (i.e., don't let an API key stand in for a login), and ["don't reinvent the wheel in
  authentication, token generation, or password storage — use the
  standards"](https://salt.security/blog/api2-2023-broken-authentication), which is a direct
  argument for adopting the djangorestframework-api-key / DRF-throttling building blocks in §7
  rather than hand-rolling the `db.apikeys` successor.
- **API4:2023 Unrestricted Resource Consumption** (renamed/broadened from 2019's "Lack of Resources
  & Rate Limiting"): directly the quotas/tiers half of the brief — the risk isn't just abuse, it's
  the *absence* of any resource ceiling at all, which is Sefaria's current state (DRF installed,
  no throttling configured, per the brief).
- **API9:2023 Improper Inventory Management**: relevant to "we cannot answer how many distinct
  projects consume our API" — this is literally the inventory-management risk category, reframed
  as a strategic/product problem rather than a pure security one.
- Full list for reference: BOLA, Broken Authentication, Broken Object Property Level Auth,
  Unrestricted Resource Consumption, Broken Function Level Auth, Unrestricted Access to Sensitive
  Business Flows, SSRF, Security Misconfiguration, Improper Inventory Management, Unsafe Consumption
  of APIs.

**[OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)**
— practical, implementation-level companion to the Top 10. Directly relevant lines: HTTPS-only for
anything carrying credentials; keys/tokens/passwords must never appear in the URL (server logs
capture full URLs by default); sensitive data on GET requests belongs in a header, not the query
string; every non-public endpoint needs access control checked independently at the endpoint level
(don't rely on a gateway-level check alone).

**[RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750)** — Bearer token transport standard
(detailed in §2). Even though Sefaria isn't necessarily adopting full OAuth2, reusing the
`Authorization: Bearer <token>` *transport convention* for a plain opaque key is common practice and
buys standards-compliant behavior (tooling recognition, cache-privacy defaults) without adopting the
rest of the OAuth2 machinery.

**[IETF `draft-ietf-httpapi-ratelimit-headers`](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)**
("RateLimit header fields for HTTP") — not yet an RFC (still an active Internet-Draft in the httpapi
working group, currently at revision -11), but increasingly treated as the de facto standard shape
for rate-limit visibility: `RateLimit-Limit` (quota for the window), `RateLimit-Remaining`
(remaining in current window), `RateLimit-Reset` (seconds until window resets). [Cloudflare added
support in September 2025](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/),
and the draft explicitly coordinates with `Retry-After` (below) so both can appear on the same 429
without conflicting. Worth adopting the header *names* now even before/if the draft becomes an RFC —
low cost, immediate DX value, and aligns with where the ecosystem (Cloudflare, GitHub, many API
platforms already ship near-identical headers under slightly different names) is converging.

**[RFC 6585](https://datatracker.ietf.org/doc/html/rfc6585)** — defines HTTP status `429 Too Many
Requests`, the standard response for both rate-limiting and (by extension) hard quota rejection.
DRF's throttling already returns 429 by default (§7), so this is more a "don't invent your own
status code" confirmation than new work.

**[RFC 8594](https://www.rfc-editor.org/rfc/rfc8594.html)** (Sunset header) and its companion **RFC
9745** (Deprecation header) — signal to callers that an endpoint or, by extension, an
unauthenticated/legacy access path is going away on a specific date. [Sunset gives a concrete
migration deadline; Deprecation + Sunset together are the standard pairing for a full
end-of-life story](https://zuplo.com/learning-center/http-deprecation-header). Directly applicable
to the brief's "extended communication/grace period" for anonymous access — a `Sunset:` header (plus
`Link:` to migration docs, per RFC 8594) on anonymous responses during the grace period is a
standards-based way to signal the coming requirement without breaking anyone immediately, and is far
more machine-actionable than an email/blog-post announcement alone.

**[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)** (Problem Details for HTTP APIs,
obsoletes RFC 7807) — standard `application/problem+json` error body shape (`type`, `title`,
`status`, `detail`, `instance`, extensible with custom fields) for 4xx/5xx responses. Relevant if
Sefaria wants 429/401/403 error bodies (unauthenticated-after-grace-period, over-quota, invalid key)
to be machine-parseable in a standard way rather than ad hoc JSON — low-cost to adopt since it's just
a body-shape convention, not new infrastructure.

Sources:
[OWASP API Security Top 10 2023 — full list](https://owasp.org/API-Security/editions/2023/en/0x11-t10/),
[API2:2023 Broken Authentication](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/),
[API2:2023 Broken Authentication (Salt Security)](https://salt.security/blog/api2-2023-broken-authentication),
[REST Security Cheat Sheet (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html),
[RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750),
[draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/),
[RFC 6585](https://datatracker.ietf.org/doc/html/rfc6585),
[RFC 8594 — The Sunset HTTP Header Field](https://www.rfc-editor.org/rfc/rfc8594.html),
[Understanding The HTTP Deprecation Header (Zuplo)](https://zuplo.com/learning-center/http-deprecation-header),
[RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html).

## 6. Common pitfalls

**Keys in URLs and logs.** Covered in §2/§5 as a standards violation; worth restating as the single
most-cited *operational* pitfall, not just a theoretical one — because nginx, CDNs, proxies, and
browser history all log/retain full URLs by default, a query-param key is exposed to every layer of
infrastructure that touches the request, including ones (like Sefaria's own nginx→BigQuery JSON
access-log pipeline, per the brief) that were never designed with secrets in mind.

**Keys in git.** Empirically large and worsening. [GitHub detected over 39 million leaked secrets
across the platform in 2024, more than a dozen per minute in just the first eight weeks of
2024](https://www.security.land/github-bolsters-security-after-39-million-secret-leaks-in-2024/), and
[a 2026 GitGuardian report found AI-assisted commits leak secrets at roughly 2x the baseline rate
(3.2%), with OpenAI API key leaks specifically up 1,212x amid the AI coding
wave](https://snyk.io/articles/state-of-secrets/). Once committed, a secret persists in git history
indefinitely even if removed in a later commit — [74% of leaked keys tracked in one 31-day study were
still live/valid a month after
exposure](https://snyk.io/articles/state-of-secrets/), meaning "someone will eventually notice and
rotate it" is not a real mitigation; revocation has to be fast and self-serve. Two standards-adjacent
mitigations: (a) a recognizable prefix (§3) is what lets GitHub's/GitGuardian's *secret-scanning
partner programs* detect a leaked key automatically and notify or auto-revoke it — a Sefaria key
format with no distinguishing prefix is invisible to that entire ecosystem; (b) push-protection
(pre-commit/pre-push scanning) is a client-side mitigation Sefaria doesn't control for third-party
developer repos, reinforcing that server-side detectability (via the prefix) is the more reliable
lever.

**Timing attacks on comparison.** Covered in §3 — real, documented (vLLM CVE-class advisory), and
trivially avoided with constant-time comparison of hashed values. Worth flagging because it's an
easy thing to get wrong in a hand-rolled `if provided_key == stored_key:` check, and won't show up
in code review unless someone is specifically looking for it.

**Granularity: per-key vs per-user vs per-project — and the industry's clear move toward
project-scoped keys.** This is the pitfall most directly relevant to the brief's stated goal
("identify projects consuming the API"). The failure mode is building a key system scoped to
*users* (one key per human account, Sefaria's existing `db.apikeys` shape — "one per user") when the
actual unit you want to identify, rate-limit, and eventually bill is a *project/application/service
account*, which may be run by a team, may need multiple keys (e.g., separate keys per environment or
per deployed instance), and shouldn't be tied to a single human's account lifecycle (what happens to
the key when that person leaves?). The clearest reference case: [OpenAI's `sk-proj-` keys became the
default when "Projects" shipped in mid-2024, replacing the older user-bound key model; the current
hierarchy is organization → project → project-scoped keys/service accounts, specifically to get
per-project usage breakdown, budgets, and isolation — "a compromised key only affects a single
service account rather than the entire
organization"](https://help.openai.com/en/articles/9186755-managing-your-work-in-the-api-platform-with-projects).
Stripe's "restricted keys" and AWS's per-resource IAM policies are the same pattern from a different
angle: the credential's *scope* is decoupled from any one human identity and instead tied to an
application/service/project construct. This is the strongest single piece of prior-art evidence for
building Sefaria's key system around a **project** entity (which can have members, multiple keys,
and its own usage/quota state) from day one, rather than keys-per-user with an ad hoc "project" label
bolted on later — retrofitting that hierarchy after keys are already 1:1 with user accounts is a
migration problem, not a schema tweak.

Sources:
[Why 28 million credentials leaked on GitHub in 2025 (Snyk)](https://snyk.io/articles/state-of-secrets/),
[GitHub Bolsters Security After 39 Million Secret Leaks in 2024](https://www.security.land/github-bolsters-security-after-39-million-secret-leaks-in-2024/),
[GitHub Secret Scanning & Push Protection (devactivity)](https://devactivity.com/posts/development-integrations/preventing-secret-leaks-on-github-a-strategic-guide-for-dev-leaders/),
[Managing projects in the API platform (OpenAI Help Center)](https://help.openai.com/en/articles/9186755-managing-your-work-in-the-api-platform-with-projects),
[OpenAI API key hygiene for AI agents: project keys, restricted keys](https://authsome.ai/blog/openai-api-key-hygiene-for-ai-agents-project-keys-restricted-keys-and-what-an-agent-should-actua),
[vLLM: API key authentication vulnerable to timing attack](https://github.com/vllm-project/vllm/security/advisories/GHSA-wr9h-g72x-mwhm).

## 7. Django/Python building blocks

**[`djangorestframework-api-key`](https://github.com/florimondmanca/djangorestframework-api-key)**
(florimondmanca) — the closest off-the-shelf match to "issue and validate opaque API keys in a
Django/DRF app." Design specifics, confirmed from its own docs:
- Keys are shown **once** at creation and stored hashed; [current versions use a dedicated fast
  SHA-512-based hasher rather than Django's password hashers, explicitly for the entropy-not-slowness
  reasoning in §4 — described as 10-30x faster validation than reusing a password
  hasher](https://pypi.org/project/djangorestframework-api-key/), which matters because key
  validation runs on every request, not once at login.
- Stores a cleartext **prefix** and the hash in separate model fields (the key-ID/secret split
  pattern from §3) — enough to identify/display a key without ever holding the secret.
- Ships as DRF permission classes (`HasAPIKey` etc.) that compose with existing DRF views/viewsets.
- Maturity: [functionally stable and widely used, but low current development velocity — "only 10
  or fewer contributors... in the past month, no pull request activity or change in issues status
  was detected"](https://snyk.io/advisor/python/djangorestframework-api-key) per package-health
  scanners. Read as: solid for the core "hash, store, verify, revoke" primitive, but it is *only*
  that primitive — it has no concept of projects/organizations, no usage metering, no
  quota/tier logic, and no rate limiting. Sefaria would be extending or wrapping it, not adopting it
  wholesale, for anything beyond basic key issuance/verification.

**Gap: DRF is "plain Django views" today.** The brief states DRF is installed but unused — endpoints
are plain Django views, so adopting `djangorestframework-api-key`'s permission-class integration
implies either migrating targeted endpoints to DRF views/viewsets, or reimplementing its
hash/verify/prefix logic as a plain Django middleware/decorator (the underlying model and hashing
code is simple enough — a few hundred lines — that this is a real, low-risk option if a full DRF
migration isn't otherwise justified).

**[`django-ratelimit`](https://github.com/jsocol/django-ratelimit)** (jsocol) — decorator/class-based
rate limiting for arbitrary Django views (not DRF-specific), backed by the configured Django cache.
[Requires a cache backend supporting atomic increment — Memcached and Redis qualify, the database
cache backend does not](https://github.com/jsocol/django-ratelimit) — which fits cleanly since the
brief confirms Redis (`django_redis`) is already available. Actively maintained (issue activity
through mid-2025 per GitHub). Good fit specifically *because* Sefaria's endpoints are plain Django
views rather than DRF — this is the rate-limiting tool that doesn't require a DRF migration.

**DRF built-in throttling** (`AnonRateThrottle`, `UserRateThrottle`, `ScopedRateThrottle`) — only
relevant if/where endpoints move onto DRF. `ScopedRateThrottle` in particular maps well onto "some
endpoints (api/calendars, api/sheets) need tighter limits than others" from the brief's per-endpoint
risk data — it namespaces the rate-limit scope per view. [Custom throttle classes can subclass
`UserRateThrottle`, set a custom scope, and override `get_cache_key` to key on the API key rather
than the Django user](https://medium.com/devmap/rate-limiting-in-django-rest-framework-throttling-explained-with-examples-6031793a69e5) —
this is the standard pattern for "rate limit per API key" once keys exist. Default 429 response
out of the box, consistent with RFC 6585.

**The metering gap.** None of these three packages do usage *metering* (persisted per-key request
counts/analytics over time, as opposed to a sliding-window rate-limit counter that's designed to be
ephemeral/reset). `django-ratelimit` and DRF throttling are built for *enforcement* (block/allow
this request), using cache-backed counters that are not meant to be durable analytics. If the
product goal includes "see how much project X used over the last month" (billing-adjacent, or just
identification/attribution as the brief frames it), that's a separate, unaddressed-by-these-packages
concern — realistically a Celery task or async log-processing step that increments a Postgres/Mongo
counter or writes to the existing BigQuery pipeline, keyed by the same key-ID these packages
generate. Worth flagging explicitly so it isn't assumed to come "for free" with either package.

**Where enforcement can live given the constraints in the brief**: both packages assume the request
reaches Django (gunicorn) — neither knows about Varnish/Envoy/nginx. Given the brief's finding that
Varnish's URL-only cache key means Django never sees cache-hit traffic, any of these Django-level
tools will systematically undercount/under-enforce on the ~15 cached GET patterns unless paired with
either an edge-level (Envoy `BackendTrafficPolicy`, which the brief notes supports this) rate limit,
or a deliberate architectural choice to `pass` (bypass cache) on keyed requests. This isn't a
tooling-maturity gap so much as a topology constraint no Django package can address by itself.

Sources:
[djangorestframework-api-key (GitHub)](https://github.com/florimondmanca/djangorestframework-api-key),
[djangorestframework-api-key (PyPI)](https://pypi.org/project/djangorestframework-api-key/),
[djangorestframework-api-key security docs](https://github.com/florimondmanca/djangorestframework-api-key/blob/master/docs/security.md),
[djangorestframework-api-key package health (Snyk Advisor)](https://snyk.io/advisor/python/djangorestframework-api-key),
[django-ratelimit (GitHub)](https://github.com/jsocol/django-ratelimit),
[Django Ratelimit docs](https://django-ratelimit.readthedocs.io/en/stable/),
[Throttling — Django REST framework](https://www.django-rest-framework.org/api-guide/throttling/),
[Rate Limiting in DRF — Throttling Explained (Medium)](https://medium.com/devmap/rate-limiting-in-django-rest-framework-throttling-explained-with-examples-6031793a69e5).

## 8. Recommendations distilled for Sefaria

These follow from the fundamentals above applied against `00-brief.md`'s constraints; they are
inputs to the ADR, not a final decision.

1. **Token type: opaque bearer key, not JWT/OAuth2/HMAC.** The brief's problem is caller
   *identification*, not delegated user authorization, stateless session verification, or
   payload-integrity — none of the conditions that justify JWT, OAuth2 client-credentials, or HMAC
   signing (§1) are present. Keep JWT exactly where it already is (logged-in mobile users) and don't
   conflate it with app/project identification. An opaque, hashed, prefixed key is what every
   comparable read-API-as-a-product company (Stripe, GitHub, OpenAI) uses for this exact problem.

2. **Scope keys to a `Project` entity, not a user, from the start.** §6's OpenAI case study is the
   strongest evidence here: retrofitting project-level grouping onto user-bound keys later is a
   migration, not a config change. This also directly answers the brief's differentiation goal
   (first-party Sefaria projects — website, MCP, mobile, Linker — vs. third-party projects like
   Otzaria/Dicta/hobbyist apps) — model those as distinct `Project` rows with a `first_party`
   flag/type, each capable of holding multiple keys (e.g., one per environment, or one for a
   server-side backend plus a separate lower-trust one for a client-extractable context).

3. **Format: `sfr_<env>_<random>` (or similar) with a base62 random portion (§3).** Adopt a
   recognizable prefix now even though Sefaria isn't submitting to GitHub's secret-scanning partner
   program today — it's what makes keys self-describing in nginx/BigQuery log analysis without a DB
   join, and costs nothing. Skip a GitHub-style embedded CRC32 checksum unless there's a concrete
   secret-scanning integration planned; it's a nice-to-have, not core. 256-bit CSPRNG-generated
   random portion (Python `secrets` module). Store a cleartext prefix + salted SHA-256/512 hash of
   the full key (§4) — do not use bcrypt/Argon2 given the entropy-not-slowness reasoning, and given
   keys are checked on every request.

4. **Transport: `Authorization: Bearer <key>` as the primary/documented method, with the query-param
   cache-key tension called out explicitly as an open design question, not silently resolved.**
   Standards (RFC 6750, OWASP) point at the header; Sefaria's own topology (Varnish cache-key=URL
   only, per the brief) creates real pressure toward a query param for the ~15 cached GET patterns
   specifically. Options worth putting in front of product/infra rather than picking silently: (a)
   accept undercounted metering on cached GETs and use the header everywhere, (b) use a query param
   only on the cached-pattern allowlist and the header elsewhere (inconsistent but pragmatic), (c)
   push key-checking to Envoy (which the brief notes supports inline Lua / BackendTrafficPolicy) so
   enforcement happens before Varnish regardless of transport. For Linker's cross-origin
   browser-side calls specifically, factor in the CORS preflight cost (§2) of adding a header versus
   a query param — Linker is the one caller where "no header" has a concrete latency argument, not
   just a caching one, though Linker keys are also the least secret-capable case per the brief's own
   consumer table (runs on 3P origins) so the identification value of a per-caller secret there is
   already weak regardless of transport.

5. **Anonymous grace period: signal it with `Sunset`/`Deprecation` headers (§5), not just
   out-of-band communication.** RFC 8594/9745 give a standards-based, machine-readable way to
   announce "unauthenticated access to this endpoint ends on `<date>`" that well-behaved
   server-side integrations (the ones capable of reading response headers, e.g., the uncontactable
   Supabase/Deno backend and other server-side consumers in the brief's traffic picture) can act on
   even without ever reading an email or blog post.

6. **Rate limiting / enforcement: `django-ratelimit` over Redis for immediate coverage of the
   existing plain-Django-view endpoints (§7)**, since it doesn't require a DRF migration and Redis is
   already available per the brief. Treat DRF's `ScopedRateThrottle` as the longer-term answer only
   for endpoints that get migrated onto DRF anyway (worth doing for the highest-external-dependency
   endpoints called out in the brief — api/calendars, api/sheets — where finer-grained throttle
   scopes are most valuable). In both cases, remember these tools are *enforcement*, not
   *metering* — budget separately for a usage-analytics path (Celery task or log-pipeline addition
   keyed on the key-ID) if "see how much each project used" is a near-term goal and not just future
   quota enforcement.

7. **429 + RateLimit-* headers + problem+json (§5) as the response contract**, since DRF throttling
   already defaults to 429 (RFC 6585) and adding the IETF draft's `RateLimit-Limit` /
   `RateLimit-Remaining` / `RateLimit-Reset` headers plus an `application/problem+json` body is a
   near-zero-cost way to give API consumers a standard, tool-recognizable shape rather than an ad hoc
   error format — useful now for the ~15% genuinely-external traffic and increasingly useful as
   bigger customers are onboarded, per the brief's "flexibility to support bigger customers later"
   priority.

8. **Constant-time hash comparison and `djangorestframework-api-key`'s own hashing code as a
   reference implementation (or direct dependency)** — don't hand-roll key hashing/verification from
   scratch; the timing-attack pitfall (§3/§6) and the fast-vs-slow-hash tradeoff (§4) are both
   already correctly solved in that package's source, whether or not Sefaria ends up depending on it
   directly versus adapting its model/hasher.

