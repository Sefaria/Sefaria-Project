# Full testing by Feature

Home for **deep, plan-driven feature suites** — features that ship in one module and warrant their own dedicated test folder *and* their own Playwright project (with its own `baseURL`), rather than living among a module's general UI specs.

New here? Read the root [handbook](../README.md) first.

---

## The suites

| Folder | Test IDs | What it covers | Module / baseURL |
| --- | --- | --- | --- |
| [Resource Panel/](Resource%20Panel/README.md) | `RP-001` → `RP-212` (79 active across 19 specs) | The `ConnectionsPanel` reader sidebar that opens when a segment is clicked — Resources hub, TOC nav, About-This-Text, Translations, Lexicon, Connections/Text lists, Topics, Web Pages, Sheets, Manuscripts, Notes, Add-to-Sheet, Share, Search-in-Text, Feedback, Guide, Hebrew UI. | Library / `www.<domain>` |
| [Voices Topics/](Voices%20Topics/README.md) | `TOV-001` → `TOV-019` (17 active across 2 specs) | Voices topic pages (`voices.<domain>/topics/<slug>`) and the `/topics` landing — display, language support, sheet listing, sorting, related-topic nav, A–Z browse, cross-module language persistence. | Voices / `voices.<domain>` |

Each suite has its own README with a mode/navigation map, per-test detail, reference data (API-verified slugs/refs), and a "common gotchas" playbook. **The [Resource Panel README](Resource%20Panel/README.md) is the gold-standard template** — model new feature docs on it.

---

## When does a feature earn a folder here?

Put a feature suite under `Full testing by Feature/<feature>/` when **all** of these hold:

- It ships in **one module** and has a **deep test matrix** (typically a planned, ID'd set of tests — `RP-###`, `TOV-###`).
- It benefits from its **own Playwright project** (own `testDir` + `baseURL`), so it can be run and reported in isolation.
- It has enough surface to justify a dedicated README (mode maps, reference data, gotchas).

Otherwise: module-specific UI → `library/` or `voices/`; cross-module release-gate smoke → `Sanity/`; platform invariants → `Misc/`. See the root [Where does my test go?](../README.md#where-does-my-test-go).

To add a third suite, create the folder + its README, then register `chrome/firefox/safari-<feature>` projects in [../../playwright.config.ts](../../playwright.config.ts) pointing at it.

## Related

- [../README.md](../README.md) — the suite handbook
- [../pages/README.md](../pages/README.md) — page-object index (Resource Panel and Voices Topics each have a dedicated POM)
