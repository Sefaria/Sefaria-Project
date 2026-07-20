# Sefaria API Keys — Product Decisions

*July 2026 · Team Platform*

## What this is

We want everyone who uses our API programmatically to identify themselves with a free key that
takes a minute to get. Keys are for identification, not security: we want to know who builds on
Sefaria, be able to reach them, understand how the API is used, and have a way to act when someone
abuses it.

A first draft of the technical program — how keys are checked, and how request volume can be slowed
or shut off — has been written by Lev and is being decided in parallel. It works well for us, so
this document assumes it. Where a product choice here would require a change to that draft, we say
so in place.

Ordinary visitors and search-engine crawlers are never asked for a key, and our own apps will carry
keys invisibly. Everything below concerns *programmatic* use.

## 1 · What gets registered: a project, not a person

We'd register **projects** rather than people: one account can hold several, each with its own name,
key, and limits, so someone who builds three tools appears as three consumers rather than one
enthusiast. The name and description aren't only for their benefit — they're what we search when we
want to know who does what with our texts. "Which projects use our API, and for what?" is the
question this effort exists to answer; a key per person answers a different and less useful one.

*Note for engineering:* the current draft assumes one key per account, so this is a change to it —
worth raising early, since it affects how keys are stored and looked up.

## 2 · The flow, end to end

1. **Sign in** to a Sefaria account.
2. **Create a project** — name it, and say what it's for.
3. **Get the key**, immediately. Nobody is reviewed or turned down.
4. **Come back later** to a list of projects: see each key, rename, add another, or delete one no
   longer used. Deleting stops that key working.

The page can live in the sefaria.org account area, on developers.sefaria.org, or both — our
documentation site can link to it, but the page handing out keys must be one we build.

**Decide:** where the primary home is, and whether anything beyond create / view / rename / delete
belongs in the first version.

## 3 · Making sure the email is real

We want a working email address per project, since being able to reach people is half the point. A
Sefaria account today doesn't prove one: we never verify email addresses at signup.

Google and Apple sign-in gives us this for free — those accounts arrive with an address the
provider has already checked. It won't necessarily be live before this work lands, but the two fit
together well, and our recommendation is to lean on it: sign in that way and you're verified; sign
in with a password and we'd ask you to connect Google or Apple first. Sending our own confirmation
email is a real option, worth keeping in reserve rather than building now.

**Decide:** product should own the full sign-in-to-key flow, including what a password-only user
sees at the moment we ask them to connect an account.

## 4 · What we ask when a project is registered

The draft asks for a verified email and treats everything else — organisation, URL, what the
project is for — as optional, erring toward fewer abandoned forms. That's the default unless product
wants otherwise.

The trade in the other direction: each required field costs some registrations, and the "what are
you building?" answer is the one that turns a key into an answer about who uses us and why. A site
URL is best left optional whatever else is decided — asking for it can read
as though calls were only permitted from that address.

**Decide:** which fields are required, and their wording.

## 5 · What people agree to

Issuing a key is a natural moment to set expectations. The simplest version is a single checkbox:
acceptable use, crediting Sefaria where our texts appear, and agreeing to be emailed about API
changes — quietly the most valuable of the three. It could also do more: say what we ask of people
who build on Sefaria, or ask what they'd like from us.

**Decide:** whether this stays a checkbox or becomes something fuller, and whether crediting
Sefaria is required or requested.

## 6 · The Linker

The Linker — our snippet embedded on partner sites like Times of Israel, Aish, JWA and My Jewish
Learning — accounts for about 11.5% of all API traffic.

**As drafted, nothing changes for it.** Those requests come from ordinary visitors' browsers, so
they pass through untouched, and we can already see roughly which sites they come from, because
browsers report the site a request came from. What we lack is a way to contact those sites, act on
one specifically, or any guarantee the signal lasts — browsers routinely trim it, and a site can
switch it off.

The alternative is to **register new installs**: a "get the Linker" page asking for a site name and
contact email, handing back a snippet that identifies that site. Existing installs keep working and
the list fills in over time. *Note for engineering:* this would extend the
current draft, which has no notion of identifying embeds.

**Decide:** leave it as is or register new installs — noting we can start contacting the sites we
can already see either way.

## 7 · What we will and won't learn about people

Keys tell us about projects, not their users. When a project's app calls us straight from its users'
devices, those arrive as separate visitors and we can estimate reach; when it calls us from its own
server, its entire audience reaches us as one caller and stays invisible. We could let projects send
an anonymous user identifier of their own, but it only works when they choose to and raises
questions about what that identifier is — so we wouldn't ask now, though leaving room for it later
is cheap.

## 8 · How people actually end up using keys

Issuing keys doesn't get anyone to use them, so the draft applies pressure in stages, each starting
only when measurements from the previous one justify it:

1. **Measure** — confirm we can reliably tell apart browsers, crawlers, our own apps, and
   programmatic callers.
2. **Launch quietly** — the portal opens, documentation updates, and every unregistered
   programmatic request comes back with a note pointing at registration and the limits that are
   coming. Developers see it in their logs; nobody's users see anything. Our MCP server gets its key
   here, and we contact the large consumers we can identify.
3. **Apply limits** — everyone without a key draws on one shared allowance and competes with the
   others for it; each registered project gets a generous allowance of its own. Nothing is blocked
   outright.
4. **Require keys, endpoint by endpoint** — starting where dependence is concentrated and we know
   who the callers are, each with a grace period announced in advance.

The last stage begins around six months in, and each is gated on measurement rather than the
calendar. This is the part external developers will feel, so it's worth pushing back now if it reads
too fast, too slow, or too blunt.

One thing the stages don't settle: where this ends. We could keep unregistered access working
indefinitely at a humbler speed — the posture most in keeping with a free public library — or treat
"key required" as the destination for every endpoint. Either works, but the answer changes what we
say publicly at stage 3.

**Decide:** whether unregistered access is permanently supported at a lower tier, or a transitional
state.

## 9 · When we need to step in, and when someone needs more

Two directions, both unanswered. **If a project misbehaves**, we can slow its key or switch it off —
we'd suggest never switching off first: an email, then a reduced limit, then off, with a person
reachable at each step. That is the value of contact details, and someone must own that inbox. **If
a project needs more room** than the standard allowance, there should be a way to ask and someone
able to say yes; the draft allows lifted limits per key, but not who decides.

**Decide:** who owns the "we need to talk to you" conversation and the "can we have more?" request,
and whether either is published policy or handled case by case.

---

*Drafted by Team Platform with Claude, July 2026, from the API Key Program draft (Lev) and the
sc-45692 research series.*
