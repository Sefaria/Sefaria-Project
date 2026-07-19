# Sefaria API Keys — Product Decisions

*July 2026 · Team Platform*

**Settled, for context.** Every programmatic API consumer will identify itself with a free,
instantly-issued key. Keys are identification, not security — the goals are knowing who builds on
Sefaria, being able to reach them, understanding usage, and containing abuse. The architecture is
decided (gating at the network edge, enforcement phased over ~6 months and gated on measurements):
normal browser traffic, search-engine crawlers, and our own apps are **never affected**; only
unregistered *programmatic* traffic feels pressure — first a notice, then shared rate limits,
eventually a per-endpoint key requirement with generous grandfather windows. Specific limit numbers
come from measurement, not from this document. What remains are the five product decisions below.

## 1 · How someone gets a key

Self-serve, instant, no approval queue — settled. A verified email is required, and Sefaria
accounts today never verify email, so verification must come from somewhere:

- **Option A — require Google/Apple sign-in.** The SSO project (now in QA) guarantees
  provider-verified emails. Zero new build; people requesting keys must sign in via SSO.
- **Option B — verify at issuance.** Any Sefaria account may request a key; the first request
  sends a confirmation email that activates it. A small build; keeps the email/password path open.

**Decide:** A or B — or B now with A as the fast path once SSO ships.

## 2 · What we ask at registration

Beyond the verified email, our suggestion is to require exactly **one** question — *"What are you
building?"* (one line). This answer is the analytics payoff of the whole program: a key alone tells
us *that* something calls us; this field tells us *what*. Org name, site URL, category — optional.
(The URL should stay optional in any configuration; requiring it invites the misreading that API
calls are only permitted from that URL.) Each additional required field measurably costs
registrations.

**Decide:** the required field set and its exact wording.

## 3 · The Linker

About 12% of all API traffic is the Linker embedded on partner sites (Times of Israel, Aish, JWA,
My Jewish Learning…). Under the settled architecture it flows untouched — but attribution rests on
browser referer signals, we hold contact information for none of the installing sites, and there is
no per-site lever. **Recommendation:** leave every existing install untouched; route *new* installs
through a lightweight "Get the Linker" page (site name + contact email → snippet with a per-site
identifier). The registry fills in over time without breaking anything.

**Decide:** build the registration page now, later, or never.

## 4 · Seeing users, not just projects

We record client IPs, so a project whose app calls our API directly from its users' devices gives
us users-per-project automatically; a project that proxies through its own server appears as a
single consumer, and its user count is invisible to us. If finer numbers matter, the only available
addition is a voluntary, self-reported "estimated users" field at registration.

**Decide:** include the voluntary field, or skip it.

## 5 · Terms at issuance

Registration ends with a checkbox. What it binds is a product/legal question: attribution
(required, or requested?), acceptable use, and consent to be contacted about API changes — that
last line is quietly the most valuable one in it.

**Decide:** who owns drafting the text; the attribution posture.

## Where things change

- **New:** a key registration & management page on sefaria.org (create, view, revoke; tied to
  Sefaria accounts).
- **developers.sefaria.org** (ReadMe): "Get a key" onboarding, an authentication section on
  endpoint pages, launch announcement. ReadMe does not issue keys — it links to our page.
- **Account settings:** an "API keys" section.
- **Linker page** (if decision 3 is yes): registration-gated snippet.
- **Mobile apps / MCP server:** receive their own keys per the architecture plan — no product
  surface beyond release notes.
- **Communications** per phase (developer Discord, dev site, email lists) as scheduled in the
  architecture plan.

---

*Drafted by Team Platform with Claude, July 2026 — distilled from the API Key Program architecture
(Lev) and the sc-45692 research series (`docs/research/api-keys/`).*
