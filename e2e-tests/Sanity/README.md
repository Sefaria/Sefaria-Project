# Sanity — the release-gate suite (`@sanity`)

This folder is **documentation only**. It defines what the Sanity suite *is* and how to add a test to it. The actual specs live in their feature folders — Sanity membership is defined by a **tag**, not by this folder.

> **TL;DR** — A Sanity test is any test marked `{ tag: '@sanity' }`. To run them all: `npm run test:sanity`. To see the live list: `npx playwright test --project=chrome-sanity --list`.

---

## 1. What a Sanity test is

The **release-gate smoke set**: the handful of tests that must pass before every release. They cover the core, cross-cutting user journeys — authentication, the user menu, search, the sheet lifecycle, cross-module auth — the things that, if broken, mean "do not ship." A failing Sanity test is a blocking issue.

Sanity is deliberately **small and fast**. It is *not* where deep feature coverage goes — a feature's full matrix lives in its own folder (e.g. `Full testing by Feature/Resource Panel/`). Sanity cherry-picks the few tests from across those suites that are release-critical.

## 2. How membership works — the `@sanity` tag

Membership is by **Playwright tag**, not by file location. The `chrome-sanity` / `firefox-sanity` / `safari-sanity` projects in [../../playwright.config.ts](../../playwright.config.ts) are defined as:

```ts
{ name: 'chrome-sanity', testDir: './e2e-tests', grep: /@sanity/, use: { ... } }
```

i.e. they scan the **whole tree** and run every test tagged `@sanity`, wherever it lives. A test stays in its feature folder (and its feature project) *and* joins the Sanity run just by carrying the tag. This is safe with a single `baseURL` because the tagged specs navigate to absolute `MODULE_URLS`, never relative paths.

Consequence: **this folder holds no specs.** The release-gate tests live where they belong by feature, and the tag is what gathers them.

## 3. How to tag a test

Tag a whole suite at the `describe` level, or an individual test — both are matched by `--grep @sanity`:

```ts
// whole suite
test.describe('Search', { tag: '@sanity' }, () => { ... });

// or one test (use this when only some tests in a file are release-gate)
test('UMN-004: User can edit account settings', { tag: '@sanity' }, async () => { ... });
```

Rule of thumb: **describe-level** when the entire suite is release-gate (e.g. Search, Sheet Lifecycle); **per-test** when only a subset is (e.g. only 4 of the 9 Cross-Module login scenarios, only `UMN-002`–`UMN-007`).

## 4. Where the current Sanity tests live

| Suite | Folder | IDs tagged `@sanity` |
| --- | --- | --- |
| Search | [../Full testing by Feature/Search/](../Full%20testing%20by%20Feature/Search/) | `SRCH-001` – `SRCH-006` (all) |
| User Menu | [../Full testing by Feature/User Menu/](../Full%20testing%20by%20Feature/User%20Menu/) | `UMN-002` – `UMN-007` (not `UMN-001`) |
| Sheet Lifecycle | [../voices/sheet-lifecycle.spec.ts](../voices/sheet-lifecycle.spec.ts) | `SHT-001` – `SHT-010` (all) |
| Cross-Module (auth) | [../Full testing by Feature/Cross-Module/login.spec.ts](../Full%20testing%20by%20Feature/Cross-Module/login.spec.ts) | `XMOD-L01`, `L02`, `L08`, `L09` |
| Resource Panel (opening) | [../Full testing by Feature/Resource Panel/opening-and-general.spec.ts](../Full%20testing%20by%20Feature/Resource%20Panel/opening-and-general.spec.ts) | `RP-001` – `RP-006` |

This table is a convenience snapshot — **the authoritative, always-current inventory is the runner:**

```bash
npx playwright test --project=chrome-sanity --list
```

## 5. Running

```bash
# The whole tagged suite (Chromium)
npm run test:sanity                                   # = playwright test --project=chrome-sanity

# Cross-browser
npx playwright test --project=firefox-sanity
npx playwright test --project=safari-sanity

# Just list what's tagged (no run) — source of truth for membership
npx playwright test --project=chrome-sanity --list

# One tagged test by ID
npx playwright test -g 'SHT-001'
npx playwright test -g 'SRCH-003'
```

> ⚠️ **The VS Code Playwright Test Explorer is organised by folder, not by tag.** A `@sanity`-tagged test is listed under its own feature folder, never under a "Sanity" node — so there is no folder to "press Run on" to get the suite. To run the tagged set from the extension, either type `@sanity` in the Test Explorer filter box, or enable only the `chrome-sanity` project in the *Playwright* panel and Run All. When in doubt, run `npm run test:sanity` from the terminal — it's the source of truth.

## 6. How to add a test to Sanity

1. **Decide it's genuinely release-gate** — a core workflow or cross-module invariant. Narrow feature coverage does *not* belong in Sanity; it belongs in the feature's own suite.
2. **Write/keep the test in its feature folder** (not here) with that feature's ID prefix.
3. **Tag it** `{ tag: '@sanity' }` (describe- or test-level per §3). That's the entire act of "adding it to Sanity."
4. **If it destroys or rotates a session** (UI logout, re-login of a globalSetup profile, password change), it must use a profile no other concurrent test reads — currently `enAdmin` is the de-facto throwaway (`UMN-007` already destroys it every run) — or intercept the destructive request. See [../CLAUDE.md](../CLAUDE.md) rule §2.21 and the root handbook's [Destructive-auth tests](../README.md#destructive-auth-tests).
5. **Keep it independent** unless it genuinely needs shared state (then opt into `test.describe.serial`, like Sheet Lifecycle).

## 7. Related

- [../README.md](../README.md) — the suite handbook
- [../CLAUDE.md](../CLAUDE.md) — prescriptive rules (incl. destructive-auth §2.21)
- Feature suites that contribute `@sanity` tests: [Search](../Full%20testing%20by%20Feature/Search/README.md) · [User Menu](../Full%20testing%20by%20Feature/User%20Menu/README.md) · [Cross-Module](../Full%20testing%20by%20Feature/Cross-Module/README.md) · [Voices (Sheet Lifecycle)](../voices/README.md) · [Resource Panel](../Full%20testing%20by%20Feature/Resource%20Panel/README.md)
