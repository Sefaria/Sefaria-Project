# Cross-Module — E2E Tests

**Integration** tests that span both modules (Library ↔ Voices) rather than exercising one feature: authentication-state persistence across the module switcher and deep links, and Library→Voices URL redirects. Runs under the `chrome-cross-module` / `firefox-cross-module` / `safari-cross-module` projects.

> This is an integration area, not a single feature — it lives under `Full testing by Feature/` for discoverability alongside the other suites. Tests navigate to absolute `MODULE_URLS`; the project `baseURL` (Library) is incidental.

New here? Read the root [handbook](../../README.md) first.

---

## [login.spec.ts](login.spec.ts) — auth persistence (`XMOD-L01` – `XMOD-L09`)

| ID         | Scenario                                                   | `@sanity`? |
| ---------- | ---------------------------------------------------------- | ---------- |
| `XMOD-L01` | Login on Library, stay on Library                          | Yes        |
| `XMOD-L02` | Login on Library → switch to Voices; auth transfers        | Yes        |
| `XMOD-L03` | Login on Voices → switch to Library; auth transfers        | No         |
| `XMOD-L04` | Two Library tabs, login on 2nd → "already logged in" error | No         |
| `XMOD-L05` | Two Voices tabs, login on 2nd → error                      | No         |
| `XMOD-L06` | Login on Library, then login on open Voices tab            | No         |
| `XMOD-L07` | Login on Voices, then login on open Library tab            | No         |
| `XMOD-L08` | Logged-in Library user opens a sheet link in Voices        | Yes        |
| `XMOD-L09` | Logged-in Voices user opens a text link in Library         | Yes        |

> ⚠️ **Tripwire:** `XMOD-L04` – `XMOD-L07` perform parallel UI logins as the same QA user. They pass only because Sefaria's Django config doesn't regenerate sibling sessions on fresh login; if that policy tightens upstream, this file becomes the next flake. Mitigation: switch those UI logins to `enAdmin`, or `page.route`-intercept `/login`. See [../../CLAUDE.md](../../CLAUDE.md) rule §2.21.

## [redirects.spec.ts](redirects.spec.ts) — Library→Voices redirects (`XMOD-R01` – `XMOD-R17`)

Four describe blocks: Library→Voices redirects (`R01`–`R08`, path preserved, no 404/5xx), query-param preservation (`R09`–`R10`), 301 status codes (`R11`–`R12`), and no-redirect-loops on Voices (`R13`–`R17`, including `settings/account` correctly 404ing on Voices). **None are `@sanity`** — they're broad redirect coverage, not release-gate smoke.

> The legacy help-sheet redirects (`/sheets/*` → Zendesk) are a separate suite under [../../Misc/](../../Misc/README.md).

---

## Conventions for this folder

- **Entry point:** anonymous-start scenarios use `goToPageWithLang(...)`; logged-in-start use `goToPageWithUser(...)` with `enUser`.
- **ID scheme:** `XMOD-L##` (login/auth), `XMOD-R##` (redirects).
- **Redirect assertions:** use the `assertUrlMatches` / `assertStatusNotError` helpers from [../../utils.ts](../../utils.ts).

## Running

```bash
npx playwright test --project=chrome-cross-module
npx playwright test -g 'XMOD-L08'
```

## Related

- [../../README.md](../../README.md) — the suite handbook (incl. Destructive-auth tests)
- [../../Sanity/README.md](../../Sanity/README.md) — what `@sanity` means + the release-gate suite
- [../../Misc/README.md](../../Misc/README.md) — help-sheet redirect suite
