# Engineering Research: Self-Service API Keys for the Developer Ecosystem

**Status:** Research / discovery phase
**Owners:** Yitzhak Clark, Michael Fankhauser
**Target for mandatory keys:** January 1, 2028
**Source:** Q3 planning discussion (2026-07-12)

---

## 1. Why this exists

Today Sefaria's API is effectively anonymous for reads. We cannot reliably
answer basic questions like "how many distinct projects consume our API?",
"which of them are still active?", or "who do we contact before we change or
retire an endpoint?" As the ecosystem grows (AI ingestion, mobile apps,
third-party sites, the MCP server, the library assistant), the lack of
attribution is now a product, operations, and business problem.

The long-term goal is to require an API key for all API consumers by
**January 1, 2028**, with a transition period during which anonymous and
key-authenticated traffic coexist. Getting there needs:

- a **self-service** way for developers to register a project and mint a key
  (so we are not hand-generating keys via a management command);
- a **key-management surface** integrated with Sefaria project accounts;
- a **tracking layer** that turns keys into usage/reach insight;
- a **migration & communication plan** for legacy anonymous consumers.

This document breaks that into research spikes (time-boxed investigation) and
build-ready stories (clear enough to implement). It is deliberately grounded
in what the code does *today*.

---

## 2. Current state of the world (as of this research)

Findings from the codebase, so stories start from reality rather than
assumption:

- **Keys live in MongoDB.** The `apikeys` collection holds documents shaped
  `{ "uid": <int>, "key": <str> }`. There is no name, creation date, scope,
  last-used timestamp, rate limit, or project association on a key.
- **One key per user, CLI-only.** `sefaria/utils/user.py:generate_api_key(uid)`
  is the only way to create a key. It **deletes all existing keys for that
  user** before inserting a new one, so a user can hold exactly one key and
  rotation destroys the old value. There is no UI and no self-service path.
- **Keys authenticate writes, not reads.** `user_credentials()` in
  `reader/views.py` accepts a key via the `apikey` POST param *or* the
  `x-api-key` header, looks it up in `apikeys`, and returns
  `{"user_type": "API", "user_id": uid}`. It is used by ~16 call sites, all of
  which are add/edit/delete operations (links, notes, text versions, etc.).
- **Reads are fully anonymous.** The v3 API (`api/views.py`, class-based `Text`
  etc.) takes no key and does no per-consumer identification.
- **No rate limiting or throttling exists** anywhere in the API layer. The
  only rate-limit handling in the code is on an *outbound* CRM integration
  (`nationbuilder.py`).
- **Keys are tied to a full Sefaria account** (Django `User` + Mongo
  `profiles`), which is the intended home for identity/access management —
  not README or other ecosystem repos.

**Implication:** we are not extending a mature key system; we are building most
of it. The write-key mechanism is a useful seam to reuse, but self-service
registration, key metadata, scoping, rate limiting, read-path identification,
and tracking are all greenfield.

---

## 3. Research spikes (time-boxed investigation)

Each spike should end in a short written recommendation, not code.

### SPIKE-1 — Characterize current API traffic and consumers
**Goal:** Understand who is actually calling us so we can size the migration
and prioritize outreach.
**Investigate:**
- Sources of request logs (nginx/ingress, application logs, CDN) and how far
  back they go.
- Volume of read vs. write traffic; volume of anonymous vs. keyed calls
  (keyed = has `apikey`/`x-api-key`).
- Distribution by endpoint, User-Agent, referrer, and IP, acknowledging that
  cloud IPs rotate and are weak identifiers.
- Rough count of distinguishable "clients" and which look like legacy
  integrations vs. our own first-party traffic (web, mobile, MCP, library
  assistant).
**Deliverable:** A traffic profile + a candidate list of legacy consumers to
contact, with confidence notes on identity ambiguity.
**Depends on:** nothing. **Do this first** — it informs almost everything else.

### SPIKE-2 — Distinguish first-party from third-party and client- vs server-side
**Goal:** Decide how our own surfaces authenticate so they don't get swept up
in "mandatory keys."
**Investigate:**
- How each first-party surface calls the API today: sefaria.org web client
  (session-based), mobile apps, the MCP server, the library assistant.
- Whether a browser client can be trusted via referrer/Origin whitelist, and
  how spoofable that is in practice.
- Whether backend/first-party services should hold server-side secrets instead
  of shipping keys to clients.
**Deliverable:** A recommendation for how each first-party surface is
identified, and a rule for telling client-side from server-side callers.
**Related meeting notes:** referrer whitelist is spoofable; backend services
(MCP) can hold secrets safely; mobile is the hard case.

### SPIKE-3 — Key exposure model for public/client-side code
**Goal:** Decide what we do about keys that must ship inside code users can
read (JS bundles, mobile binaries).
**Investigate:**
- Options: referrer/Origin allow-lists, short-lived tokens minted by a
  backend, rotating keys pushed via forced app updates, per-install secrets.
- Threat model: what a leaked key can actually do (read-only vs. write), and
  therefore how much protection is warranted.
- Prior art from comparable open-data/APIs.
**Deliverable:** A recommended pattern per client type (web JS, mobile,
trusted backend) with the security/effort tradeoff stated explicitly.
**Framing:** This is a cat-and-mouse problem; the goal is *attribution and
tracking*, not hard exclusion. Right-size the effort accordingly.

### SPIKE-4 — Coexistence & enforcement strategy (anonymous ↔ keyed)
**Goal:** Design how anonymous and keyed traffic run side-by-side without a
per-URL configuration mess.
**Investigate:**
- A single, consistent authorization mechanism (e.g. middleware/decorator)
  rather than per-endpoint key checks.
- Phased enforcement modes: *log-only* → *soft nudge* (headers/warnings,
  maybe generous anonymous rate limit) → *required*.
- Whether a new API version encourages key adoption (better perf/features for
  keyed callers) vs. retrofitting existing endpoints.
**Deliverable:** A recommended enforcement architecture and a phase timeline
that lands mandatory keys by 2028-01-01.

### SPIKE-5 — Usage tracking & unique-user measurement
**Goal:** Turn keys into reliable reach/usage metrics.
**Investigate:**
- What we log per keyed request (key id, endpoint, timestamp) and where it
  goes (analytics store, aggregation).
- How to approximate unique end-users when a developer's key fronts many
  users — can/should cooperating developers pass a hashed user id? (analogous
  to GA / device-id tracking).
- How to also track bulk **downloads** of the dataset and **scraping** as
  separate reach signals, and whether to gate full-dataset downloads behind a
  form/identity step.
**Deliverable:** A tracking data model and a definition of the metrics we will
report (active projects, calls/key, approx. unique users, download events).

### SPIKE-6 — Legacy consumer migration & communication
**Goal:** Plan the outreach that gets existing anonymous consumers onto keys
before the cutoff.
**Investigate:**
- Building the contact list from SPIKE-1.
- A low-friction onboarding: proactive email with a **magic link** that
  pre-provisions a key/project for known integrations.
- The "clean break" policy for non-responsive legacy services, and how we
  stage warnings before any cutoff.
**Deliverable:** A communication timeline + templates, and a defined policy for
cutting off non-compliant legacy traffic.

---

## 4. Build-ready stories

These are clear enough to implement once the relevant spikes land. Written as
user stories with acceptance criteria. Sequenced roughly by dependency.

### STORY-1 — API key data model with metadata
> As the platform, I need each API key to carry identity and lifecycle
> metadata so keys can be managed, scoped, and tracked.

**Acceptance criteria:**
- Extend the `apikeys` record (or a successor model) beyond `{uid, key}` to
  include: a stable key id, a display name/label, associated project, created
  timestamp, last-used timestamp, status (active/revoked), and a place for
  future scope/rate-limit fields.
- Support **multiple keys per user/project** (removing the current
  delete-all-then-insert behavior in `generate_api_key`).
- Store only a hash of the secret where feasible; show the full secret once at
  creation.
- Backward compatible: existing `{uid, key}` keys continue to authenticate
  writes during migration.

**Notes / current code:** `sefaria/utils/user.py:generate_api_key`,
`reader/views.py:user_credentials`, `apikeys` collection.

### STORY-2 — Self-service key creation & management UI
> As an ecosystem developer with a Sefaria account, I can create, name, view,
> and revoke my own API keys without emailing anyone.

**Acceptance criteria:**
- Authenticated account page to list keys (name, created, last-used, status),
  create a new key (secret shown once), and revoke a key.
- Optional project/description field per key.
- Backed by STORY-1's model; no CLI step required.
- Basic guardrails (max keys per account, confirmation on revoke).

**Depends on:** STORY-1. **Related:** key management belongs on Sefaria project
accounts, not README/other repos.

### STORY-3 — Consistent authorization layer with log-only mode
> As the platform, I want a single mechanism that identifies the caller (key
> or first-party) on any endpoint, starting in a mode that logs but never
> blocks.

**Acceptance criteria:**
- One reusable middleware/decorator that resolves caller identity from
  `x-api-key` header (preferred) or existing mechanisms, on both read and
  write paths — no per-URL bespoke checks.
- A configurable enforcement mode: `log_only` (default), `soft`, `required`.
- In `log_only`, anonymous requests are served exactly as today but recorded.
- Header-based auth is the documented standard going forward; the legacy
  `apikey` POST param still works for writes.

**Depends on:** SPIKE-4. **Notes:** today `x-api-key` is read in one place
(`user_credentials`) and only for writes.

### STORY-4 — Usage logging & tracking pipeline
> As the product/business team, I can see how many projects are active and
> roughly how many end-users we reach via the API.

**Acceptance criteria:**
- Every identified request records key id + endpoint + timestamp to an
  analytics-friendly store.
- Dashboard/report of active keys, calls per key, and endpoint breakdown.
- Optional developer-supplied hashed end-user id is captured when present.
- Dataset-download events are tracked alongside API calls.

**Depends on:** STORY-3, SPIKE-5.

### STORY-5 — First-party surface authentication
> As the platform, our own web/mobile/backend surfaces authenticate in a way
> that won't break when keys become mandatory.

**Acceptance criteria:**
- sefaria.org web client, mobile apps, MCP server, and library assistant each
  use the pattern chosen in SPIKE-2/SPIKE-3 (session, referrer/Origin
  allow-list, server-side secret, or short-lived token as appropriate).
- No user-facing breakage introduced.

**Depends on:** SPIKE-2, SPIKE-3, STORY-3.

### STORY-6 — Anonymous rate limiting / soft enforcement
> As the platform, anonymous callers get a limited free tier that nudges them
> toward keys, without breaking legitimate light use.

**Acceptance criteria:**
- Rate limiting exists for anonymous traffic (none exists today); keyed
  callers get a higher/again-configurable limit.
- Over-limit anonymous responses carry a clear message + docs link on how to
  get a key.
- Limits are configurable and start generous.

**Depends on:** STORY-3.

### STORY-7 — Legacy outreach onboarding (magic link)
> As a known legacy consumer, I receive an email with a link that provisions a
> key for my project with minimal effort.

**Acceptance criteria:**
- A flow that generates a pre-populated key/project for a contacted
  integration and delivers it via a secure magic link.
- Ties into the STORY-2 management UI once the developer clicks through.

**Depends on:** STORY-1, STORY-2, SPIKE-1, SPIKE-6.

### STORY-8 — Mandatory enforcement cutover
> As the platform, on the agreed date the API requires a key for the targeted
> endpoints, with legacy non-compliant traffic handled per policy.

**Acceptance criteria:**
- Flip enforcement mode to `required` for the targeted endpoint set.
- Staged warnings precede the cutover; monitoring confirms first-party and
  migrated consumers are unaffected.
- Documented policy applied to non-responsive legacy traffic.

**Depends on:** essentially everything above. **Target:** 2028-01-01.

---

## 5. Open questions to resolve with stakeholders

- Do read endpoints require keys at cutover, or only writes + high-volume
  reads? (Scope of "mandatory.")
- New API version to drive adoption vs. retrofit existing endpoints?
- What is the anonymous free-tier limit, and is there a paid/partner tier?
- How hard do we fight scraping and disguised LLM crawlers (`llms.txt` is
  voluntary and widely ignored), versus focusing effort on cooperative
  developers?
- Do we gate full-dataset downloads behind identity capture?

## 6. Suggested sequencing

1. **SPIKE-1** (traffic profile) — unblocks migration sizing and outreach.
2. **SPIKE-2 / SPIKE-3 / SPIKE-4** in parallel — the architectural decisions.
3. **STORY-1 → STORY-3 → STORY-4** — model, auth layer, tracking (the core).
4. **SPIKE-5 / STORY-2** — tracking depth and the self-service UI.
5. **STORY-5 / STORY-6** — first-party auth and rate limiting.
6. **SPIKE-6 / STORY-7** — outreach and onboarding.
7. **STORY-8** — cutover by 2028-01-01.
