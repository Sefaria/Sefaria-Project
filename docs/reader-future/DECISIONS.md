# Decisions

Every decision about the future reader, newest first. Written by Claude Tag from a `Decision:` message in **#reader-future** (or an
explicit "this is decided" in a thread), and mirrored in the area's own Decisions section.

| Date | Area | Decision | Decided by | Source |
|---|---|---|---|---|
| 2026-10-06 | routing | Legacy URLs are read and written exactly as sefaria.org writes them, including its numbering (a sidebar takes a panel number slot). | Akiva (owner) | Claude Code session; recorded in `reader-next/docs/MULTIPANEL_PLAN.md` §3 |
| 2026-10-06 | reader-shell | A citation in the text closes whatever is next to its panel and opens there, exactly as sefaria.org. | Akiva (owner) | `reader-next/docs/MULTIPANEL_PLAN.md` §3 |
| 2026-10-06 | platform-seo | The new client replaces the legacy Node SSR server: page requests reach it first; it passes Django's pages, writes and its own 404s to Varnish. | Akiva (owner) | `reader-next/docs/DEPLOYMENT.md` |
| 2026-10-06 | accounts | Port the SSO login page into the new client; e2e uses the existing e2e test accounts. | Akiva (owner) | `reader-next/docs/PHASE7_PLAN.md` §1 |
| 2026-10-06 | analytics | One analytics module, same GA4/GTM property, same event names and parameters as sefaria.org. | Akiva (owner) | `reader-next/docs/PHASE7_PLAN.md` §3 |
| 2026-10-06 | text-display | English text is set in the legacy site's fonts (Adobe Garamond Pro). | Akiva (owner) | `reader-next/docs/features/CHANGELOG.md` |
| 2026-10-06 | search | Hebrew search merges Dicta's results as sefaria.org does. | Akiva (owner) | `reader-next/docs/features/CHANGELOG.md` |

_The rows above are decisions taken before the channel existed, carried over so the record starts complete._
