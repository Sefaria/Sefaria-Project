> Superseded 2026-10-06 by `docs/PHASE7_PLAN.md`.

# Phase 7 — proposal (nothing built yet)

Written 2026-10-05, end of Phase 6. Counts are atlas features (non-retired) per area and how many are done so far.

| Area | Features | Done | Depends on |
|---|---|---|---|
| Topics pages and topic search | 31 | 0 | Needs the topic TOC (embedded in the site's HTML only). Read-only; no account needed. |
| Calendars / learning schedules | 3 | 0 | Read-only; small. |
| Reading a sheet (Voices) | 25 | 0 | Read-only sheets are public; Voices module scope is a product decision. |
| Writing sheets | 28 | 0 | Needs sign-in and writes to Sefaria. |
| Collections | 10 | 0 | Read pages are public; editing needs sign-in. |
| Profiles, following | 11 | 0 | Public profile pages are read-only; following needs sign-in. |
| Saved, history, notes | 11 | 0 | Needs sign-in; today history could live locally. |
| Notifications | 11 | 0 | Needs sign-in. |
| Accounts, settings | 14 | 0 | Sign-in design. |
| AI features (Library Assistant) | 20 | 0 | The live site shows an assistant banner; sends data to Sefaria. |
| Static pages (about, help, …) | 18 | 0 | Mostly content; link out or rebuild? |

## Suggested order, if the owner agrees

1. **Read-only first, no accounts:** topics pages (with the topic TOC, which also finishes the Author/Topic card crumbs in search),
   calendars, public sheets and collections pages. These only read the public API and fit the existing cache/policy model.
2. **Static pages**: link out to sefaria.org or rebuild? (A decision, not work.)
3. **Anything that writes or needs a person** (sheet editor, notes, saved, notifications, profile editing, collections editing):
   after the sign-in design (see `docs/OWNER_QUESTIONS.md` #3).
4. **AI / Library Assistant**: after the owner decides what may be sent to Sefaria.

## Questions

See `docs/OWNER_QUESTIONS.md` (Dicta, analytics, sign-in, feedback endpoint, English face, topic TOC, Phase 7 scope).
