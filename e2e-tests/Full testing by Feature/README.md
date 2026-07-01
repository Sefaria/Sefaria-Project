# Full testing by Feature

Home for **deep, plan-driven feature suites** — features that ship in one module and warrant their own dedicated test folder *and* their own Playwright project (with its own `baseURL`), rather than living among a module's general UI specs.

New here? Read the root [handbook](../README.md) first.

---

## The suites

| Folder | Test IDs | What it covers | Module / baseURL |
| --- | --- | --- | --- |
| [Resource Panel/](Resource%20Panel/README.md) | `RP-001` → `RP-212` (79 active across 19 specs) | The `ConnectionsPanel` reader sidebar that opens when a segment is clicked — Resources hub, TOC nav, About-This-Text, Translations, Lexicon, Connections/Text lists, Topics, Web Pages, Sheets, Manuscripts, Notes, Add-to-Sheet, Share, Search-in-Text, Feedback, Guide, Hebrew UI. | Library / `www.<domain>` |
| [Voices Topics/](Voices%20Topics/README.md) | `TOV-001` → `TOV-019` (17 active across 2 specs) | Voices topic pages (`voices.<domain>/topics/<slug>`) and the `/topics` landing — display, language support, sheet listing, sorting, related-topic nav, A–Z browse, cross-module language persistence. | Voices / `voices.<domain>` |
| [Library Topics/](Library%20Topics/README.md) | `LIB-001` → `LIB-029` (31 active across 8 specs) | Library topic pages (`www.<domain>/topics/<slug>`) and the `/topics` landing — text-source display, language support + source-language toggle, source listing / infinite scroll / filter / sort, related-topic + category nav, search autocomplete, A–Z browse, cross-module (Library↔Voices) behavior, error handling, a11y/responsive, performance/analytics. | Library / `www.<domain>` |
| [Search/](Search/README.md) | `SRCH-001` → `SRCH-006` | Header search across both modules: autocomplete suggestion click-through, results submission, module-specific dropdown sections/icons. All `@sanity`. | Library + Voices (absolute URLs) / `www.<domain>` |
| [User Menu/](User%20Menu/README.md) | `UMN-001` → `UMN-007` | Header user-menu flows: login, profile view/edit, account settings, language switch, module switcher, logout. `UMN-002`–`UMN-007` are `@sanity`. | Library + Voices / `www.<domain>` |
| [Cross-Module/](Cross-Module/README.md) | `XMOD-L01` → `L09`, `XMOD-R01` → `R17` | Library↔Voices **integration** (not one feature): auth-state persistence across the module switcher/deep links, and Library→Voices URL redirects. 4 login scenarios are `@sanity`. | Library + Voices / `www.<domain>` |

Each suite has its own README with a mode/navigation map, per-test detail, reference data (API-verified slugs/refs), and a "common gotchas" playbook. **The [Resource Panel README](Resource%20Panel/README.md) is the gold-standard template** — model new feature docs on it.

---

## When does a feature earn a folder here?

Put a feature suite under `Full testing by Feature/<feature>/` when **all** of these hold:

- It ships in **one module** and has a **deep test matrix** (typically a planned, ID'd set of tests — `RP-###`, `TOV-###`).
- It benefits from its **own Playwright project** (own `testDir` + `baseURL`), so it can be run and reported in isolation.
- It has enough surface to justify a dedicated README (mode maps, reference data, gotchas).

Otherwise: module-specific UI → `library/` or `voices/`; cross-module integration → `Cross-Module/`; platform invariants → `Misc/`. Release-gate smoke is the `@sanity` **tag** applied wherever the test lives, not a folder — see [../Sanity/README.md](../Sanity/README.md). See also the root [Where does my test go?](../README.md#where-does-my-test-go).

> Note: `Search/`, `User Menu/`, and `Cross-Module/` are slightly different from the deep CSV-driven suites above — they're smaller, cross-module areas that also host most of the `@sanity` release-gate tests (relocated out of the former `Sanity/` test folder). They still each get their own folder + project for isolation.

To add a third suite, create the folder + its README, then register `chrome/firefox/safari-<feature>` projects in [../../playwright.config.ts](../../playwright.config.ts) pointing at it.

## Related

- [../README.md](../README.md) — the suite handbook
- [../pages/README.md](../pages/README.md) — page-object index (Resource Panel and Voices Topics each have a dedicated POM)
