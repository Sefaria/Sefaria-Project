# Mobile E2E Tests

End-to-end coverage for the **mobile** Sefaria Library experience — the hamburger drawer rendered by `<Header>` (`Sefaria-Project/static/js/Header.jsx`) when the viewport is below the tablet breakpoint (`width < 843px`, per `static/css/breakpoints.css`).

These tests run under a dedicated config so they don't share viewport / project state with the desktop suite.

---

## Running

```bash
# Both mobile projects (Pixel 5 Chrome + iPhone 13 Safari)
npx playwright test --config=playwright.mobile.config.ts

# Single project
npx playwright test --config=playwright.mobile.config.ts --project=chrome-mobile-library
npx playwright test --config=playwright.mobile.config.ts --project=safari-mobile-library

# Single test by ID
npx playwright test --config=playwright.mobile.config.ts -g 'HAM-M001'

# Slow environment
TIMEOUT_MULTIPLIER=2 npx playwright test --config=playwright.mobile.config.ts
```

---

## Why a separate Playwright config?

Sefaria's mobile chrome (the entire `<MobileNavMenu>` component) only mounts when `Sefaria.getBreakpoint() === MOBILE`, which is gated on `window.innerWidth < 843px`. The desktop projects in `playwright.config.ts` use `Desktop Chrome` / `Desktop Firefox` / `Desktop Safari` device descriptors — all wider than 843px — so they never exercise the mobile components at all.

[../../playwright.mobile.config.ts](../../playwright.mobile.config.ts) defines two device-based projects below the breakpoint:

| Project | Device | Width |
|---|---|---|
| `chrome-mobile-library` | Pixel 5 | 393 × 851 |
| `safari-mobile-library` | iPhone 13 | 390 × 844 |

Tests live under `e2e-tests/mobile/`; the POM is shared (`pages/mobileHamburgerPage.ts`) and accessed via `pm.onMobileHamburger()` like every other page object.

---

## Test taxonomy

[hamburger-menu.spec.ts](hamburger-menu.spec.ts) is split into 5 `describe` blocks. Each test starts from a fresh anonymous English Library page in `beforeEach` so cases stay independent.

| Group | IDs | What it covers |
|---|---|---|
| **Structure** | HAM-S001, HAM-S002 | Mobile header chrome (hamburger / Library logo / A·א toggle), and every item rendered in the open drawer. |
| **Search dropdown** | HAM-Q001, HAM-Q002 | Typing `mid` in the in-drawer search surfaces only Authors / Topics / Categories / Books; exiting the search returns the user to the open drawer. |
| **In-module navigation** | HAM-N001 – HAM-N004 | Texts → `/texts`, Topics → `/topics`, About Sefaria → `/mobile-about-menu`, More from Sefaria → `/products`. |
| **External-tab links** | HAM-X001, HAM-X002 | Donate and Get Help open new tabs to external URLs; closing the popup leaves the original tab on the Library page. |
| **Cross-module navigation** | HAM-M001, HAM-M002 | Voices on Sefaria opens a new tab on `voices.*`; that tab's hamburger replaces "Voices on Sefaria" with "Sefaria Library". Developers on Sefaria opens a new tab to `developers.sefaria.org`. |

---

## Mapping: user spec → implemented tests

The original ask was a single sequential user journey. Per the project's testing rules (each test should be independent unless explicitly serial), the journey was decomposed into focused, reproducible tests. The mapping below is exact — every requested step is covered, but grouped where it improves reliability and isolation.

| Step in user spec | Implemented as |
|---|---|
| Click hamburger | Covered implicitly by `openMenu()` in every test's `beforeEach`. |
| Switch to English, click hamburger again, verify all expected items | **HAM-S001** (header artifacts) + **HAM-S002** (every drawer item: search bar, Texts, Topics, Learning Schedules, Donate, Language choices, Get Help, About Sefaria, Voices on Sefaria, Developers on Sefaria, More from Sefaria, Sign up / Login). |
| Search "mid" → only authors / topics / categories / books, then exit | **HAM-Q001** (allowed set assertion + every canonical section present + excluded sections absent) + **HAM-Q002** (exit returns to drawer). |
| Click Texts → verify page | **HAM-N001** |
| Hamburger → Topics → verify | **HAM-N002** |
| Hamburger → Donate → back to hamburger page | **HAM-X001** (Donate opens new tab; closing it leaves us on the library page). See "Behaviour change" note below. |
| Hamburger → Help → back to hamburger page | **HAM-X002** (same popup pattern). |
| About Sefaria → verify | **HAM-N003** |
| Hamburger → Voices on Sefaria → verify | **HAM-M001** (verifies on `voices.*`). |
| Voices hamburger replaces "Voices on Sefaria" with "Sefaria Library" | **HAM-M001** continued — the same test re-opens the voices hamburger and asserts the swap. |
| Developers on Sefaria, then back | **HAM-M002** (popup pattern from the voices hamburger). |
| More from Sefaria → verify | **HAM-N004** |

---

## What changed for the better (and why)

While building the POM I had to test against the real DOM repeatedly — several initial assumptions turned out to be wrong and the corrections made the suite materially more robust than the literal spec.

### 1. Cross-module links open a **new tab**, not a same-tab navigation
The original spec implied "click the device's back button to get back to the hamburger page" for cross-module links. Reading `Sefaria-Project/static/js/ReaderApp.jsx:1264` revealed that `openURL` calls `window.open(url, '_blank')` whenever the link's `data-target-module` differs from the active module. So Voices on Sefaria, Sefaria Library, Developers on Sefaria, Donate, and Get Help all spawn popups.

**Improvement:** the POM now uses `context.waitForEvent('page')` and closes the popup, which is semantically equivalent to the user's "back button" request *and* deterministic across mobile browsers (where back-button emulation diverges).

### 2. A/א toggle has no text — it's two SVGs swapped by CSS
The literal assertion `toHaveText(/^A$/)` failed because `LanguageToggleButton` (`Misc.jsx:716`) renders `<img class="en" src="aleph.svg">` + `<img class="he" src="aye.svg">` and CSS hides one based on the parent's interface-language class.

**Improvement:** assertion now checks both `img.en` and `img.he` exist in the `.languageToggle` anchor. Survives any future glyph or text change.

### 3. Search-result categories: read item-level `alt`, not the `type-title` div
My first implementation read `.type-title` text content from each `.search-group-suggestions` wrapper. Result: empty array — those divs hydrate momentarily empty as Downshift renders the dropdown.

**Improvement:** the POM now collects per-item `<img alt="AuthorTopic|Topic|TocCategory|ref">` tokens directly from the results listbox. This:
- is **language-independent** (alt is the raw server type, not translated),
- doesn't race against InterfaceText hydration,
- explicitly asserts both that every section in the allowed set is **present** *and* that every excluded section is **absent** — instead of just checking labels.

### 4. `#interruptingMessageOverlay` blocks taps on fresh voices popups
On cross-module navigation to `voices.*`, an "interrupting message" modal frequently injects after the header mounts and intercepts the next tap on the hamburger button. The existing `hideAllModalsAndPopups` utility looks for the close button but races the modal's mount.

**Improvement:** `waitForHeaderReady()` now both clicks the close button *and* forces `display:none` on `#interruptingMessageOverlay` / `#interruptingMessageBox` via `page.evaluate`. The taps that follow are no longer racing the overlay.

### 5. `<a id="searchInput">` is really role=combobox
`#searchInput` scoped under the mobile nav locator wasn't found because Downshift enhances the input with `role="combobox"` and Playwright's strict locator can't resolve through the scoping. Switching to `getByRole('combobox', { name: 'Search for Texts or Keywords Here' })` works and is more readable.

### 6. `Get Help` is rendered as `<a role="button">`, not a link
The shared `<Button>` component (`common/Button.jsx`) emits `<a href=... role="button">` when given an `href`. `getByRole('link', { name: 'Get Help' })` therefore misses it.

**Improvement:** POM uses `getByRole('button', { name: 'Get Help' })`. This is the *accessible* role users (and screen readers) experience.

### 7. NextRedirectAnchor flips `href` to `#` at hydration
The in-drawer language toggle was scoped on `a[href="/interface/english"]`. At runtime, `NextRedirectAnchor` swaps the href to `#` and intercepts clicks in JS, so that selector found nothing.

**Improvement:** locators now anchor on the stable `.int-en` / `.int-he` class names that the React source guarantees.

### 8. Test independence
Instead of one giant sequential test mirroring the user's narrative, the spec was split into 12 independent tests. Each `beforeEach` re-creates a fresh Library page and re-opens the hamburger. Benefits:
- Any single failure points at exactly one product behaviour.
- Tests can run in parallel.
- Re-running a single failure (`npx playwright test -g HAM-M002`) doesn't require replaying earlier steps.

---

## Locator philosophy

In priority order (per the project's `CLAUDE.md` §2 rule 5):

1. **`getByRole`** — Menu button, Library-logo link, navigation landmark, combobox, button "Get Help".
2. **`getByLabel`** — search aria-label.
3. **`href` anchor** — Texts (`/texts`), Topics (`/topics`), About (`/mobile-about-menu`), More from Sefaria (`/products`), Developers (`https://developers.sefaria.org`).
4. **Visible text** — Donate, Voices on Sefaria, Sefaria Library (cross-module swap).
5. **CSS class** — only where no semantic handle exists: `.mobileNavMenu`, `.mobileModuleSwitcher`, `.mobileInterfaceLanguageToggle`, `.int-en` / `.int-he`, `.login.signupLink` / `.login.loginLink`.

All timeouts go through `t()` from `globals.ts`; nothing is hardcoded.

---

## Reliability stance

Per the user's "I want the tests to be reliable and not pass if something doesn't exist" requirement:

- **No silent fallbacks.** When the POM needs an element it asserts it visible with `expect(...).toBeVisible({ timeout: t(...) })`. A missing artefact fails the test with a clear locator name.
- **Search category assertion is bidirectional.** It would have been easy to assert "all 4 expected sections appear" and stop there. Instead, the suite also asserts "no excluded section appears" — so if a regression lands a `User` or `Collection` result in the Library dropdown, HAM-Q001 catches it.
- **Cross-module assertion verifies the swap, not just the destination.** HAM-M001 doesn't only check we landed on `voices.*` — it re-opens the voices hamburger and asserts "Sefaria Library" is present *and* "Voices on Sefaria" has count 0.

---

## Adding a new mobile test

1. Decide the group — Structure, Search, In-module nav, External-tab, Cross-module — and ID it (`HAM-<G>00N`).
2. If a needed action isn't on `MobileHamburgerPage`, add a method there. Prefer role/label/href locators.
3. Add any new shared selector / URL to `constants.ts` under `MOBILE_HAMBURGER` / `MOBILE_PAGE_URLS`. Don't inline magic strings in the POM.
4. Run a single test: `npx playwright test --config=playwright.mobile.config.ts -g 'HAM-<your-id>'`.
5. If it fails, work outside-in: modal blocking → wrong URL pattern → locator drift → slow env (`TIMEOUT_MULTIPLIER=2`).

---

## File map

```
e2e-tests/mobile/
├── README.md                     ← you are here
└── hamburger-menu.spec.ts        ← 12 tests, 5 describe blocks

e2e-tests/pages/
└── mobileHamburgerPage.ts        ← POM, registered as pm.onMobileHamburger()

e2e-tests/
└── constants.ts                  ← MOBILE_HAMBURGER, MOBILE_PAGE_URLS

playwright.mobile.config.ts       ← Pixel 5 + iPhone 13 projects
```
