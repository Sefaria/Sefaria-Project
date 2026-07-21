# Sefaria API Keys — Product Decisions

*July 2026 · Team Platform*

## What this is

We want everyone who uses our API programmatically to identify themselves with a free key that
takes a minute to get. Keys are for identification, not security. They give us four things: knowing
who builds on Sefaria, a way to reach them, an understanding of how the API is used, and a way to
act when someone abuses it.

The technical side — how a key is checked, and how request volume can be slowed or shut off — is
covered by an architecture document Lev has written. It is being decided in parallel, it works well
for us, and this document assumes it; we refer to it below as **Lev's design**. Where a product
choice here would need a change to that design, we flag it.

Ordinary visitors and search-engine crawlers are never asked for a key, and our own apps carry keys
invisibly. Everything below is about programmatic use.

## 1 · What gets registered: a project, not a person

We'd register projects, not people. One account can hold several projects, each with its own name,
key, and limits — so someone who builds three tools registers three of them, and we see three
consumers rather than one enthusiast. The name and short description are the real payoff: they're
what we read when we ask who does what with our texts. "Which projects use our API, and for what?"
is the question this whole effort exists to answer; a key tied to a person answers a weaker one.

> ⚑ **Flag for Lev.** This changes his design, which currently assumes one key per account — worth
> raising early, since it affects how keys are stored and looked up.

## 2 · The flow

The steps a developer goes through:

1. **Arrive** at the key page — from their Sefaria account, or by following a link in our developer
   docs.
2. **Sign in**, if they aren't already.
3. **Create a project** — give it a name and say what it's for.
4. **Get the key**, shown right away. Nobody is reviewed or turned down.
5. **Return later** to a list of their projects, where they can copy a key, rename a project, add
   another, or delete one. Deleting stops that key working.

Those steps are the substance. How they look on screen is a separate set of choices we'll need to
make: is "create a project" a dialog on the same page or its own page? Does the new key appear in
place or on a project page we route to? Does all of this live in the account area, in the developer
portal, or both?

**Decide:** the on-screen flow — where it lives, and whether each step is a dialog or a full page.

## 3 · Verifying the account

We want a verified account behind every project, because a working email address is what lets us
reach people, and that's half the point. A Sefaria account today doesn't give us one: we never
verify email at signup.

SSO solves this for free — an account signed in through SSO arrives with an address the provider
has already checked. SSO won't necessarily be live before this work lands, but the two fit together
well, so our recommendation is to lean on it: sign in through SSO and you're verified; otherwise we
ask you to connect it before issuing a key. Building our own confirmation email is a real option,
but one to hold in reserve rather than build now.

**Decide:** product should own the full sign-in-to-key path, including what a password-only user
sees when we ask them to connect an account.

## 4 · What we ask when a project is registered

Lev's design asks for a verified email and treats everything else — organisation, what the project
is for — as optional, which keeps the form short. That's a fine default, and the one field worth
weighing against it is a one-line "what are you building?", since that answer is what turns a key
into a real picture of who uses us.

**Decide:** which fields are required, and how they're worded.

## 5 · What people agree to

Issuing a key is a natural moment to set expectations. The simplest version is one checkbox
covering acceptable use, crediting Sefaria where our texts appear, and agreeing to be emailed about
API changes — that last is quietly the most valuable of the three. It could also do more: state
what we ask of people who build on Sefaria, or ask what they'd like from us.

**Decide:** whether this stays a single checkbox or does more, and whether crediting Sefaria is
required or merely requested.

## 6 · The Linker

The Linker — our snippet embedded on partner sites like Times of Israel, Aish, JWA, and My Jewish
Learning — is about 11.5% of all API traffic. Under Lev's design nothing changes for it: those
requests come from ordinary visitors' browsers and pass through untouched. We can already see
roughly which sites they come from, because the browser reports the site each request came from —
but we can't contact those sites, act on one in particular, or rely on the signal, which browsers
trim and a site can switch off.

The alternative is to register new installs: a "get the Linker" page that takes a site name and
contact email and hands back a snippet identifying that site. Existing installs keep working, and
the list fills in over time.

> ⚑ **Flag for Lev.** Registering installs extends his design, which has no notion of identifying
> embeds.

**Decide:** leave the Linker as is, or register new installs — either way we can start contacting
the sites we can already see.

## 7 · Learning about users, not just projects

Keys tell us about projects, not the people using them. When a project calls us straight from its
users' devices, each person reaches us separately and we can estimate its audience; when it calls
from its own server, the whole audience arrives as one caller and stays invisible.

We could let a project send us its own anonymous user identifier and count those. It only works
when a project chooses to use it — but building the small hook now is likely worth it: it lets us
go to a large consumer later and ask them to send it, with nothing new to build on our side. Cheap
future-proofing.

## 8 · How people move to keys

Issuing keys doesn't make anyone use them, so Lev's plan applies pressure in stages, each starting
only when the previous one's measurements justify it:

1. **Measure** — confirm we can reliably tell browsers, crawlers, our own apps, and programmatic
   callers apart.
2. **Launch quietly** — the portal opens, docs update, and every unregistered programmatic request
   comes back with a note pointing at registration and the limits ahead. Developers see it in their
   logs; their users see nothing. Our MCP server gets its key here, and we reach out to the large
   consumers we can identify.
3. **Apply limits** — unregistered callers share one allowance and compete for it; each registered
   project gets a generous allowance of its own. Nothing is blocked outright.
4. **Require keys, endpoint by endpoint** — starting where dependence is concentrated and we know
   the callers, each with a grace period announced in advance.

The last stage begins around six months in, and each stage is gated on what we measure, not the
calendar. This is the part outside developers feel, so it's worth pushing back now if it reads too
fast, too slow, or too blunt.

> **When does product start seeing analytics?** At stage 1 — aggregate traffic broken down by type
> of caller — and per-project analytics from stage 2, as registrations arrive. The picture sharpens
> as adoption grows.

One thing the stages don't settle: where this ends. We could keep unregistered access working
indefinitely at a slower tier — the posture most in keeping with a free library — or treat "key
required" as every endpoint's eventual state. Either works, but the answer shapes what we say
publicly at stage 3.

**Decide:** whether unregistered access stays permanently at a lower tier, or is a step on the way
to keys everywhere.

## 9 · Asking for more room

Some projects will genuinely need more than the standard allowance — a real partner with real
volume. Lev's design already allows lifted limits per key; what's missing is the product side. Is
there a form to ask? Who reviews it, and against what? Is the answer a published policy ("partners
at this scale get this tier") or a case-by-case conversation?

**Decide:** whether we build a standard "request more room" flow, and who owns approving it.

---

*Drafted by Team Platform with Claude, July 2026, from Lev's API Key Program design and the
sc-45692 research series.*
