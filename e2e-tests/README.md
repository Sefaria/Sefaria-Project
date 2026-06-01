# Sefaria E2E Tests

A Playwright end-to-end test suite covering the **Library** and **Voices** web modules — plus the **Library Assistant** chatbot, the **Resource Panel** connections sidebar, **Voices Topics** pages, and the **mobile** hamburger experience — across Chromium, Firefox, and WebKit, in both English and Hebrew interfaces.

This README is the **handbook for humans**. Read it cover-to-cover when you join the team: it takes you from a clean checkout through running, writing, reviewing, and debugging tests. It deliberately repeats some material that also lives in [CLAUDE.md](CLAUDE.md) — that's by design (see the doc map below).

---

## Which doc do I read?

| If you are… | Read |
| --- | --- |
| A **human** joining the team or writing/running tests | **This file** — the full handbook |
| An **AI agent** operating in this directory | [CLAUDE.md](CLAUDE.md) — the same conventions, compressed into prescriptive rules, plus agent-specific patterns (FA-icon clicks, jQuery URL encoding, dialog ordering, network interception) |
| Running the **release-gate** suite | [Sanity/README.md](Sanity/README.md) — per-test inventory |
| Testing the **Library Assistant** chatbot | [assistant/README.md](assistant/README.md) |
| Testing the **Resource Panel** (RP-NNN) | [Full testing by Feature/Resource Panel/README.md](Full%20testing%20by%20Feature/Resource%20Panel/README.md) |
| Testing **Voices Topics** (TOV-NNN) | [Full testing by Feature/Voices Topics/README.md](Full%20testing%20by%20Feature/Voices%20Topics/README.md) |
| Testing the **mobile** hamburger drawer (HAM-NNN) | [mobile web/README.md](mobile%20web/README.md) |

> **README vs. CLAUDE.md:** they overlap by design. The README is the narrative handbook for people; CLAUDE.md is the rule list auto-loaded into AI-agent context. When the two ever disagree, treat **CLAUDE.md as the authority on prescriptive test-writing rules** and this file as the authority on setup, running, and onboarding. If you change a convention, update both.

---

## Table of contents

1. [Quick start (clone → green in ~10 minutes)](#quick-start)
2. [What this suite covers](#what-this-suite-covers)
3. [Directory map](#directory-map)
4. [Project matrix](#project-matrix)
5. [Where does my test go?](#where-does-my-test-go)
6. [Architecture in one diagram](#architecture-in-one-diagram)
7. [Core conventions (the 8 rules)](#core-conventions)
8. [Entry-point helpers](#entry-point-helpers)
9. [The PageManager pattern](#the-pagemanager-pattern)
10. [Canonical page-object style](#canonical-page-object-style)
11. [Canonical spec structure](#canonical-spec-structure)
12. [Worked example — adding a test end-to-end](#worked-example)
13. [Running tests](#running-tests)
14. [Reviewing a test — checklist](#reviewing-a-test--checklist)
15. [Reports, traces, and artifacts](#reports-traces-and-artifacts)
16. [CI behavior, workers, and parallelism](#ci-behavior-workers-and-parallelism)
17. [Troubleshooting](#troubleshooting)
18. [Reference appendix](#reference-appendix)
    - [Authentication and storage state](#authentication-and-storage-state)
    - [Multi-language testing](#multi-language-testing)
    - [Timeouts and the `t()` wrapper](#timeouts-and-the-t-wrapper)
    - [Locator priority](#locator-priority)
    - [Constants catalogue](#constants-catalogue)
    - [Utilities catalogue (`utils.ts`)](#utilities-catalogue-utilsts)
    - [Destructive-auth tests](#destructive-auth-tests)
    - [Legacy patterns to recognise](#legacy-patterns-to-recognise)
    - [Future direction](#future-direction)
19. [Related docs](#related-docs)

---

## Quick start

```bash
# 1. From the repo root, install dependencies (once)
npm install

# 2. Download the browser binaries Playwright drives (once)
npx playwright install        # Chromium, Firefox, WebKit

# 3. Create your local env file from the template
cp e2e-tests/example.env e2e-tests/.env
#    …then fill in SANDBOX_URL, SANDBOX_URL_IL, and the PLAYWRIGHT_*_EMAIL / _PASSWORD
#    credentials. The .env file is gitignored — never commit it.

# 4. Run one fast test to confirm the wiring works
npx playwright test library/header.spec.ts --project=chrome-library

# 5. Open the UI runner to explore the suite interactively
npx playwright test --ui
```

If step 4 is green, you're set up. If it isn't, jump to [Troubleshooting](#troubleshooting).

### Prerequisites

- **Node.js** — there is no `engines` pin in the root `package.json`; use the version the team currently runs (an active LTS, Node 18+). `@types/node` targets v22.
- `npm install` at the **repo root** (the Playwright config and `node_modules` live there, not under `e2e-tests/`).
- `npx playwright install` once to fetch Chromium, Firefox, and WebKit binaries.

### Environment variables

All variables live in `e2e-tests/.env` (gitignored). Copy [example.env](example.env) and fill it in.

| Variable | What it does |
| --- | --- |
| `SANDBOX_URL` | Base URL for the English sandbox (e.g. `https://modularization.cauldron.sefaria.org/`). `MODULE_URLS.EN.LIBRARY` and `.VOICES` are derived from this domain. |
| `SANDBOX_URL_IL` | Base URL for the Hebrew/IL sandbox. `MODULE_URLS.HE.LIBRARY` and `.VOICES` are derived from it. |
| `PLAYWRIGHT_USER_EMAIL` / `PLAYWRIGHT_USER_PASSWORD` | Standard test user (`testUser`). Used by `BROWSER_SETTINGS.enUser` / `.heUser`. |
| `PLAYWRIGHT_SUPERUSER_EMAIL` / `PLAYWRIGHT_SUPERUSER_PASSWORD` | Admin / superuser (`testAdminUser`). Used by `BROWSER_SETTINGS.enAdmin` / `.heAdmin` and Django admin endpoints (e.g. the trending-tags reset). |
| `PLAYWRIGHT_LA_USER_EMAIL` / `PLAYWRIGHT_LA_USER_PASSWORD` | Library Assistant whitelisted user (`testLAUser`). Used by `BROWSER_SETTINGS.enLAUser` — `<lc-chatbot>` only mounts for this account. |
| `TIMEOUT_MULTIPLIER` | Scales every timeout in the suite. Range `0.1–3.0`, default `1.0`. Set to `2` or `3` on a slow runner or while debugging. See [Timeouts](#timeouts-and-the-t-wrapper). |
| `CI` | When truthy, Playwright runs with `forbidOnly`, `retries: 2`, `workers: 1`, and the GitHub reporter. |
| `GENERATE_REPORTS` | When truthy (and not CI), emits HTML + JUnit + `list` reporters to `e2e-tests/e2e-test-logs/`. |

---

## What this suite covers

Sefaria ships two independent web modules plus several embedded products that share a session and a user base:

- **Library** — the traditional reader, topics, and texts experience. Hosted at `www.<sandbox-domain>` (English) and `www.<sandbox-domain-il>` (Hebrew).
- **Voices** — the sheet-editing / community / trending-topics experience. Hosted at `voices.<sandbox-domain>` (English) and `chiburim.<sandbox-domain-il>` (Hebrew).
- **Library Assistant** — a `<lc-chatbot>` Svelte custom element embedded on the Library module for whitelisted users. 16 behavioral + 4 visibility-boundary tests. See [assistant/README.md](assistant/README.md).
- **Resource Panel** — the connections sidebar (`ConnectionsPanel`) that opens when a reader segment is clicked. Covers RP-001 → RP-212 (79 active tests across 19 spec files). See [Resource Panel/README.md](Full%20testing%20by%20Feature/Resource%20Panel/README.md).
- **Voices Topics** — topic pages on the Voices module (`voices.<sandbox>/topics/<slug>`) plus the topic landing page (`/topics`). Covers TOV-001 → TOV-019 (17 active tests across 2 spec files). See [Voices Topics/README.md](Full%20testing%20by%20Feature/Voices%20Topics/README.md).
- **Mobile** — the hamburger drawer that only renders below the 843 px breakpoint. 18 tests (HAM-*) across 2 spec files, run under a separate config. See [mobile web/README.md](mobile%20web/README.md).

Because the two modules share authentication but live on different subdomains, many tests exercise **cross-module** behavior (logging in on one module and verifying state on the other, following redirects, etc.). The suite is organised by folder; each folder maps to one or more Playwright projects, and each project pairs that folder with a specific browser and baseURL. See the [project matrix](#project-matrix).

---

## Directory map

```text
e2e-tests/
├── README.md              ← you are here — the human-facing handbook
├── CLAUDE.md              ← same rules, compressed for AI agents
├── example.env            ← template for .env
├── globals.ts             ← LANGUAGES, SOURCE_LANGUAGES, BROWSER_SETTINGS, AUTH_PATHS,
│                            TIMEOUT_MULTIPLIER, t(), testUser, testAdminUser, testLAUser
├── utils.ts               ← entry-point helpers, overlay suppression, language switching,
│                            cross-subdomain cookie fixups, URL helpers, geo-location (§18 Utilities)
├── global-setup.ts        ← runs once before any worker; writes one read-only auth_*.json per profile
├── constants.ts           ← MODULE_URLS, MODULE_SELECTORS, READER_SELECTORS, EXTERNAL_URLS,
│                            SITE_CONFIGS, VALID_TOPICS, SEARCH_DROPDOWN, SaveStates, and more
├── helpDeskLinksConstants.ts ← data driving Misc/help-sheet-redirects.spec.ts
├── auth_*.json            ← generated storage-state files (gitignored; written by global-setup)
├── pages/
│   ├── README.md          ← page-object index (canonical models, accessors, legacy/orphans)
│   ├── pageManager.ts     ← single entry point that mounts all 20 page objects
│   ├── helperBase.ts      ← base class providing `this.page` and `this.language`
│   └── <Feature>Page.ts   ← 20 mounted page objects, one per feature area (+ a couple of
│                            unregistered cleanup-candidate files — see Legacy §18)
├── library/               ← Library-module UI tests (header, sidebar, texts-tree)
│   └── README.md          ← Library folder guide (MOD-H/MOD-S IDs; legacy texts-tree note)
├── voices/                ← Voices-module UI tests (header, sidebar)
│   └── README.md          ← Voices folder guide
├── Sanity/                ← Release-gate smoke suite + redirect tests
│   └── README.md          ← per-test inventory for this suite
├── Misc/                  ← Cross-cutting / platform-level tests (help-sheet redirects)
│   └── README.md          ← Misc folder guide
├── assistant/             ← Library Assistant (<lc-chatbot>) tests
│   └── README.md          ← Library Assistant-specific guide
├── mobile web/            ← Mobile-viewport tests (hamburger drawer, auth flow)
│   └── README.md          ← Mobile-specific guide; runs via playwright.mobileweb.config.ts
├── Full testing by Feature/
│   ├── README.md          ← index: when a feature earns its own folder + project
│   ├── Resource Panel/    ← Resource Panel (ConnectionsPanel) tests, RP-001 → RP-212
│   │   └── README.md      ← Resource Panel guide (mode map, gotchas, reference texts)
│   └── Voices Topics/     ← Voices topic pages + landing, TOV-001 → TOV-019
│       └── README.md      ← Voices Topics guide (source map, design decisions, CSV adaptations)
├── fixtures/              ← shared test assets: test-image.jpg (image-upload tests) + its README
├── fixtures.ts            ← empty placeholder (cleanup candidate — see Legacy §18)
├── archived-tests/        ← retired specs (e.g. voices/trending-topics.spec.ts); not run by any project
│   └── README.md          ← why tests are archived + how to run them locally
└── e2e-test-logs/         ← reports, traces, screenshots, videos (gitignored)
```

> **Mobile tests live under a separate Playwright config** ([../playwright.mobileweb.config.ts](../playwright.mobileweb.config.ts)) because Sefaria's mobile chrome only mounts below `width < 843px`. The desktop projects in [../playwright.config.ts](../playwright.config.ts) never exercise it. The directory itself is `mobile web/` (with a space). See [mobile web/README.md](mobile%20web/README.md).

---

## Project matrix

Each test folder is run by three browser-specific Playwright projects defined in [../playwright.config.ts](../playwright.config.ts) (21 desktop projects total). When you run `npx playwright test`, every desktop project runs. The two mobile projects run only under the mobile config.

| Folder | Chromium project | Firefox project | WebKit project | baseURL |
| --- | --- | --- | --- | --- |
| `library/` | `chrome-library` | `firefox-library` | `safari-library` | `www.<domain>` |
| `voices/` | `chrome-voices` | `firefox-voices` | `safari-voices` | `voices.<domain>` |
| `Sanity/` | `chrome-sanity` | `firefox-sanity` | `safari-sanity` | `www.<domain>` |
| `Misc/` | `chrome-misc` | `firefox-misc` | `safari-misc` | `www.<domain>` |
| `assistant/` | `chrome-assistant` | `firefox-assistant` | `safari-assistant` | `www.<domain>` |
| `Full testing by Feature/Resource Panel/` | `chrome-resource-panel` | `firefox-resource-panel` | `safari-resource-panel` | `www.<domain>` |
| `Full testing by Feature/Voices Topics/` | `chrome-voices-topics` | `firefox-voices-topics` | `safari-voices-topics` | `voices.<domain>` |
| `mobile web/` *(separate config — [`playwright.mobileweb.config.ts`](../playwright.mobileweb.config.ts))* | `chrome-mobile-library` (Pixel 5) | — | `safari-mobile-library` (iPhone 13) | `www.<domain>` |

Hebrew module URLs (`MODULE_URLS.HE.LIBRARY`, `MODULE_URLS.HE.VOICES`) are derived from `SANDBOX_URL_IL` and are used *inside* tests when asserting Hebrew-site behavior — they are not separate Playwright projects.

---

## Where does my test go?

| What your test exercises | Put it in |
| --- | --- |
| Library-specific UI (reader, texts, topics, library header/sidebar) | `library/` |
| Voices-specific UI (sheet editor, trending, chiburim pages) | `voices/` |
| Library Assistant chatbot (`<lc-chatbot>`) | `assistant/` |
| Connections sidebar / Resource Panel (RP-NNN tests) | `Full testing by Feature/Resource Panel/` |
| Voices topic pages or `/topics` landing (TOV-NNN tests) | `Full testing by Feature/Voices Topics/` |
| Mobile-viewport / responsive UI (hamburger drawer, mobile auth flow) | `mobile web/` *(run via `--config=playwright.mobileweb.config.ts`)* |
| End-to-end release-gate smoke (login → profile → settings → logout, cross-module auth) | `Sanity/` |
| Platform-level invariants, cross-module URL redirects, static-route assertions | `Misc/` |

**Rule of thumb:** if a feature ships in one module only and has its own deep, CSV-driven test matrix, it earns its own folder under `Full testing by Feature/`. Otherwise, if it ships in one module only, use that module's folder; if it crosses modules, use `Sanity/`; if it's a platform-level invariant, use `Misc/`.

---

## Architecture in one diagram

```text
spec.ts (in library/ | voices/ | Sanity/ | Misc/ | assistant/ | mobile web/ |
         Full testing by Feature/<feature>/)
    │
    ├── new PageManager(page, language)
    │         │
    │         └── mounts 20 page objects, each extending HelperBase
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

Every test reaches the site through one of the entry-point helpers, builds a `PageManager`, and then drives the browser through high-level page-object methods. **No spec file should talk to `page.locator(...)` directly for product UI** — that belongs inside a page object.

---

## Core conventions

These eight rules govern every new test and page object. Violations are the most common cause of flakes and inconsistency. (CLAUDE.md restates these as numbered rules plus several agent-specific ones — read it for the full list.)

1. **Always go through `PageManager`.** In a `.spec.ts` file, prefer `pm.onX().someAction()` over raw `page.locator(...)`. Raw locators belong inside a page object.
2. **Always wrap timeouts with `t()`** from [globals.ts](globals.ts). No hardcoded `5000`, `10000`, etc. Example: `await expect(x).toBeVisible({ timeout: t(10000) })`.
3. **Overlay suppression is two layers.** Layer 1 is `installOverlaySuppression(context)`, called inside `goToPageWithLang` / `goToPageWithUser` *before* `context.newPage()`. It patches `localStorage.getItem` so every `modal_*` / `banner_*` key reads `"true"` (short-circuiting `InterruptingMessage.shouldShow()` and `Banner.shouldShow()` in `Misc.jsx` at lines 2100 and 2282) and short-circuits `/api/strapi/graphql-cache` with an empty payload — killing the Strapi "Sustainer" interrupting message at the React level before its `showDelay` timer even arms. Layer 2 is `hideAllModalsAndPopups(page)`, which click-dismisses the residual non-Strapi survivors (cookies banner, UseBounce widget, GuideOverlay, `#bannerMessage`, SiteWideBanner). The entry-point helpers call layer 2 after the first navigation; **call it again after any subsequent in-test `page.goto`, module switch, or login redirect** — a survivor can mount mid-test.
4. **Always enter via `goToPageWithLang` or `goToPageWithUser`** for the first navigation in `test.beforeEach`. Do not start a test with a bare `page.goto(...)`.
5. **Locator priority:** `getByRole` > `getByLabel` > `getByText` > `getByTestId` > CSS. Avoid brittle CSS like `.react-tags__search-input` in new code. In a bilingual app, prefer English-stable attributes (`data-name`) over visible text — see the Resource Panel POM for the canonical pattern.
6. **Never use `page.waitForTimeout(ms)` to wait for state.** Use web-first assertions (`await expect(locator).toBeVisible()`) — they auto-retry. `waitForTimeout` is acceptable only for deliberate pacing (e.g. after dismissing a modal) and must still be wrapped with `t()`.
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

**Current limitation:** the two cannot be combined in a single call. For a logged-in Hebrew session, use `heUser` / `heAdmin` directly — they already bake the Hebrew interface language into storage state.

Subsequent navigations within the same test may use `page.goto(...)` directly — but **always call `hideAllModalsAndPopups(page)` afterward.**

---

## The PageManager pattern

[pages/pageManager.ts](pages/pageManager.ts) is the single entry point to the **20 page objects** that model the site's feature areas. Each encapsulates the locators and actions for one area (header, sidebar, sheet editor, search, profile, resource panel, etc.).

```ts
import { PageManager } from '../pages/pageManager';

const pm = new PageManager(page, LANGUAGES.EN);

await pm.onModuleHeader().clickAndVerifyNavigation('Topics', /topics/);
await pm.onModuleSidebar().verifyStandardFooterLinks();
await pm.onSearchPage().searchFor('genesis');
await pm.onResourcePanel().waitForReaderReady();
```

The `language` parameter propagates into every page object so methods can branch on interface language without each method re-receiving it.

**Available accessors** (all of them, from [pages/pageManager.ts](pages/pageManager.ts)):

| Accessor | Page object | Accessor | Page object |
| --- | --- | --- | --- |
| `navigateFromBannerTo()` | banner / header nav | `onModuleHeader()` | module header |
| `onTextsPage()` | texts browse | `onModuleSidebar()` | sticky nav sidebar |
| `onTopicsPage()` | topics | `onProfilePage()` | public profile |
| `onCommunityPage()` | community | `onEditProfilePage()` | edit profile |
| `onDonatePage()` | donate | `onAccountSettingsPage()` | account settings |
| `onLoginPage()` | login form | `onLibraryAssistant()` | `<lc-chatbot>` chatbot |
| `onSignUpPage()` | sign-up form | `onResourcePanel()` | ConnectionsPanel sidebar |
| `onSearchPage()` | search | `onMobileHamburger()` | mobile hamburger drawer |
| `onUserMenu()` | user dropdown | `onVoicesTopic()` | Voices topic page |
| `onSourceTextPage()` | reader source text | `onSourceSheetEditorPage()` | sheet editor |

**When to extend vs. create:** most new tests add methods to existing page objects rather than creating new ones. Only create a new page object when the feature area doesn't fit cleanly into any existing one. After creating one, **register it in [pages/pageManager.ts](pages/pageManager.ts)** (import, add a `private readonly` field, instantiate in the constructor, expose an `onX()` accessor).

---

## Canonical page-object style

**Reference implementations (model new page objects on these):**

- **[pages/resourcePanelPage.ts](pages/resourcePanelPage.ts)** — the gold standard. Private `get` accessors for fixed elements, parameterized `Locator` factories (`toolsButton(name)`, `segment(ref)`), bilingual `data-name`-anchored locators, tiered timeouts for rate-limited endpoints, network interception, dialog pre-registration, FA force-clicks, and data-loaded gating. It exercises nearly every pattern in the suite.
- **[pages/voicesTopicPage.ts](pages/voicesTopicPage.ts)** — the concise counterpart: all-private `get` accessors, source-line-cited CSS selectors, data-loaded gating, a `withViewport` helper. A good size to read end-to-end.
- [pages/moduleSidebarPage.ts](pages/moduleSidebarPage.ts) — a simpler, role-based example for a smaller surface.

> [pages/moduleHeaderPage.ts](pages/moduleHeaderPage.ts) was the historical "canonical" example. It still works and is role-based, but it leaks selector strings to callers and carries some dead code — prefer the two files above as your model.

Rules:

- Extends `HelperBase` — inherits `this.page` and `this.language`.
- Constructor: `constructor(page: Page, language: string) { super(page, language); }`.
- Locators: use **private `get` accessors** for fixed lookups and **private parameterized methods** that return a `Locator` for repeated, argument-driven lookups. Don't expose raw locators as public fields.
- Public methods are async actions returning `void` or relevant data (new pages, extracted text, etc.).
- Import `t` from [globals.ts](globals.ts) and wrap every explicit timeout.
- Import `hideAllModalsAndPopups` from [utils.ts](utils.ts) and call it defensively before interacting with overlay-prone areas.
- Branch on `this.language` for language-specific visible text — but prefer English-stable `data-*` anchors where they exist.

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

  private submitButton(label: string) {
    return this.container.getByRole('button', { name: label });
  }

  async submitForm() {
    await hideAllModalsAndPopups(this.page);
    const label = this.language === LANGUAGES.HE ? 'שלח' : 'Submit';
    await expect(this.submitButton(label)).toBeVisible({ timeout: t(5000) });
    await this.submitButton(label).click();
  }
}
```

---

## Canonical spec structure

**Reference implementations:**

- **[library/header.spec.ts](library/header.spec.ts)** — the cleanest minimal skeleton. Copy its `beforeEach`.
- **[Full testing by Feature/Resource Panel/opening-and-general.spec.ts](Full%20testing%20by%20Feature/Resource%20Panel/opening-and-general.spec.ts)** — a focused, POM-pure spec: every action goes through `pm.onResourcePanel()`, zero raw locators.
- **[Full testing by Feature/Voices Topics/voices-topics.spec.ts](Full%20testing%20by%20Feature/Voices%20Topics/voices-topics.spec.ts)** — a full-featured spec: bilingual describe-per-language, data-driven sort assertions, `test.setTimeout(t(...))` for heavy tests, and comments that cite source to justify intentionally-not-automated rows.

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
- **Test IDs:** prefix with a stable identifier (`MOD-H###` header, `MOD-S###` sidebar, `RP-###` resource panel, `TOV-###` voices topics, `HAM-###` mobile, `UX-###` / `LA-NEG-###` assistant, `Sanity N` sanity). This makes `-g 'MOD-H002'` work.
- **`test.beforeEach`** re-creates `page` and `pm` per test for isolation. Don't share state unless you deliberately opt into `test.describe.configure({ mode: 'serial' })` (as the sheet-workflow sanity suite does).

---

## Worked example

**Task:** verify the Library sidebar footer's "Help" link opens the Zendesk help center in a new tab.

**Step 1 — decide where it lives.** Library-module-specific UI → `e2e-tests/library/`. By the matrix it runs under `chrome-library`, `firefox-library`, `safari-library`.

**Step 2 — pick a filename.** Kebab-case, descriptive: `sidebar-help-link.spec.ts`.

**Step 3 — inventory what exists.**
- `pm.onModuleSidebar()` already exposes `clickAndVerifyLink(spec)`. No new page-object method needed.
- [constants.ts](constants.ts) already has `EXTERNAL_URLS.HELP` — a regex matching the Zendesk URL. Use it.

**Step 4 — write the spec.**

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

**Step 5 — run it.**

```bash
npx playwright test library/sidebar-help-link.spec.ts --project=chrome-library
```

**Step 6 — when it fails, diagnose from the outside in:**

1. **Modal blocking clicks?** Confirm `hideAllModalsAndPopups(page)` runs in `beforeEach` and after any in-test `page.goto`.
2. **URL regex too tight?** `console.log(newPage.url())` and refine `EXTERNAL_URLS.HELP` in `constants.ts` — don't inline a different regex in the test.
3. **Slow environment?** Set `TIMEOUT_MULTIPLIER=2` in `.env`.
4. **Locator changed upstream?** Update the page object (`moduleSidebarPage.ts`), not the test.
5. **Auth required?** If the link only renders for logged-in users, switch to `goToPageWithUser(context, url, BROWSER_SETTINGS.enUser)`.

---

## Running tests

```bash
# Every desktop project (chrome/firefox/safari × the 7 folders)
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

## Reviewing a test — checklist

When code-reviewing a PR that touches tests, verify each of:

- [ ] **PageManager used?** Specs call `pm.onX()`, not raw `page.locator()`.
- [ ] **Timeouts wrapped with `t()`?** Any bare `5000`, `10000`, `timeout: 2000` is a defect.
- [ ] **`hideAllModalsAndPopups` after navigation?** Missing calls cause `element intercepts pointer events` flakes.
- [ ] **Entry-point helper used?** First navigation is `goToPageWithLang` / `goToPageWithUser`, not `page.goto`.
- [ ] **Locators role-based / bilingual-safe?** `getByRole`/`getByLabel`/`getByText` preferred; `data-*` anchors for anything that could run in Hebrew UI. Brittle CSS in spec files is a red flag.
- [ ] **`page.waitForTimeout`?** If unwrapped or used to wait for state, flag it. Replace with an assertion.
- [ ] **Magic strings / URLs?** Should be in `constants.ts`.
- [ ] **Page object extends `HelperBase`?** If not, flag it unless the file is on the [legacy list](#legacy-patterns-to-recognise).
- [ ] **Test isolation?** Unless explicitly `serial`, each test works independently from a fresh `beforeEach`.
- [ ] **Credentials hardcoded?** Must come via `testUser` / `testAdminUser` / `testLAUser` / `BROWSER_SETTINGS`.
- [ ] **Mode anchor vs. data-loaded?** If a test asserts on per-item content, it must wait for a *specific child*, not just the outer container.
- [ ] **`test.skip` justified?** Skips for missing production data are a smell — verify via the Sefaria API and adapt the test instead (see CLAUDE.md §2A).
- [ ] **Destructive APIs / auth intercepted?** Tests that mutate user state should route-intercept the endpoint; destructive-auth tests must use a throwaway profile (see [§18 Destructive-auth](#destructive-auth-tests)).
- [ ] **`console.log` / research specs left in?** Remove debug output; `__research__*.spec.ts` files must not be committed.

---

## Reports, traces, and artifacts

All test artifacts land in `e2e-tests/e2e-test-logs/` (gitignored):

- `test-results/` — raw Playwright output, including `trace.zip`, screenshots, and videos
- `html-report/` (and `html-report-mobile/`) — HTML reporter output (only when `GENERATE_REPORTS=1`)
- `junit-results.xml` (and `junit-results-mobile.xml`) — JUnit XML (only when `GENERATE_REPORTS=1`)

**Retention policy** (from [../playwright.config.ts](../playwright.config.ts)):

- Screenshots: `only-on-failure`
- Videos: `retain-on-failure`
- Traces: `retain-on-failure`

Open a trace with `npx playwright show-trace <path-to-trace.zip>` — it gives a frame-by-frame replay of the failing run with DOM snapshots, network activity, and console output.

---

## CI behavior, workers, and parallelism

When `process.env.CI` is truthy (desktop config):

- `forbidOnly: true` — CI fails if `test.only()` was left in source
- `retries: 2` — each failing test retries up to twice
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

**Desktop tests should pass at full parallelism.** Auth-related flakes are structurally impossible: [global-setup.ts](global-setup.ts) writes each `auth_*.json` exactly once before any worker starts, and `goToPageWithUser` only ever reads those files. If a test flakes only when others run alongside it, the cause is in the test — usually one of: too-short timeouts on async fetches (bump to `t(40000)+` or use `test.slow()`), multiple sequential `isVisible` races (use one atomic `page.evaluate()`), or URL assertions that don't tolerate auth-required redirects. **Fix the test rather than capping workers** (CLAUDE.md rule 20).

The one sanctioned exception is the **mobile config** ([../playwright.mobileweb.config.ts](../playwright.mobileweb.config.ts)), which caps non-CI workers at **2** with **1 retry** and a longer per-test timeout (`t(60000)`) — staging returns 5xx on `/login` under 5+ concurrent mobile-emulation workers. That cap is config-level and applies automatically when you run with `--config=playwright.mobileweb.config.ts`.

---

## Troubleshooting

**Tests fail with `element intercepts pointer events` or modals blocking clicks.**
The Strapi "Sustainer" modal and generic banner are pre-empted at context level by `installOverlaySuppression` inside the entry-point helpers. For residual overlays (cookies banner, GuideOverlay, UseBounce, SiteWideBanner) call `await hideAllModalsAndPopups(page)` after the offending action. If you see `interruptingMessage` or `bannerMessage` in a DOM snapshot, that's a regression in the layer-1 patch — verify `installOverlaySuppression` is awaited before `context.newPage()`.

**Auth state seems corrupted between runs.**
[global-setup.ts](global-setup.ts) wipes all `auth_*.json` at the start of every run and re-writes them from a fresh login. Don't manually delete them mid-run. If a single profile is wedged, delete just that one file and re-run.

**Timeouts flaky on a slow machine.**
Set `TIMEOUT_MULTIPLIER=2` (or `3`) in `.env` — it scales every `t()`-wrapped timeout globally. Rule out a global timing issue before debugging individual waits.

**A test passes locally but fails in `--ui` mode (or vice versa).**
Check the trace (`e2e-test-logs/test-results/`) for the actual timing. Usually a missing `hideAllModalsAndPopups` call or a state-dependent `waitForTimeout`.

**Hebrew tests fail even though English passes.**
Verify `SANDBOX_URL_IL` is set correctly in `.env`. `MODULE_URLS.HE.*` are derived from it.

**Authentication errors / "fields must not be empty".**
Check that `PLAYWRIGHT_USER_EMAIL` / `PLAYWRIGHT_USER_PASSWORD` (and `PLAYWRIGHT_SUPERUSER_*` / `PLAYWRIGHT_LA_USER_*` if your test uses those flows) are set in `.env`.

**Trending-topics admin reset complains about superuser credentials.**
That flow hits the Django admin `/admin/reset/...` endpoint, which requires `PLAYWRIGHT_SUPERUSER_EMAIL` / `PLAYWRIGHT_SUPERUSER_PASSWORD`.

**Library Assistant `waitForReady()` times out.**
The `<lc-chatbot>` element only mounts for the whitelisted account. Enter via `BROWSER_SETTINGS.enLAUser`, never `enUser` / `enAdmin`. See [assistant/README.md](assistant/README.md).

---

## Reference appendix

### Authentication and storage state

[globals.ts](globals.ts) exposes storage-state profiles keyed by name. Each has a `lang`, an `auth_*.json` file path, and a `user`.

| Profile | Logged in as | Purpose |
| --- | --- | --- |
| `BROWSER_SETTINGS.enUser` / `.heUser` | Standard test user (`testUser`) | Default profile for any logged-in test |
| `BROWSER_SETTINGS.enAdmin` / `.heAdmin` | Admin / superuser (`testAdminUser`) | Moderator / editor flows (e.g. create topic, edit text). Also the de-facto destructive-auth throwaway — see below. |
| `BROWSER_SETTINGS.enLAUser` | Library Assistant whitelisted user (`testLAUser`) | LA-specific — `<lc-chatbot>` only mounts for this account |

> The pre-refactor `BROWSER_SETTINGS.english` / `.hebrew` profiles **no longer exist**. Anonymous tests use `goToPageWithLang(...)`; logged-in tests use the five profiles above.

**How the flow works** — a one-time global setup, read-only thereafter (the textbook parallel-safe Playwright pattern):

1. **Before any worker starts**, Playwright invokes [global-setup.ts](global-setup.ts). It wipes every `auth_*.json` from the previous run, logs in each *unique account* exactly once (`testUser`, `testAdminUser`, `testLAUser`), calls `fixCookieDomainsForCrossSubdomain` so `sessionid` lives on the parent domain and authenticates both `www.*` and `voices.*`, and writes one `auth_<lang>_<role>.json` per profile. EN and HE variants of one account **share** that login (Sefaria invalidates concurrent sessions for the same user), stamped with different `interfaceLang` values.
2. **Each worker** (a separate Node process) calls `goToPageWithUser(...)`, which reads the file (throws with a clear pointer if it's missing), re-applies the cookie fixups defensively, opens a page, navigates once, and hides modals.
3. **Anonymous tests** use `goToPageWithLang(...)` — no file, no login.

In practice: you never manually delete `auth_*.json`; per-test login cost is zero; the suite runs at full parallelism without auth races.

### Multi-language testing

```ts
import { LANGUAGES, SOURCE_LANGUAGES } from '../globals';

LANGUAGES.EN   // 'english'
LANGUAGES.HE   // 'hebrew'

// Source-text language regexes (for source-text-page UI):
SOURCE_LANGUAGES.EN   // /^(תרגום|Translation)$/
SOURCE_LANGUAGES.HE   // /^(מקור|Source)$/
SOURCE_LANGUAGES.BI   // /^(מקור ותרגום|Source with Translation)$/
```

- **Mid-test switching:** `changeLanguage(page, LANGUAGES.HE)` from [utils.ts](utils.ts) — tries the UI dropdown, falls back to cookie-based switching with a reload.
- **Both languages in one file:** loop a `test.describe` per language config (`{ label, lang, baseUrl }`), creating `page`/`pm` in each `beforeEach`. See [voices-topics.spec.ts](Full%20testing%20by%20Feature/Voices%20Topics/voices-topics.spec.ts) for the canonical bilingual structure.
- **Geo caveat:** Playwright defaults to NYC coordinates (set in [playwright.config.ts](../playwright.config.ts)), steering auto-detection toward English. Passing `LANGUAGES.HE` through `goToPageWithLang` explicitly sets Hebrew regardless of detected geo. Use `isIsraelIp(page)` to check.

### Timeouts and the `t()` wrapper

Global timeouts in [playwright.config.ts](../playwright.config.ts): per-test `t(50000)`, per-assertion `t(10000)` (the mobile config uses `t(60000)` per-test). `t(ms)` from [globals.ts](globals.ts) is just `ms × TIMEOUT_MULTIPLIER`, rounded; the multiplier is clamped to `0.1–3.0`.

```ts
import { t } from '../globals';

await expect(element).toBeVisible({ timeout: t(10000) });  // ✅ scales
test.setTimeout(t(120000));
await page.waitForTimeout(t(500));   // only for deliberate pacing

await expect(element).toBeVisible({ timeout: 10000 });     // ❌ ignores multiplier
```

When a test is flaky on CI but passes locally, turn the `TIMEOUT_MULTIPLIER=2` knob first. For polling conditions prefer `await expect(locator).toPass({ timeout: t(...) })` over manual loops.

### Locator priority

Prefer Playwright's [user-facing locators](https://playwright.dev/docs/locators), in order:

1. `page.getByRole('button', { name: /submit/i })`
2. `page.getByLabel('Email address')`
3. `page.getByText('Welcome back')`
4. `page.getByTestId('submit-btn')` (add `data-testid` app-side if a role locator isn't reliable)
5. CSS as a last resort — `page.locator('.some-class')`

In the bilingual app, prefer an **English-stable `data-name`** or English-keyed constant over a visible label — `pm.onResourcePanel().toolsButton('About this Text')` (which targets `data-name`) is robust under `interface=hebrew`; `getByText('About this Text')` is not. Some legacy code drifted toward CSS; don't replicate that in new code.

### Constants catalogue

[constants.ts](constants.ts) centralises every site-wide string, regex, and selector. Before inlining a magic string, check whether it already lives here.

| Export | Reach for it when |
| --- | --- |
| `MODULE_URLS.EN.LIBRARY` / `.VOICES` / `MODULE_URLS.HE.*` | You need a base URL for a module × language |
| `MODULE_SELECTORS` | Interacting with the module header (logo, icons, dropdowns) |
| `READER_SELECTORS` | Asserting on reader-page DOM structure |
| `SHEET_EDITOR_SELECTORS`, `SaveStates` | Sheet-editor flows (publish / save / unpublish / delete) |
| `SIDEBAR_SELECTORS` | Navigating the sticky nav sidebar |
| `TOPIC_SELECTORS` | Topic pages, trending blocks, autocomplete |
| `EXTERNAL_URLS.DONATE` / `.HELP` / `.DEVELOPERS` | Asserting a link opens an external destination |
| `SEARCH_DROPDOWN` | Search autocomplete sections, icons, test terms per module |
| `VALID_TOPICS` | Voices trending-topic workflows — pick a known-valid slug |
| `SITE_CONFIGS.LIBRARY` / `.VOICES` | Tab order, main nav links per module (header / a11y tests) |
| `MODULE_SWITCHER`, `MODULE_TEXTS` | Cross-module switcher menu validation |
| `MOBILE_HAMBURGER`, `MOBILE_PAGE_URLS` | Mobile hamburger drawer selectors and destinations |

**Rule of thumb:** if a string or regex feels site-wide, add it to `constants.ts` instead of inlining.

### Utilities catalogue (`utils.ts`)

[utils.ts](utils.ts) holds the shared helpers below the page-object layer. The entry-point and overlay helpers are covered above; these are the rest worth knowing about.

| Helper | Use it for |
| --- | --- |
| `goToPageWithLang` / `goToPageWithUser` | Entry-point navigation (anonymous / logged-in) — see [§8](#entry-point-helpers) |
| `installOverlaySuppression` / `hideAllModalsAndPopups` | The two-layer overlay suppression — see [rule 3](#core-conventions) |
| `changeLanguage` / `toggleLanguage` | Mid-test interface-language switch |
| `fixCookieDomainsForCrossSubdomain` | Rewrite `sessionid` onto the parent domain so `www.*` and `voices.*` share auth |
| `switchModule` | Navigate between Library and Voices in-test |
| `logout` / `expireLogoutCookie` / `isUserLoggedIn` | Auth-state manipulation and checks |
| `createNewSheet` | Create a sheet and return its id (Voices flows) |
| `gotoOrThrow` | `page.goto` that throws on an error status instead of silently continuing |
| `normalizeUrl` / `urlMatches` / `assertUrlMatches` | Tolerant URL comparison (ignore query / trailing slash) |
| `assertStatusNotError` | Assert a response status isn't 404/5xx |
| `simulateOfflineMode` / `simulateOnlineMode` | Toggle network conditions |
| `waitForSegment` | Wait for a reader segment to render |
| `isIsraelIp` / `getCountryByIp` | Geo checks (see the [geo caveat](#multi-language-testing)) |
| `getModuleFromUrl` / `getPathAndParams` | Parse module / path out of a URL |
| `isClickable` | Boolean actionability check |

### Destructive-auth tests

The shared-session model has a sharp edge: tests that destroy or rotate the server-side session (UI logout, UI re-login as a globalSetup-managed account, password change) **cannot use a profile that other concurrent tests read**. The on-disk `sessionid` is shared across workers; when one worker hits `/logout`, Django's `session.flush()` deletes the row and every other worker holding that `sessionid` is silently logged out on its next request.

**Currently in the suite:** the only destructive-auth test is **Sanity 7** ("User can logout successfully" in [Sanity/user-flow-sanity.spec.ts](Sanity/user-flow-sanity.spec.ts)), which uses `BROWSER_SETTINGS.enAdmin` rather than `enUser` for exactly this reason — no other Sanity test depends on the admin session staying alive, so destroying it every run is harmless. (This was a real flake: `Sanity 8h`/`8i` intermittently failed with "User Logged out" pills until Sanity 7 was moved off `enUser`.)

**When writing a new destructive-auth test, either:**

- **Use a profile no other concurrent test depends on.** Today that means `enAdmin` for any non-admin destructive flow. For an admin-dependent destructive flow you'd need a dedicated 4th account — flag it before merging. Never use `enUser`.
- **Intercept the destructive request.** `page.route('**/logout', route => route.fulfill({ status: 302, headers: { Location: '/' } }))` keeps the server-side session alive while preserving the UI redirect.

**Existing tripwire:** `cross-module-login.spec.ts` Scenarios 4–7 perform parallel UI logins as the same QA user. They pass only because Sefaria's Django config doesn't regenerate sibling sessions on fresh login; if that policy ever tightens upstream, those scenarios become the next flake. (CLAUDE.md rule 21 has the full treatment.)

### Legacy patterns to recognise

These files **work** but don't reflect current conventions. Don't copy their shape; don't refactor them as part of unrelated work.

| File | What's different | What to do |
| --- | --- | --- |
| [pages/banner.ts](pages/banner.ts) | Does not extend `HelperBase` | New page objects extend `HelperBase` |
| [pages/sheetEditorPage.ts](pages/sheetEditorPage.ts) | Uses `locator = () => page.locator(...)` arrow-function fields | Use private `get` accessors |
| [pages/accountSettingsPage.ts](pages/accountSettingsPage.ts), [pages/profilePage.ts](pages/profilePage.ts), [pages/editProfilePage.ts](pages/editProfilePage.ts) | Public `get foo()` getters — acceptable but not canonical | Prefer private `get` |
| [pages/moduleHeaderPage.ts](pages/moduleHeaderPage.ts) | Leaks selector strings to callers; some dead code | Model new POMs on `resourcePanelPage.ts` / `voicesTopicPage.ts` instead |
| [library/texts-tree-traversal.spec.ts](library/texts-tree-traversal.spec.ts) | Bypasses `PageManager`; raw `page.getByRole()` throughout | All new specs go through `pm.onX()` |

**Cleanup candidates** (document only — not deleted in this pass): `pages/sourceSheetEditor.page.ts` and `pages/sheetReaderPage.ts` are not registered on `PageManager`; [fixtures.ts](fixtures.ts) is an empty placeholder; `archived-tests/` holds retired specs run by no project.

### Future direction

Playwright's current guidance recommends **`test.extend()` custom fixtures** over a constructor-based page-manager class. A fixture-based version would expose `pm` (and auth `storageState` via a `setup` project dependency) directly to tests:

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

**This is a future direction, not a required migration.** Current tests follow the conventions in this document.

---

## Related docs

- [CLAUDE.md](CLAUDE.md) — the same conventions compressed for AI agents, plus universal patterns (FA-icon clicks, jQuery URL encoding, dialog ordering, network interception, worker tuning) and the API-driven data-verification catalogue
- [pages/README.md](pages/README.md) — page-object index: canonical models (`resourcePanelPage`, `voicesTopicPage`), every `pm.onX()` accessor, and the legacy/orphan markers
- [library/README.md](library/README.md), [voices/README.md](voices/README.md), [Misc/README.md](Misc/README.md) — per-folder guides for the module and cross-cutting test folders
- [Full testing by Feature/README.md](Full%20testing%20by%20Feature/README.md) — index of the deep, plan-driven feature suites and when a feature earns its own folder
- [Sanity/README.md](Sanity/README.md) — per-test inventory for the Sanity release-gate suite
- [assistant/README.md](assistant/README.md) — Library Assistant (`<lc-chatbot>`) testing guide
- [Full testing by Feature/Resource Panel/README.md](Full%20testing%20by%20Feature/Resource%20Panel/README.md) — Resource Panel guide: mode-navigation map, per-mode selector reference, auth-gated features, and the Common-gotchas catalogue
- [Full testing by Feature/Voices Topics/README.md](Full%20testing%20by%20Feature/Voices%20Topics/README.md) — Voices Topics guide: per-test detail, CSV-vs-product adaptations, source-component map, reference topic (`torah`)
- [mobile web/README.md](mobile%20web/README.md) — Mobile-viewport guide: hamburger drawer, auth flow, staging cookies banner, WebKit popup/cookie quirks
- [archived-tests/README.md](archived-tests/README.md) — why specs are archived (CI-unsafe / data-mutating) and how to run them locally
- [fixtures/README.md](fixtures/README.md) — shared test assets (`test-image.jpg`) and image-testing best practices
- [../playwright.config.ts](../playwright.config.ts) — Playwright configuration (desktop projects)
- [../playwright.mobileweb.config.ts](../playwright.mobileweb.config.ts) — Playwright configuration (mobile projects)
- [Playwright official docs](https://playwright.dev/docs/intro) — upstream framework reference
