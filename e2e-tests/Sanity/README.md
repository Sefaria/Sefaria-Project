# Sanity — Release-gate E2E Tests

The **release-gate smoke suite**. These tests validate the core user-facing workflows and cross-module integration that must work before every release — authentication state, navigation, profile/settings, the full sheet lifecycle, search, and URL redirects across the Library and Voices modules. A failing Sanity test is a blocking issue.

Runs under the `chrome-sanity` / `firefox-sanity` / `safari-sanity` projects (`baseURL` = `www.<sandbox-domain>`). **These projects are tag-scoped, not folder-scoped** — they run every test tagged `@sanity` anywhere in the tree, not just the specs in this folder (see §3). New here? Read the root [handbook](../README.md) first — it covers setup, the PageManager pattern, and the conventions these specs follow.

---

## 1. What it covers

| Spec file | IDs | Area |
| --- | --- | --- |
| [cross-module-login.spec.ts](cross-module-login.spec.ts) | Scenarios 1–9 | Auth-state persistence across Library ↔ Voices: login, module-switch, multi-tab concurrent-session handling, cross-module deep links. |
| [user-menu-sanity.spec.ts](user-menu-sanity.spec.ts) | Sanity 1–7 | Core user workflows: login, view profile, edit profile, edit account settings, change language, module switcher, logout. |
| [sheet-workflow-sanity.spec.ts](sheet-workflow-sanity.spec.ts) | Sanity 8a–8j | Full sheet lifecycle (serial): create → title → add source/image/YouTube/reader-source → publish → unpublish → add to collection → delete. |
| [search-sanity.spec.ts](search-sanity.spec.ts) | Sanity 9a–9f | Search across both modules: suggestion click-through, results submission, dropdown section/icon validation (module-specific). |
| [cross-module-redirects.spec.ts](cross-module-redirects.spec.ts) | 4 suites | Library→Voices URL redirects, query-param preservation, 301 status codes, no-redirect-loop on Voices. |
| [../Misc/help-sheet-redirects.spec.ts](../Misc/help-sheet-redirects.spec.ts) | data-driven | Legacy help-sheet URLs → Zendesk (EN + HE). **Runs under the `*-misc` projects**, documented here for completeness. |

---

## 2. Per-spec detail

### cross-module-login.spec.ts — Scenarios 1–9

| # | Scenario | Asserts |
| --- | --- | --- |
| 1 | Login on Library, stay on Library | Login works; user stays on Library; profile pic + logout in user menu. |
| 2 | Login on Library → switch to Voices | Auth transfers Library→Voices via module switcher; logged-in UI on Voices. |
| 3 | Login on Voices → switch to Library | Reverse direction; bidirectional auth persistence. |
| 4 | Two Library tabs, login on 2nd | Concurrent-session handling; "You are already logged in as" error. |
| 5 | Two Voices tabs, login on 2nd | Same, on Voices. |
| 6 | Login on Library, then login on open Voices tab | Cross-module session detection prevents duplicate login. |
| 7 | Login on Voices, then login on open Library tab | Reverse cross-module session detection. |
| 8 | Logged-in Library user opens a sheet link in Voices | Auth persists on external→Voices deep link. |
| 9 | Logged-in Voices user opens a text link in Library | Auth persists on external→Library deep link. |

> ⚠️ **Tripwire:** Scenarios 4–7 perform parallel UI logins as the same QA user. They pass only because Sefaria's Django config doesn't regenerate sibling sessions on fresh login; if that policy tightens upstream, these become the next flake (flagged at the top of the spec, and in [../CLAUDE.md](../CLAUDE.md) rule 21).

### user-menu-sanity.spec.ts — Sanity 1–7

| ID | Test | Asserts |
| --- | --- | --- |
| Sanity 1 | Login | End-to-end UI login (open menu → login → credentials); profile pic appears; redirected back to origin. |
| Sanity 2 | View profile | Profile via the **Voices** user menu (Profile only exists on Voices); name/position/org/bio/image; edit button on own profile. |
| Sanity 3 | Edit profile | Edit position/org/location on Voices; save persists to profile page. |
| Sanity 4 | Edit account settings | Account Settings via **Library** (Library-only); email shown; toggle notifications/reading-history/customs; save-success dialog. |
| Sanity 5 | Change language | EN↔HE toggle; `body` class + UI text update; round-trips back. |
| Sanity 6 | Module switcher | Reaches Voices, Developers (external), More-from-Sefaria products, and back to Library — each in a new tab with the correct URL. |
| Sanity 7 | Logout | UI logout terminates the session; logged-out UI (profile pic gone, user icon shown). **Uses `BROWSER_SETTINGS.enAdmin` — see the destructive-auth gotcha in §5.** |

### sheet-workflow-sanity.spec.ts — Sanity 8a–8j (serial)

Runs `test.describe.configure({ mode: 'serial' })` with **shared state**: 8a creates one sheet that 8b–8j operate on.

| ID | Step | ID | Step |
| --- | --- | --- | --- |
| 8a | Login + create sheet (Voices Create button; unique ID) | 8f | Add source from the Library reader's connections panel |
| 8b | Give the sheet a title (auto-save via content) | 8g | Publish with title/description/tags; Unpublish appears |
| 8c | Add source via text lookup (e.g. "Genesis 1:1") | 8h | Unpublish; Publish button reappears |
| 8d | Add an image (file upload) | 8i | Add to a new collection (unique name) |
| 8e | Add a YouTube video (embed) | 8j | Delete the sheet; redirect to profile; gone from list |

### search-sanity.spec.ts — Sanity 9a–9f

| ID | Test | Asserts |
| --- | --- | --- |
| 9a | Library — suggestion click-through | Type a term (e.g. "abraham"), click a topic suggestion, land on the topic page. |
| 9b | Library — submit search | Press Enter (e.g. "avraham"); results page with the query param; results visible. |
| 9c | Library — dropdown sections/icons | Present: Authors/Topics/Categories/Books; **absent: Users**; correct icons. Term "mid" triggers all four. |
| 9d | Voices — suggestion click-through | Type (e.g. "rashi"), click a suggestion, land on topic/profile. |
| 9e | Voices — submit search | Press Enter (e.g. "shabbat"); Voices results page; may include sheets/topics/users. |
| 9f | Voices — dropdown sections/icons | Present: Topics/Authors/Users; **absent: Categories/Books**; correct icons. Term "rashi" triggers all three. |

### cross-module-redirects.spec.ts — 4 suites

- **Suite 1 — Library→Voices redirects:** `/settings/profile`, `/community`, `/collections` (+ specific collection), `/profile` (+ specific user), `/sheets` (+ specific sheet ID) each redirect to the Voices equivalent with no 404/5xx and path preserved.
- **Suite 2 — Query-param preservation:** redirects keep `?tab=…&test=…` and `?sort=recent`.
- **Suite 3 — 301 status:** `/settings/profile` and `/community` return permanent 301s.
- **Suite 4 — No loops on Voices:** direct Voices URLs don't redirect; `settings/account` correctly 404s on Voices (Library-only feature).

### ../Misc/help-sheet-redirects.spec.ts

Two describes (English + Hebrew), each **data-driven from [../helpDeskLinksConstants.ts](../helpDeskLinksConstants.ts)** — every legacy `/sheets/*` link must 301 to its exact `help.sefaria.org/hc/...` article with no error status. Runs under `*-misc`. (See [../Misc/README.md](../Misc/README.md).)

---

## 3. Running

```bash
# Whole Sanity suite (Chromium) — every test tagged @sanity, anywhere in the tree
npx playwright test --project=chrome-sanity
npm run test:sanity                  # same thing

# See WHICH tests are tagged @sanity without running them (source of truth for
# what `npm run test:sanity` will execute — includes tagged tests in any folder)
npx playwright test --project=chrome-sanity --list

# Cross-browser
npx playwright test --project=firefox-sanity
npx playwright test --project=safari-sanity

# One spec
npx playwright test Sanity/user-menu-sanity.spec.ts --project=chrome-sanity

# One test / scenario by name
npx playwright test -g 'Sanity 8a'
npx playwright test -g 'Sanity 9c'

# Redirect suites
npx playwright test Sanity/cross-module-redirects.spec.ts --project=chrome-sanity
npx playwright test Misc/help-sheet-redirects.spec.ts --project=chrome-misc
```

### The `@sanity` tag — membership is by tag, not by folder

The `chrome-sanity` / `firefox-sanity` / `safari-sanity` projects are defined in
[../../playwright.config.ts](../../playwright.config.ts) with `testDir: './e2e-tests'`
and `grep: /@sanity/` — they scan the **whole tree** and run every test tagged
`@sanity`, regardless of which folder it lives in. (Safe with a single `baseURL`
because the suite navigates to absolute `MODULE_URLS`, never relative paths.)

This means you can pull a release-gate test that lives in **another** folder
(Resource Panel, Library Topics, Voices, …) into the Sanity run **without copy/paste
or moving it** — just tag it `@sanity` where it sits:

```ts
// stays in its home folder; just gets the tag
test.describe('Resource Panel — connections', { tag: '@sanity' }, () => { ... });
// or per-test:
test('RP-012: connections list shows related texts', { tag: '@sanity' }, async () => { ... });
```

It also means tests can **migrate to their proper feature folder over time** and stay
in the Sanity run the whole way — the tag travels with the test, the folder no longer
matters.

**To run the full tagged suite, use the CLI** — `npm run test:sanity` (alias for
`npx playwright test --project=chrome-sanity`). This is the only way that reliably
runs every `@sanity`-tagged test across all folders. Use `firefox-sanity` /
`safari-sanity` for the other browsers.

> ⚠️ **The VS Code Playwright Test Explorer is organised by folder, not by tag.**
> The tree mirrors the filesystem, so a `@sanity`-tagged test in (say)
> `Full testing by Feature/…` is listed under *that* folder — it never appears under
> the `Sanity/` node. **Pressing "Run" on the `Sanity/` folder therefore only runs
> the specs physically inside `Sanity/` — it will NOT run tagged tests that live
> elsewhere.** To run the true tagged suite from the extension, either:
>
> - **filter the tree by tag** — type `@sanity` in the Test Explorer filter box, then run the filtered set; or
> - **run via the project** — in the *Playwright* panel, enable only `chrome-sanity` and "Run all tests" (that project greps the whole tree by tag).
>
> When in doubt, just run `npm run test:sanity` from the terminal — it's the source of truth.

Every spec in this folder is tagged `@sanity` at the `describe` level, so the curated
folder suite is included automatically — pressing "Run" on the `Sanity/` folder in the
extension runs all of *these*, just not the tagged tests in other folders.

---

## 4. Architecture

- **Module-specific UI:** the **Profile** menu exists only on Voices; **Account Settings** only on Library. Tests navigate to the right module before touching module-specific features.
- **Auth strategy:** anonymous-start tests (Sanity 1 UI login, the multi-tab cross-module scenarios) enter via `goToPageWithLang(...)` so they can drive the real login form; logged-in-start tests use `goToPageWithUser(...)`, which reads the read-only storage state [global-setup.ts](../global-setup.ts) writes once at run start (no per-test login, no worker race).
- **Isolation:** most tests are independent (fresh context per test). The one exception is `sheet-workflow-sanity.spec.ts`, which is **serial with shared sheet state** (8a → 8j).
- **Page objects / constants:** all interaction goes through `PageManager`; URLs/selectors/data come from `constants.ts` and `globals.ts`.

---

## 5. Gotchas & maintenance notes

- ⚠️ **Sanity 7 (logout) must use `BROWSER_SETTINGS.enAdmin`, not `enUser`.** A UI logout destroys the server-side Django session row, which would invalidate the shared `auth_*.json` for every concurrent worker reading it. `enAdmin` is the de-facto destructive-auth throwaway — no other Sanity test depends on the admin session staying alive. This was a real flake (Sanity 8h/8i intermittently failed with "User Logged out" pills until Sanity 7 was moved off `enUser`). Any **new** destructive-auth test must use a profile no other concurrent test reads, or intercept the destructive request. Full treatment: root handbook [Destructive-auth tests](../README.md#destructive-auth-tests) and [../CLAUDE.md](../CLAUDE.md) rule 21.
- **Language switch (Sanity 5)** uses a cookie fallback + page reload to dodge Strict Mode locator warnings.
- **Profile edit (Sanity 3)** includes a workaround to clear modularization popups that can block the save button.
- **Sheet workflow (8a–8j)** uses keyboard-navigation workarounds for the plus-button positioning issue, and relies on auto-save triggered by content addition.
- **Test data:** `testUser` (QA Automation account) from `globals.ts`; the sheet-workflow suite creates a unique timestamped sheet and collection each run.

---

## 6. Adding a Sanity test

1. Decide it's genuinely **release-gate** material — a core workflow or cross-module invariant. Narrow feature coverage belongs in a module folder or a `Full testing by Feature/` suite, not here.
2. **New test that belongs in `Sanity/`:** add it to the relevant spec with the next `Sanity N` (or `Scenario N`) label, and make sure its `describe` carries `{ tag: '@sanity' }` — that tag is what puts it in the sanity run, not its location.
3. **Existing test elsewhere you want in the Sanity run:** don't move or copy it — add `{ tag: '@sanity' }` to its `test()` or `test.describe()` in its home folder (see §3). It then runs under the sanity projects while staying put for its own feature suite.
4. If it **destroys or rotates a session** (logout, re-login of a globalSetup profile, password change), read §5 first — use `enAdmin` or intercept the request.
5. Keep it independent unless it genuinely needs shared state (then opt into `serial`, like the sheet workflow).

## 7. Related

- [../README.md](../README.md) — the suite handbook
- [../Misc/README.md](../Misc/README.md) — the help-sheet redirect suite
- [../pages/README.md](../pages/README.md) — page-object index
- [../CLAUDE.md](../CLAUDE.md) — prescriptive rules (incl. destructive-auth)
