# Decisions

Every decision about the future reader, newest first. Written by Claude Tag from a `Decision:` message in **#reader-future** (or an
explicit "this is decided" in a thread), and mirrored in the area's own Decisions section.

| Date | Area | Decision | Decided by | Source |
|---|---|---|---|---|
| 2026-10-28 | routing (cross-cutting; ai, reader-shell) | Reader state in the new client is managed with TanStack Router. Other applications must be able to update it easily, and for parity every event subscription sefaria.org's reader has today (the chatbot's `sefaria:bootstrap-url` first) keeps its effect. | Akiva Berger (owner) | [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193924097339) |
| 2026-10-28 | analytics (cross-cutting) | Analytics parity: the future reader keeps every analytics event and dimension the current reader has, captures every current event the same way, and uses the same vanilla JS data tag (`data-anl-*`, `static/js/analyticsEventTracker.js`). Extends the 2026-10-06 analytics decision. | Akiva Berger (owner) | [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193685517999) |
| 2026-10-28 | text-display (cross-cutting) | Dark mode is a supported feature of the future reader, on desktop and mobile. | Akiva Berger (owner); mobile and priority stressed by Sarah Kreitman; likely most requested feature per Rachel Buckman | [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793181488777949) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793181661157789?thread_ts=1793181488.777949&cid=C0C9EGTL468) |
| 2026-10-06 | routing | Legacy URLs are read and written exactly as sefaria.org writes them, including its numbering (a sidebar takes a panel number slot). | Akiva (owner) | Claude Code session; recorded in `reader-next/docs/MULTIPANEL_PLAN.md` §3 |
| 2026-10-06 | reader-shell | A citation in the text closes whatever is next to its panel and opens there, exactly as sefaria.org. | Akiva (owner) | `reader-next/docs/MULTIPANEL_PLAN.md` §3 |
| 2026-10-06 | platform-seo | The new client replaces the legacy Node SSR server: page requests reach it first; it passes Django's pages, writes and its own 404s to Varnish. | Akiva (owner) | `reader-next/docs/DEPLOYMENT.md` |
| 2026-10-06 | accounts | Port the SSO login page into the new client; e2e uses the existing e2e test accounts. | Akiva (owner) | `reader-next/docs/PHASE7_PLAN.md` §1 |
| 2026-10-06 | analytics | One analytics module, same GA4/GTM property, same event names and parameters as sefaria.org. | Akiva (owner) | `reader-next/docs/PHASE7_PLAN.md` §3 |
| 2026-10-06 | text-display | English text is set in the legacy site's fonts (Adobe Garamond Pro). | Akiva (owner) | `reader-next/docs/features/CHANGELOG.md` |
| 2026-10-06 | search | Hebrew search merges Dicta's results as sefaria.org does. | Akiva (owner) | `reader-next/docs/features/CHANGELOG.md` |

_The rows above are decisions taken before the channel existed, carried over so the record starts complete._
