# Sefaria E2E Tests

A Playwright end-to-end test suite covering the **Library** and **Voices** web modules across Chromium, Firefox, and WebKit, in both English and Hebrew interfaces.

This guide is the single source of truth for humans. Read it cover-to-cover when joining the team — it covers everything from environment setup through writing and auditing tests. If you're an AI agent operating in this directory, see [CLAUDE.md](CLAUDE.md) for the prescriptive rules variant; if you're running the sanity release-gate suite, see [Sanity/SANITY.md](Sanity/SANITY.md) for the per-test inventory.

---

## Table of contents

1. [What this suite covers](#what-this-suite-covers)
2. [Prerequisites](#prerequisites)
3. [Environment setup](#environment-setup)
4. [Running tests](#running-tests)
5. [Directory map](#directory-map)
6. [Project matrix](#project-matrix)
7. [Architecture in one diagram](#architecture-in-one-diagram)
8. [Core conventions](#core-conventions)
9. [Entry-point helpers](#entry-point-helpers)
10. [The PageManager pattern](#the-pagemanager-pattern)
11. [Canonical page-object style](#canonical-page-object-style)
12. [Canonical spec structure](#canonical-spec-structure)
13. [Multi-language testing](#multi-language-testing)
14. [Authentication and storage state](#authentication-and-storage-state)
15. [Timeouts and the `t()` wrapper](#timeouts-and-the-t-wrapper)
16. [Locator priority](#locator-priority)
17. [Constants catalogue](#constants-catalogue)
18. [Worked example — adding a test end-to-end](#worked-example--adding-a-test-end-to-end)
19. [Reviewing an existing test — checklist](#reviewing-an-existing-test--checklist)
20. [Reports, traces, and artifacts](#reports-traces-and-artifacts)
21. [CI behavior](#ci-behavior)
22. [Troubleshooting](#troubleshooting)
23. [Legacy patterns to recognise](#legacy-patterns-to-recognise)
24. [Future direction](#future-direction)

---

## What this suite covers

Sefaria ships two independent web modules and two embedded products that share a session and a user base:

- **Library** — the traditional reader, topics, and texts experience. Hosted at `www.<sandbox-domain>` (English) and `www.<sandbox-domain-il>` (Hebrew).
- **Voices** — the sheet-editing / community / trending-topics experience. Hosted at `voices.<sandbox-domain>` (English) and `chiburim.<sandbox-domain-il>` (Hebrew).
- **Library Assistant** — `<lc-chatbot>` Svelte custom element embedded on the Library module for whitelisted users. See [assistant/README.md](assistant/README.md).
- **Resource Panel** — the connections sidebar (`ConnectionsPanel`) that opens when a reader segment is clicked. Covers RP-001 → RP-212 across 19 spec files. See [Full testing by Feature/Resource Panel/README.md](Full%20testing%20by%20Feature/Resource%20Panel/README.md).
- **Voices Topics** — topic pages on the Voices module (`voices.<sandbox>/topics/<slug>`) plus the topic landing page (`/topics`). Covers TOV-001 → TOV-019 (non-skipped) across 2 spec files. See [Full testing by Feature/Voices Topics/README.md](Full%20testing%20by%20Feature/Voices%20Topics/README.md).

Because the two modules share authentication but live on different subdomains, many tests exercise **cross-module** behavior (logging in on one module and verifying state on the other, following redirects, etc.). The suite is organised by folder (`library/`, `voices/`, `Sanity/`, `Misc/`, `assistant/`, `Full testing by Feature/<feature>/`); each folder maps to one or more Playwright projects, and each project pairs that folder with a specific browser and baseURL. See the [project matrix](#project-matrix).

---

## Prerequisites

- Node.js (version pinned by the root `package.json`)
- Run `npm install` at the repo root once
- Run `npx playwright install` once to download browser binaries (Chromium, Firefox, WebKit)

---

## Environment setup

Copy the template to create your local env file:

```bash
cp e2e-tests/example.env e2e-tests/.env
```

The `.env` file is gitignored — never commit credentials.

| Variable | What it does |
| --- | --- |
| `SANDBOX_URL` | Base URL for the English sandbox (e.g. `https://modularization.cauldron.sefaria.org/`). `MODULE_URLS.EN.LIBRARY` and `.VOICES` are derived from this domain. |
| `SANDBOX_URL_IL` | Base URL for the Hebrew/IL sandbox. `MODULE_URLS.HE.LIBRARY` and `.VOICES` are derived from this. |
| `PLAYWRIGHT_USER_EMAIL` / `PLAYWRIGHT_USER_PASSWORD` | Credentials for the standard test user. Used by `goToPageWithUser` and `BROWSER_SETTINGS.enUser / .heUser`. |
| `PLAYWRIGHT_SUPERUSER_EMAIL` / `PLAYWRIGHT_SUPERUSER_PASSWORD` | Credentials for admin flows (`BROWSER_SETTINGS.enAdmin / .heAdmin`) and Django admin endpoints (e.g. the trending-tags reset used by `voices/trending-topics.spec.ts`). |
| `TIMEOUT_MULTIPLIER` | Scales every timeout in the suite. Range `0.1–3.0`, default `1.0`. Set to `2` or `3` on a slow CI runner or while debugging. See [Timeouts](#timeouts-and-the-t-wrapper). |
| `CI` | When truthy, Playwright runs with `forbidOnly`, `retries: 2`, `workers: 1`, and the GitHub reporter. |
| `GENERATE_REPORTS` | When truthy (and not CI), emits HTML + JUnit + `list` reporters to `e2e-tests/e2e-test-logs/`. |

---

## Running tests

```bash
# Every Playwright project (chrome/firefox/safari × library / voices / Sanity / Misc / assistant / resource-panel)
npx playwright test

# A single project
npx playwright test --project=chrome-library
npx playwright test --project=chrome-assistant
npx playwright test --project=chrome-resource-panel
npx playwright test --project=chrome-voices-topics

# Mobile suite (separate config — Pixel 5 Chrome + iPhone 13 Safari)
npx playwright test --config=playwright.mobileweb.config.ts
npx playwright test --config=playwright.mobileweb.config.ts --project=chrome-mobile-library

# A single spec file
npx playwright test library/header.spec.ts

# A single test by name (grep-style)
npx playwright test -g 'MOD-H002'

# Interactive UI mode — easiest way to iterate on a flaky test
npx playwright test --ui

# Step-through debugger (opens Playwright Inspector)
npx playwright test --debug library/header.spec.ts

# Slow environment — scale every t()-wrapped timeout 2x
TIMEOUT_MULTIPLIER=2 npx playwright test

# Emit HTML + JUnit reports locally
GENERATE_REPORTS=1 npx playwright test

# Open the last HTML report
npx playwright show-report e2e-tests/e2e-test-logs/html-report

# Replay a saved trace from a failed run
npx playwright show-trace e2e-tests/e2e-test-logs/test-results/<run>/trace.zip
```

---

## Directory map

```text
e2e-tests/
├── README.md              ← you are here — the human-facing guide
├── CLAUDE.md              ← same rules, compressed for AI agents
├── example.env            ← template for .env
├── globals.ts             ← LANGUAGES, SOURCE_LANGUAGES, BROWSER_SETTINGS, t(), testUser, testAdminUser
├── utils.ts               ← goToPageWithLang, goToPageWithUser, installOverlaySuppression,
│                            hideAllModalsAndPopups, MDL helpers, geo-location,
│                            fixCookieDomainsForCrossSubdomain
├── global-setup.ts        ← runs once before any worker; writes auth_*.json per profile
├── constants.ts           ← MODULE_URLS, MODULE_SELECTORS, EXTERNAL_URLS, SITE_CONFIGS,
│                            VALID_TOPICS, SEARCH_DROPDOWN, SaveStates, and more
├── helpDeskLinksConstants.ts ← data driving Misc/help-sheet-redirects.spec.ts
├── pages/
│   ├── pageManager.ts     ← single entry point that mounts all page objects
│   ├── helperBase.ts      ← base class providing `page` and `language`
│   └── <Feature>Page.ts   ← 18+ page objects, one per feature area
├── library/               ← Library-module UI tests (header, sidebar, reader, search, …)
├── voices/                ← Voices-module UI tests (sheet editor, trending, chiburim, …)
├── Sanity/                ← Release-gate smoke suite + redirect tests
│   └── SANITY.md          ← per-test inventory for this suite
├── Misc/                  ← Cross-cutting / platform-level tests
├── assistant/             ← Library Assistant (<lc-chatbot>) tests
│   └── README.md          ← Library Assistant-specific guide
├── mobile/                ← Mobile-viewport tests (hamburger drawer, auth flow)
│   └── README.md          ← Mobile-specific guide; runs via playwright.mobileweb.config.ts
├── Full testing by Feature/
│   ├── Resource Panel/    ← Resource Panel (ConnectionsPanel) tests, RP-001 → RP-212
│   │   └── README.md      ← Resource Panel-specific guide (navigation map, gotchas, reference texts)
│   └── Voices Topics/     ← Voices topic pages + landing, TOV-001 → TOV-019 (non-skipped)
│       └── README.md      ← Voices Topics-specific guide (source map, design decisions, CSV adaptations)
└── e2e-test-logs/         ← reports, traces, screenshots, videos (gitignored)
```

> Mobile tests live under a **separate Playwright config** ([../playwright.mobileweb.config.ts](../playwright.mobileweb.config.ts)) because Sefaria's mobile chrome only mounts below `width < 843px`. The desktop projects in [../playwright.config.ts](../playwright.config.ts) never exercise it. See [mobile/README.md](mobile/README.md).

---

## Project matrix

Each test folder is run by three browser-specific Playwright projects defined in [../playwright.config.ts](../playwright.config.ts). When you run `npx playwright test`, every project runs.

| Folder | Chromium project | Firefox project | WebKit project | baseURL |
| --- | --- | --- | --- | --- |
| `library/` | `chrome-library` | `firefox-library` | `safari-library` | `www.<SANDBOX_URL domain>` |
| `voices/` | `chrome-voices` | `firefox-voices` | `safari-voices` | `voices.<SANDBOX_URL domain>` |
| `Sanity/` | `chrome-sanity` | `firefox-sanity` | `safari-sanity` | `www.<SANDBOX_URL domain>` |
| `Misc/` | `chrome-misc` | `firefox-misc` | `safari-misc` | `www.<SANDBOX_URL domain>` |
| `assistant/` | `chrome-assistant` | `firefox-assistant` | `safari-assistant` | `www.<SANDBOX_URL domain>` |
| `Full testing by Feature/Resource Panel/` | `chrome-resource-panel` | `firefox-resource-panel` | `safari-resource-panel` | `www.<SANDBOX_URL domain>` |
| `Full testing by Feature/Voices Topics/` | `chrome-voices-topics` | `firefox-voices-topics` | `safari-voices-topics` | `voices.<SANDBOX_URL domain>` |
| `mobile/` *(separate config — [`playwright.mobileweb.config.ts`](../playwright.mobileweb.config.ts))* | `chrome-mobile-library` (Pixel 5) | — | `safari-mobile-library` (iPhone 13) | `www.<SANDBOX_URL domain>` |

Hebrew module URLs (`MODULE_URLS.HE.LIBRARY`, `MODULE_URLS.HE.VOICES`) are derived from `SANDBOX_URL_IL` and are used inside tests when asserting Hebrew-site behavior — not as separate Playwright projects.

**Choosing where your new test lives:**

| What your test exercises | Put it in |
| --- | --- |
| Library-specific UI (reader, texts, topics, library header/sidebar) | `library/` |
| Voices-specific UI (sheet editor, trending, chiburim pages) | `voices/` |
| Library Assistant chatbot (`<lc-chatbot>`) | `assistant/` |
| Connections sidebar / Resource Panel (RP-NNN tests) | `Full testing by Feature/Resource Panel/` |
| Voices topic pages or `/topics` landing (TOV-NNN tests) | `Full testing by Feature/Voices Topics/` |
| Mobile-viewport / responsive UI (hamburger drawer, mobile auth flow) | `mobile/` *(run via `--config=playwright.mobileweb.config.ts`)* |
| End-to-end release-gate smoke (login → profile → settings → logout, cross-module auth) | `Sanity/` |
| Platform-level invariants, cross-module URL redirects, static-route assertions | `Misc/` |

When in doubt: if the feature ships in one module only and has its own deep test matrix (CSV-driven), it earns its own folder under `Full testing by Feature/`. Otherwise, if the feature ships in one module only, use that module's folder; if it crosses modules, use `Sanity/`.

---

## Architecture in one diagram

```text
spec.ts (in library/ | voices/ | Sanity/ | Misc/ | assistant/ | Full testing by Feature/<feature>/)
    │
    ├── new PageManager(page, language)
    │         │
    │         └── mounts 18+ page objects, each extending HelperBase
    │                   (constructor receives `page` and `language`)
    │
    ├── goToPageWithLang(context, url, language)
    │   goToPageWithUser(context, url, BROWSER_SETTINGS.x)   ← from utils.ts
    │
    ├── hideAllModalsAndPopups(page)                          ← from utils.ts
    │
    ├── t(ms)   ← timeout wrapper from globals.ts
    │
    └── MODULE_URLS / MODULE_SELECTORS / EXTERNAL_URLS / ...   ← from constants.ts
                                   │
                                   ▼
                        Playwright Page API
```

Every test reaches the site through one of the entry-point helpers, builds a `PageManager`, and then drives the browser through high-level page-object methods. No test file should talk to `page.locator(...)` directly for product UI — that belongs inside a page object.

---

## Core conventions

These eight rules govern every new test and page object. Violations are the most common cause of flakes and inconsistency.

1. **Always go through `PageManager`.** In a `.spec.ts` file, prefer `pm.onX().someAction()` over raw `page.locator(...)`. Raw locators belong inside a page object, not a spec.
2. **Always wrap timeouts with `t()`** from [globals.ts](globals.ts). No hardcoded `5000`, `10000`, etc. Example: `await expect(x).toBeVisible({ timeout: t(10000) })`.
3. **Overlay suppression is two layers.** Layer 1 is `installOverlaySuppression(context)`, called inside `goToPageWithLang` / `goToPageWithUser` *before* `context.newPage()`. It patches `localStorage.getItem` so every `modal_*` / `banner_*` key reads `"true"` (short-circuiting `InterruptingMessage.shouldShow()` and `Banner.shouldShow()` in [`Misc.jsx`](../../Sefaria-Project-Master/static/js/Misc.jsx) at lines 2100 and 2282 respectively) and short-circuits `/api/strapi/graphql-cache` with an empty payload. This eliminates the Strapi "Sustainer" interrupting message and any other Strapi-driven campaign at the React level — the `showDelay` timer never even arms. Layer 2 is `hideAllModalsAndPopups(page)`, which click-dismisses the residual non-Strapi survivors (cookies banner, UseBounce widget, GuideOverlay, `#bannerMessage`, SiteWideBanner). The entry-point helpers already call layer 2 after the first navigation; call it again after any subsequent in-test `page.goto`, module switch, or login redirect — a survivor (e.g. SiteWideBanner triggered by an interaction) can mount mid-test.
4. **Always enter via `goToPageWithLang` or `goToPageWithUser`** for the first navigation in `test.beforeEach`. Do not start a test with a bare `page.goto(...)`.
5. **Locator priority:** `getByRole` > `getByLabel` > `getByText` > `getByTestId` > CSS. Avoid brittle CSS like `.react-tags__search-input` in new code.
6. **Never use `page.waitForTimeout(ms)` to wait for state.** Use web-first assertions (`await expect(locator).toBeVisible()`) — they auto-retry. `waitForTimeout` is acceptable only for deliberate pacing (e.g. after dismissing a modal) and, if used, must be wrapped with `t()`.
7. **New page objects must extend `HelperBase`** and follow the [canonical style](#canonical-page-object-style).
8. **Respect the [legacy list](#legacy-patterns-to-recognise).** Do not model new code on files flagged there.

---

## Entry-point helpers

[utils.ts](utils.ts) exposes two entry points. Every test's first navigation must go through one of them — do not use raw `page.goto` for the initial visit.

| Scenario | Helper |
| --- | --- |
| Anonymous user, English UI | `goToPageWithLang(context, url, LANGUAGES.EN)` |
| Anonymous user, Hebrew UI | `goToPageWithLang(context, url, LANGUAGES.HE)` |
| Logged-in primary user, EN | `goToPageWithUser(context, url, BROWSER_SETTINGS.enUser)` |
| Logged-in primary user, HE | `goToPageWithUser(context, url, BROWSER_SETTINGS.heUser)` |
| Logged-in admin, EN | `goToPageWithUser(context, url, BROWSER_SETTINGS.enAdmin)` |
| Logged-in admin, HE | `goToPageWithUser(context, url, BROWSER_SETTINGS.heAdmin)` |
| Library Assistant whitelisted user | `goToPageWithUser(context, url, BROWSER_SETTINGS.enLAUser)` |

**What they handle for you:**

- `goToPageWithLang` — pre-seeds the `interfaceLang` cookie on the parent domain (so Sefaria doesn't geo-redirect `www.*` → `*.org.il`), navigates once, and returns an anonymous `Page` ready to drive.
- `goToPageWithUser` — reads the storage-state file written by [global-setup.ts](global-setup.ts), applies it to the test's context (cross-subdomain cookies already fixed up so `www.*` and `voices.*` share auth), and returns a logged-in `Page`. Workers never log in themselves.

**Current limitation:** the two cannot be combined in a single call. If you need a logged-in Hebrew session, use `heUser` / `heAdmin` directly — they already bake the Hebrew interface language into storage state.

Subsequent navigations within the same test may use `page.goto(...)` directly — but **always call `hideAllModalsAndPopups(page)` afterward.**

---

## The PageManager pattern

[pages/pageManager.ts](pages/pageManager.ts) is the single entry point to the 15 page objects that model the site's feature areas. Each page object encapsulates the locators and actions for one area (header, sidebar, sheet editor, search, profile, etc.).

```ts
import { PageManager } from '../pages/pageManager';

const pm = new PageManager(page, LANGUAGES.EN);

await pm.onModuleHeader().clickAndVerifyNavigation('Topics', /topics/);
await pm.onModuleSidebar().verifyStandardFooterLinks();
await pm.onSearchPage().searchFor('genesis');
await pm.onUserMenu().clickProfile();
```

The `language` parameter propagates into every page object so that methods can branch on interface language without each method re-receiving it.

**Available accessors** (from [pages/pageManager.ts](pages/pageManager.ts)):

- `navigateFromBannerTo()` — banner / module-header navigation shortcuts
- `onTextsPage()`, `onTopicsPage()`, `onCommunityPage()`, `onDonatePage()`
- `onLoginPage()`, `onSignUpPage()`, `onUserMenu()`
- `onSearchPage()`, `onSourceTextPage()`, `onSourceSheetEditorPage()`
- `onModuleHeader()`, `onModuleSidebar()`
- `onProfilePage()`, `onEditProfilePage()`, `onAccountSettingsPage()`

**When to extend vs. create:** Most new tests add methods to existing page objects rather than creating new ones. Only create a new page object when the feature area doesn't fit cleanly into any existing one.

---

## Canonical page-object style

**Reference implementations:** [pages/moduleHeaderPage.ts](pages/moduleHeaderPage.ts), [pages/moduleSidebarPage.ts](pages/moduleSidebarPage.ts). Model new page objects on these.

Rules:

- Extends `HelperBase` — inherits `this.page` and `this.language`.
- Constructor: `constructor(page: Page, language: string) { super(page, language); }`.
- Locators: use **private `get` accessors** for reusable element lookups. Don't expose raw locators as public fields.
- Public methods are async actions returning `void` or relevant data (new pages, extracted text, etc.).
- Import `t` from [globals.ts](globals.ts) and wrap every explicit timeout.
- Import `hideAllModalsAndPopups` from [utils.ts](utils.ts) and call it defensively before interacting with header / overlay-prone areas.
- Branch on `this.language` for language-specific visible text.

**Skeleton:**

```ts
import { expect, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { MODULE_SELECTORS } from '../constants';

export class SomeFeaturePage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  private get container() {
    return this.page.getByRole('region', { name: /feature/i });
  }

  private get submitButton() {
    const label = this.language === LANGUAGES.HE ? 'שלח' : 'Submit';
    return this.container.getByRole('button', { name: label });
  }

  async submitForm() {
    await hideAllModalsAndPopups(this.page);
    await expect(this.submitButton).toBeVisible({ timeout: t(5000) });
    await this.submitButton.click();
  }
}
```

After creating a new page object, **register it in [pages/pageManager.ts](pages/pageManager.ts)**: import the class, add a `private readonly` field, instantiate in the constructor, and expose an `onSomeFeaturePage()` accessor.

---

## Canonical spec structure

**Reference implementation:** [library/header.spec.ts](library/header.spec.ts).

```ts
import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

test.describe('Library Feature X — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('MOD-X001: does the thing', async () => {
    await pm.onSomeFeaturePage().doTheThing();
    await expect(page).toHaveURL(/expected-path/);
  });
});
```

Conventions:

- **Filename:** `kebab-case.spec.ts` (e.g. `sidebar-help-link.spec.ts`).
- **`test.describe` string:** `'<Module> <Feature> — <Language>'` when the suite is language-scoped. Keep it human-readable.
- **Test names / IDs:** prefix with a stable identifier when appropriate (`MOD-H###` for header tests, `MOD-S###` for sidebar tests, `Sanity N` for sanity-suite tests). This makes it easy to run one test via `-g 'MOD-H002'`.
- **`test.beforeEach`** re-creates `page` and `pm` per test for isolation. Don't share state across tests unless you deliberately opt into `test.describe.configure({ mode: 'serial' })` (as the sheet-workflow sanity suite does).

---

## Multi-language testing

### Interface-language constants

```ts
import { LANGUAGES } from '../globals';

LANGUAGES.EN   // 'english'
LANGUAGES.HE   // 'hebrew'
```

### Source-text language constants (regex patterns)

Used when asserting on source-text-page UI that shows the original Hebrew, a translation, or both:

```ts
import { SOURCE_LANGUAGES } from '../globals';

SOURCE_LANGUAGES.EN   // /^(תרגום|Translation)$/
SOURCE_LANGUAGES.HE   // /^(מקור|Source)$/
SOURCE_LANGUAGES.BI   // /^(מקור ותרגום|Source with Translation)$/
```

### Mid-test switching

Use `changeLanguage(page, LANGUAGES.HE)` from [utils.ts](utils.ts). It tries the UI dropdown first and falls back to cookie-based switching with a reload if the UI is flaky.

### Running the same test in both languages

The tidy way to exercise both interface languages is a describe-per-language loop:

```ts
const configs = [
  { label: 'English', lang: LANGUAGES.EN, baseUrl: MODULE_URLS.EN.LIBRARY },
  { label: 'Hebrew',  lang: LANGUAGES.HE, baseUrl: MODULE_URLS.HE.LIBRARY },
];

for (const { label, lang, baseUrl } of configs) {
  test.describe(`Feature X — ${label}`, () => {
    let page: Page;
    let pm: PageManager;

    test.beforeEach(async ({ context }) => {
      page = await goToPageWithLang(context, baseUrl, lang);
      pm = new PageManager(page, lang);
      await hideAllModalsAndPopups(page);
    });

    test('behaves correctly', async () => {
      // language-aware assertions via pm.onX()
    });
  });
}
```

### Geo-location caveat

Playwright defaults to NYC coordinates (set in [playwright.config.ts](../playwright.config.ts) `use.geolocation`), which steers Sefaria's auto-detection toward the English interface. If your test must simulate an Israeli IP, use the utility `isIsraelIp(page)` to check, and be aware that passing `LANGUAGES.HE` through `goToPageWithLang` will explicitly set the Hebrew interface regardless of detected geo.

---

## Authentication and storage state

### `BROWSER_SETTINGS` — named auth profiles

[globals.ts](globals.ts) exposes storage-state profiles keyed by name. Each profile has a `lang`, an `auth_*.json` file path, and a `user` (either credentials *or* `null`).

| Profile | Logged in as | Purpose |
| --- | --- | --- |
| `BROWSER_SETTINGS.enUser` / `.heUser` | Standard test user (`testUser`) | Default profile for any logged-in test |
| `BROWSER_SETTINGS.enAdmin` / `.heAdmin` | Admin / superuser (`testAdminUser`) | Moderator / editor flows (e.g. RP-083 "Create topic", RP-171 "Edit Text") |
| `BROWSER_SETTINGS.enLAUser` | Library Assistant whitelisted user (`testLAUser`) | LA-specific — `<lc-chatbot>` only mounts for this account |

### How the flow works

The auth layer is a **one-time global setup, read-only thereafter** model — the textbook Playwright pattern for parallel-safe auth state.

1. **Before any worker starts**, Playwright invokes [global-setup.ts](global-setup.ts). It:
   - Wipes every `auth_*.json` from the previous run.
   - Logs in each *unique account* exactly once (`testUser`, `testAdminUser`, `testLAUser`). Sefaria invalidates concurrent sessions for the same user, so EN and HE variants of one account **share** that login — they're stamped from the same captured cookie set with different `interfaceLang` values.
   - Calls `fixCookieDomainsForCrossSubdomain` on the captured cookies so `sessionid` lives on `.sefaria.org` (the parent domain) and authenticates both `www.*` and `voices.*`.
   - Writes one `auth_<lang>_<role>.json` per profile.
2. **Each test worker** (a separate Node process spawned by Playwright) calls `goToPageWithUser(context, url, BROWSER_SETTINGS.<profile>)`. This now:
   - Reads the `auth_*.json` file (file MUST exist; if not, the helper throws with a pointer to globalSetup).
   - Defensively re-applies `fixCookieDomainsForCrossSubdomain` and normalizes the `interfaceLang` cookie value.
   - Calls `context.addCookies(...)`, opens a page, navigates once, hides modals. Done.
3. Anonymous tests use `goToPageWithLang(context, url, LANGUAGES.EN | LANGUAGES.HE)`. The helper pre-seeds the `interfaceLang` cookie on the parent domain (so Sefaria doesn't geo-redirect `www.*` → `*.org.il`) and navigates. No file caching, no login.

### What this means in practice

- You do **not** manually delete `auth_*.json` between tests — globalSetup handles it on each run start.
- Per-test login cost is **zero** — workers never log in. The login cost is paid once, in globalSetup, before workers spawn.
- You can run the suite at full parallelism (no `--workers=N` cap, no `retries`) and auth-gated tests will not race on a shared auth file, because the file is read-only during the test phase.
- If your test needs to assert both the logged-out and logged-in states, use the helper `pm.onModuleHeader().testWithAuthStates(...)` in [pages/moduleHeaderPage.ts](pages/moduleHeaderPage.ts) — it logs out, runs the logged-out branch, logs in as superuser, runs the logged-in branch.
- For tests that create destructive state on the QA user (notes, sheets, feedback), intercept the relevant `/api/...` endpoints with `page.route()` so production stays clean. See [Resource Panel/README.md §8.8](Full%20testing%20by%20Feature/Resource%20Panel/README.md) for the canonical pattern.
- The Sanity "logout" test (Sanity 7) drives logout through the UI dropdown and works unchanged — Sefaria's actual `/logout` endpoint still clears `sessionid` normally. See "Destructive auth tests" below for the constraint this places on which profile Sanity 7 (and any future destructive-auth test) can use.

### Destructive auth tests

The shared-session model has a sharp edge: tests that destroy or rotate the server-side session (UI logout, UI re-login as a globalSetup-managed account, password change) **cannot use a profile that other concurrent tests read**. The on-disk `sessionid` is shared across workers; when one worker hits `/logout`, Django's `session.flush()` deletes the row, and every other worker holding that `sessionid` is silently logged out on its next HTTP request.

**Currently in the suite:** the only destructive-auth test is **Sanity 7** ("User can logout successfully" in [Sanity/user-flow-sanity.spec.ts](Sanity/user-flow-sanity.spec.ts)), which uses `BROWSER_SETTINGS.enAdmin` rather than `enUser` for exactly this reason. `enAdmin` is unused elsewhere in `Sanity/`, so destroying its session every run has no cross-test impact. This was a real flake — `Sanity 8h` and `8i` intermittently failed with "User Logged out" pills until Sanity 7 was moved off `enUser` on 2026-05-20.

**When writing a new destructive-auth test, either:**

- **Use a profile no other concurrent test depends on.** Today that means `enAdmin` for any non-admin destructive flow (since Sanity 7 already destroys it every run). For an admin-dependent destructive flow you'd need a dedicated 4th account; flag this before merging so the team can add it to globalSetup. Do not use `enUser` for a destructive flow — many tests depend on it.
- **Intercept the destructive request.** `page.route('**/logout', route => route.fulfill({ status: 302, headers: { Location: '/' } }))` keeps the server-side session alive while preserving the UI redirect behavior. Same pattern as the destructive-API interception in [Full testing by Feature/Resource Panel/README.md](Full%20testing%20by%20Feature/Resource%20Panel/README.md).

**Existing tripwire:** `cross-module-login.spec.ts` Scenarios 4-7 perform parallel UI logins as the same QA user. They currently pass only because Sefaria's Django config does not regenerate sibling sessions on fresh login. If that policy ever tightens upstream (`SESSION_SAVE_EVERY_REQUEST=True` with a session-regeneration policy, or stricter same-email enforcement), those scenarios become the next flake. Flagged at the top of that spec file.

### Credentials

Credentials come from the env vars described in [Environment setup](#environment-setup). Never hardcode. If a `PLAYWRIGHT_*_EMAIL` / `_PASSWORD` pair is missing, globalSetup skips that account with a warning rather than failing the whole run — any test that then needs the missing profile will throw a clear "auth file missing" error.

---

## Timeouts and the `t()` wrapper

Two global timeouts are set in [playwright.config.ts](../playwright.config.ts):

- **Per-test timeout:** `t(50000)` — 50 seconds × `TIMEOUT_MULTIPLIER`
- **Per-assertion timeout:** `t(10000)` — 10 seconds × `TIMEOUT_MULTIPLIER`

The `t()` function in [globals.ts](globals.ts) is just `ms * TIMEOUT_MULTIPLIER` rounded. Wrap every explicit timeout:

```ts
import { t } from '../globals';

// ✅ Correct — scales with TIMEOUT_MULTIPLIER
await expect(element).toBeVisible({ timeout: t(10000) });
test.setTimeout(t(120000));
await page.waitForTimeout(t(500));   // only when deliberate pacing is required

// ❌ Wrong — ignores TIMEOUT_MULTIPLIER; breaks on slow CI
await expect(element).toBeVisible({ timeout: 10000 });
```

When a test is flaky on CI but passes locally, the first knob to turn is `TIMEOUT_MULTIPLIER=2` in `.env`. Only start debugging individual waits once you've ruled out a global timing issue.

**Avoid `page.waitForTimeout` for state waits.** Use web-first assertions; they auto-retry until the expect timeout expires. The only legitimate uses of `waitForTimeout` are:

- Deliberate pacing after dismissing a transient overlay
- Known animation / transition window before a programmatic screenshot

Both cases still require the `t()` wrap.

---

## Locator priority

Playwright's [user-facing locators](https://playwright.dev/docs/locators) are resilient to DOM refactors. Prefer, in order:

1. `page.getByRole('button', { name: /submit/i })`
2. `page.getByLabel('Email address')`
3. `page.getByText('Welcome back')`
4. `page.getByTestId('submit-btn')` (add `data-testid` on the app side if a role locator isn't reliable)
5. CSS as a last resort — `page.locator('.some-class')`

Tests and page objects in this repo have historically drifted toward CSS (e.g. `.react-tags__suggestions li`). **Do not replicate that in new code.** When you must touch legacy CSS selectors, leave them; when you write new code, use role-based locators.

---

## Constants catalogue

[constants.ts](constants.ts) centralises every site-wide string, regex, and selector. Before inlining a magic string in your test, check whether it already lives here.

| Export | Reach for it when |
| --- | --- |
| `MODULE_URLS.EN.LIBRARY` / `.VOICES` / `MODULE_URLS.HE.LIBRARY` / `.VOICES` | You need a base URL for a module × language combination |
| `MODULE_SELECTORS` | Interacting with the module header — logo, icons, dropdowns |
| `READER_SELECTORS` | Asserting on reader-page DOM structure |
| `SHEET_EDITOR_SELECTORS`, `SaveStates` | Driving sheet-editor flows (publish / save / unpublish / deletion) |
| `SIDEBAR_SELECTORS` | Navigating the sticky nav sidebar and its modules |
| `TOPIC_SELECTORS` | Topic pages, trending blocks, autocomplete |
| `EXTERNAL_URLS.DONATE` / `.HELP` / `.DEVELOPERS` | Asserting that a link opens an external destination |
| `SEARCH_DROPDOWN` | Search autocomplete sections, icons, and test search terms per module |
| `VALID_TOPICS` | Voices trending-topic workflows — pick a known-valid slug |
| `SITE_CONFIGS.LIBRARY` / `.VOICES` | Tab order, main navigation links per module (used by header / a11y tests) |
| `MODULE_SWITCHER`, `MODULE_TEXTS` | Cross-module switcher menu validation |

**Rule of thumb:** if you find yourself defining a string or regex that feels site-wide, add it to `constants.ts` instead of inlining. The next test to need it will thank you.

---

## Worked example — adding a test end-to-end

**Task:** Add a test that verifies the Library sidebar footer's "Help" link opens the Zendesk help center in a new tab.

### Step 1 — decide where it lives

This is Library-module-specific UI, so it belongs in `e2e-tests/library/`. By the project matrix it will run under `chrome-library`, `firefox-library`, and `safari-library`.

### Step 2 — pick a filename

Kebab-case, descriptive: `sidebar-help-link.spec.ts`.

### Step 3 — inventory what already exists

- `pm.onModuleSidebar()` from [pages/moduleSidebarPage.ts](pages/moduleSidebarPage.ts) already exposes `clickAndVerifyLink(spec: FooterLinkSpec)`. No new page-object method needed.
- [constants.ts](constants.ts) already has `EXTERNAL_URLS.HELP` — a regex matching the Zendesk URL. Use it.

### Step 4 — write the spec

```ts
// e2e-tests/library/sidebar-help-link.spec.ts

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS, EXTERNAL_URLS } from '../constants';

test.describe('Library Sidebar — Help link', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('MOD-S017: Help link opens Zendesk in a new tab', async () => {
    const newPage = await pm.onModuleSidebar().clickAndVerifyLink({
      name: 'Help',
      href: EXTERNAL_URLS.HELP,
      opensNewTab: true,
    });

    expect(newPage).not.toBeNull();
    await expect(newPage!).toHaveURL(EXTERNAL_URLS.HELP, { timeout: t(10000) });
    await newPage!.close();
  });
});
```

### Step 5 — run it

```bash
npx playwright test library/sidebar-help-link.spec.ts --project=chrome-library
```

### Step 6 — when it fails, diagnose in this order

1. **Modal blocking clicks?** Confirm `hideAllModalsAndPopups(page)` runs in `beforeEach` and also after any programmatic `page.goto(...)` in the test.
2. **URL regex too tight?** `console.log(newPage.url())` and refine `EXTERNAL_URLS.HELP` in `constants.ts` — do not inline a different regex in the test.
3. **Slow environment?** Set `TIMEOUT_MULTIPLIER=2` in `.env`.
4. **Locator changed upstream?** Update the page object (`moduleSidebarPage.ts`), not the test.
5. **Auth required?** If the link only renders for logged-in users, switch the entry-point helper to `goToPageWithUser(context, url, BROWSER_SETTINGS.enUser)`.

That's the whole flow: pick folder and filename, reuse existing page objects and constants, follow the canonical skeleton, diagnose failures from the outside in.

---

## Reviewing an existing test — checklist

When code-reviewing a PR that touches tests, verify each of:

- [ ] **PageManager used?** Specs should call `pm.onX()`, not raw `page.locator()`.
- [ ] **Timeouts wrapped with `t()`?** Any bare `5000`, `10000`, `timeout: 2000` is a defect.
- [ ] **`hideAllModalsAndPopups` after navigation?** Missing calls cause `element intercepts pointer events` flakes.
- [ ] **Entry-point helper used?** First navigation should be `goToPageWithLang` or `goToPageWithUser`, not `page.goto`.
- [ ] **Locators role-based?** `getByRole`, `getByLabel`, `getByText` preferred. Brittle CSS in spec files is a red flag.
- [ ] **`page.waitForTimeout`?** If unwrapped or used to wait for state, flag it. Replace with an assertion.
- [ ] **Magic strings / URLs?** Should be in `constants.ts`.
- [ ] **Page object extends `HelperBase`?** If not, flag it unless the file is on the [legacy list](#legacy-patterns-to-recognise).
- [ ] **Test isolation?** Unless explicitly `serial`, each test should work independently.
- [ ] **Credentials hardcoded?** Must come via `testUser` / `testAdminUser` / `BROWSER_SETTINGS`.
- [ ] **`console.log` left in?** Debug output in spec or page-object code should be removed before merge.

---

## Reports, traces, and artifacts

All test artifacts land in `e2e-tests/e2e-test-logs/` (gitignored):

- `test-results/` — raw Playwright output, including `trace.zip`, screenshots, and videos
- `html-report/` — HTML reporter output (emitted only when `GENERATE_REPORTS=1`)
- `junit-results.xml` — JUnit XML (emitted only when `GENERATE_REPORTS=1`)

**Retention policy** (from [../playwright.config.ts](../playwright.config.ts)):

- Screenshots: `only-on-failure`
- Videos: `retain-on-failure`
- Traces: `retain-on-failure`

Open a trace with `npx playwright show-trace <path-to-trace.zip>` — it gives you a frame-by-frame replay of the failing run with DOM snapshots, network activity, and console output.

---

## CI behavior

When `process.env.CI` is truthy:

- `forbidOnly: true` — CI fails if `test.only()` was left in source
- `retries: 2` — each failing test retries up to two times
- `workers: 1` — serial execution for determinism
- Reporter: `github` (inline annotations on PRs)

Locally: `retries: 0`, `workers: undefined` (full parallelism via `fullyParallel: true`).

Before opening a PR:

```bash
# Run the project that matches your change
npx playwright test --project=chrome-library

# If you touched cross-module behavior, also run Sanity
npx playwright test --project=chrome-sanity
```

### Workers and parallelism

Desktop tests should pass at full parallelism. CI runs `workers: 1` from [../playwright.config.ts](../playwright.config.ts); local runs default to Playwright's auto-detected worker count and the suite is expected to stay green there.

If a test flakes only when other tests run alongside it, the cause is in the test, not in the worker count. Fix the test rather than capping workers — see CLAUDE.md rule 20 for the diagnostic checklist (too-short timeouts on async fetches, sequential `isVisible` races, redirect-tolerant URL matching, `test.slow()` on known-heavy describes).

The one sanctioned exception is the mobile config ([../playwright.mobileweb.config.ts](../playwright.mobileweb.config.ts)), which caps non-CI workers at 2 — staging returns 5xx on `/login` under 5+ concurrent mobile-emulation workers. That cap is config-level and applies automatically when you run with `--config=playwright.mobileweb.config.ts`.

---

## Troubleshooting

**Tests fail with `element intercepts pointer events` or modals blocking clicks.**
The most common offenders (Strapi "Sustainer" modal, generic banner) are pre-empted at the context level by `installOverlaySuppression` inside the entry-point helpers. For residual non-Strapi overlays (cookies banner, GuideOverlay, UseBounce, SiteWideBanner) call `await hideAllModalsAndPopups(page)` after the offending action. If you see `interruptingMessage` or `bannerMessage` in a DOM snapshot, that's a regression in the layer-1 patch — check `utils.ts` and verify `installOverlaySuppression` is being awaited before `context.newPage()`.

**Auth state seems corrupted between runs.**
[global-setup.ts](global-setup.ts) wipes all `auth_*.json` at the start of every run and re-writes them from a fresh login. Do not manually delete them mid-run. If a particular profile is wedged, delete just that one file and re-run — globalSetup will re-create it.

**Timeouts flaky on a slow machine.**
Set `TIMEOUT_MULTIPLIER=2` (or `3`) in your `.env` — it scales every `t()`-wrapped timeout globally.

**A test passes locally but fails in `--ui` mode** (or vice versa).
Check the Playwright trace (`--trace on` or inspect `e2e-test-logs/test-results/`) for the actual timing. Usually a missing `hideAllModalsAndPopups` call or a state-dependent `waitForTimeout`.

**Hebrew tests fail even though English passes.**
Verify `SANDBOX_URL_IL` is set correctly in `.env`. `MODULE_URLS.HE.*` are derived from it.

**Authentication errors / "fields must not be empty".**
Check that `PLAYWRIGHT_USER_EMAIL` / `PLAYWRIGHT_USER_PASSWORD` (and `PLAYWRIGHT_SUPERUSER_*` if your test uses admin flows) are set in `.env`.

**`voices/trending-topics.spec.ts` complains about superuser credentials.**
That test hits the Django admin `/admin/reset/api/sheets/trending-tags` endpoint, which requires `PLAYWRIGHT_SUPERUSER_EMAIL` / `PLAYWRIGHT_SUPERUSER_PASSWORD`.

**The `chrome-all` / `firefox-all` / `safari-all` projects run zero tests.**
Known — they point to `./e2e-tests/tests` which does not exist. They're listed in the [cleanup candidates in CLAUDE.md §16](CLAUDE.md) for future removal.

---

## Legacy patterns to recognise

The codebase contains a handful of files that predate the current conventions. They **work**, but they don't reflect the patterns above. When you encounter them, don't copy the shape — follow the canonical examples instead.

| File | What's different | What to do |
| --- | --- | --- |
| [pages/banner.ts](pages/banner.ts) | Does not extend `HelperBase` | New page objects extend `HelperBase` |
| [pages/sheetEditorPage.ts](pages/sheetEditorPage.ts) | Uses `locator = () => page.locator(...)` arrow-function fields | Use private `get` accessors |
| [pages/accountSettingsPage.ts](pages/accountSettingsPage.ts), [pages/profilePage.ts](pages/profilePage.ts), [pages/editProfilePage.ts](pages/editProfilePage.ts) | Public `get foo()` getters — acceptable but not canonical | Prefer private `get` |
| [library/texts-tree-traversal.spec.ts](library/texts-tree-traversal.spec.ts) | Bypasses `PageManager`; raw `page.getByRole()` throughout | All new specs go through `pm.onX()` |
| [pages/moduleHeaderPage.ts](pages/moduleHeaderPage.ts) | Contains leftover `console.log` statements | Don't add new `console.log` in page objects |

**Do not refactor these files as part of unrelated work.** Refactor opportunistically only when you're already editing the file for another reason.

---

## Future direction

Playwright's official 2024/2025 guidance (see the [official docs](https://playwright.dev/docs/test-fixtures)) recommends **`test.extend()` custom fixtures** over a constructor-based page-manager class. A hypothetical fixture-based version would look like:

```ts
import { test as base } from '@playwright/test';
import { PageManager } from './pages/pageManager';
import { LANGUAGES } from './globals';

type Fixtures = { pm: PageManager };

export const test = base.extend<Fixtures>({
  pm: async ({ page }, use) => {
    await use(new PageManager(page, LANGUAGES.EN));
  },
});
export { expect } from '@playwright/test';
```

Tests would then declare `async ({ page, pm }) => { ... }` directly and get automatic setup / teardown. The auth system would migrate to a Playwright `setup` project declared as a `dependency` of every other project, emitting `storageState` JSON files — replacing the current hand-rolled `BROWSER_SETTINGS` mechanism.

**This is a future direction, not a required migration.** Current tests should follow the conventions in this document.

---

## Related docs

- [CLAUDE.md](CLAUDE.md) — the same conventions, compressed for AI agents, plus universal patterns (FA-icon clicks, jQuery URL encoding, dialog ordering, network interception, worker tuning) and the current cleanup-candidates inventory
- [Sanity/SANITY.md](Sanity/SANITY.md) — per-test inventory for the Sanity release-gate suite
- [assistant/README.md](assistant/README.md) — Library Assistant (`<lc-chatbot>`) testing guide
- [Full testing by Feature/Resource Panel/README.md](Full%20testing%20by%20Feature/Resource%20Panel/README.md) — Resource Panel testing guide: mode navigation map, per-mode selector reference, auth-gated features, and the full Common-gotchas catalogue (8.1–8.13) accumulated across Parts 1 and 2
- [Full testing by Feature/Voices Topics/README.md](Full%20testing%20by%20Feature/Voices%20Topics/README.md) — Voices Topics testing guide: per-test detail, CSV-vs-product adaptations, source-component map, reference topic (`torah`)
- [mobile/README.md](mobile/README.md) — Mobile-viewport testing guide: hamburger drawer, auth flow, staging cookies banner, WebKit popup/cookie quirks
- [../playwright.config.ts](../playwright.config.ts) — Playwright configuration (desktop projects)
- [../playwright.mobileweb.config.ts](../playwright.mobileweb.config.ts) — Playwright configuration (mobile projects)
- [Playwright official docs](https://playwright.dev/docs/intro) — upstream framework reference
