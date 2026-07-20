# Sefaria API Keys — Product Decisions

*July 2026 · Team Platform*

**Settled, for context.** Every programmatic API consumer will identify itself with a free,
instantly-issued key. Keys are identification, not security — the goals are knowing who builds on
Sefaria, being able to reach them, understanding usage, and containing abuse. The architecture is
decided (gating at the network edge, enforcement phased over ~6 months and gated on measurements):
normal browser traffic, search-engine crawlers, and our own apps are **never affected**; only
unregistered *programmatic* traffic feels pressure — first a notice, then shared rate limits,
eventually a per-endpoint key requirement with generous grandfather windows. Registration creates a
**project**: one account can hold several projects, each with its own key and limits, so usage is
understood per project, not per person. This work is slated for **after the SSO project ships**.
Specific limit numbers come from measurement, not from this document. What remains are the six
product decisions below.

## 1 · How someone gets a key

Self-serve, instant, no approval queue — settled. A verified email is required, and Sefaria
accounts today never verify email. Since this work follows SSO, Google/Apple sign-in will exist by
launch, giving two ways to get verification:

- **Option A — require Google/Apple sign-in** to request a key. Provider-verified email, zero
  additional build.
- **Option B — any Sefaria account**; the first key request sends a confirmation email that
  activates the key. A small build; keeps the email/password path open for developers who don't
  use Google/Apple.

**Decide:** require SSO, or fund the confirmation step.

## 2 · What we ask at registration

Beyond the verified email, our suggestion is to require only a **project name** and one question —
*"What are you building?"* (one line). That answer is the analytics payoff of the whole program: a
key alone tells us *that* something calls us; this field tells us *what*. Org name, site URL,
category — optional; we'd recommend keeping the URL optional in particular, since requiring it can
read as though API calls were only permitted from that URL. Each additional required field
measurably costs registrations.

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

## 5 · Where key registration lives

The key backend is ours either way; the question is the front door. The page can live in the
**sefaria.org account area** (where the user's session already is), or be entered from
**developers.sefaria.org** (where developers already are — the docs platform cannot issue keys
itself, so its version is an entry point that hands off to our page), or both.

**Decide:** the primary home — website account area, developer-portal entry, or both.

## 6 · Terms at issuance

Registration ends with a checkbox; the policy team drafts the text. The product call embedded in
it: **attribution — required, or requested?** — plus acceptable use and consent to be contacted
about API changes (quietly the most valuable line in it).

**Decide:** the attribution posture.

## Where things change

- **New:** a key registration & management page (create, view, revoke; tied to Sefaria accounts) —
  location per decision 5.
- **developers.sefaria.org** (ReadMe): "Get a key" onboarding, an authentication section on
  endpoint pages, launch announcement.
- **Account settings:** an "API keys" section.
- **Linker page** (if decision 3 is yes): registration-gated snippet.
- **Mobile apps / MCP server:** currently keyless — today no Sefaria client sends a key, including
  our own MCP server. Each receives its own key per the architecture plan (MCP at soft launch);
  no product surface beyond release notes. Per-user identity on MCP is a separate future project.
- **Communications** per phase (developer Discord, dev site, email lists) as scheduled in the
  architecture plan.

---

*Drafted by Team Platform with Claude, July 2026 — distilled from the API Key Program architecture
(Lev) and the sc-45692 research series (`docs/research/api-keys/`).*
