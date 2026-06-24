# CLAUDE.md — E2E Test Agent Guide

> Auto-loaded into agent context when working under `e2e-tests/`. Prescriptive rules for writing new tests, extending page objects, and auditing existing code. Last verified 2026-05-12 against branch `mdl-playwright`.

---

## 1. What this directory does

Playwright end-to-end test suite for Sefaria. Two web modules and one embedded product are under test:

- **Library** — `www.<sandbox-domain>` (English) / `www.<sandbox-domain-il>` (Hebrew)
- **Voices** — `voices.<sandbox-domain>` (English) / `chiburim.<sandbox-domain-il>` (Hebrew)
- **Library Assistant** — `<lc-chatbot>` custom element embedded on the Library module. See [assistant/README.md](assistant/README.md) for the full LA-specific guide.
- **Resource Panel** — `ConnectionsPanel` reader sidebar, RP-001 → RP-212. See [Full testing by Feature/Resource Panel/README.md](Full%20testing%20by%20Feature/Resource%20Panel/README.md).
- **Voices Topics** — `/topics/<slug>` and `/topics` landing on the Voices module, TOV-001 → TOV-019 (non-skipped). See [Full testing by Feature/Voices Topics/README.md](Full%20testing%20by%20Feature/Voices%20Topics/README.md).
- **Library Topics** — `/topics/<slug>` and `/topics` landing on the Library module, LIB-001 → LIB-029 (31 active). Same `TopicPage.jsx` component as Voices, but renders text sources + a source-language toggle. See [Full testing by Feature/Library Topics/README.md](Full%20testing%20by%20Feature/Library%20Topics/README.md).
- **Voices Bookmarks & History** — sheet-page bookmarking + the `/saved` and `/history` lists on the Voices module, VBM-001 → VBM-010 (10 active). See [Full testing by Feature/Voices Bookmarks (Saved) and History/README.md](Full%20testing%20by%20Feature/Voices%20Bookmarks%20History/README.md).

Tests run against the sandbox URL pointed at by `SANDBOX_URL` / `SANDBOX_URL_IL` env vars. Each Playwright "project" in [playwright.config.ts](../playwright.config.ts) pairs a browser (Chromium/Firefox/WebKit) with a folder under `e2e-tests/`. **Mobile tests live under a separate config** ([../playwright.mobileweb.config.ts](../playwright.mobileweb.config.ts)) because Sefaria's mobile chrome only mounts below `width < 843px`; the desktop projects never exercise it. See [mobile web/README.md](mobile%20web/README.md) and §20 below.

---

## 2. Non-negotiable rules (read this first)

1. **Always go through `PageManager`.** In a `.spec.ts` file, prefer `pm.onX().someAction()` over raw `page.locator(...)`. Raw locators belong inside a page object, not a spec.
2. **Always wrap timeouts with `t()`** from [globals.ts](globals.ts). No hardcoded `5000`, `10000`, etc. Example: `await expect(x).toBeVisible({ timeout: t(10000) })`.
3. **Overlay suppression is two layers.** Layer 1 is `installOverlaySuppression(context)` — called inside `goToPageWithLang` and `goToPageWithUser` *before* `context.newPage()` — which patches `localStorage.getItem` so every `modal_*`/`banner_*` key reads `"true"`, and short-circuits `/api/strapi/graphql-cache` with an empty payload. That kills the Strapi "Sustainer" interrupting message at React's `shouldShow()` short-circuit (Misc.jsx:2100, 2282) before the `showDelay` timer arms. Layer 2 is `hideAllModalsAndPopups(page)`, which click-dismisses the residual non-Strapi survivors (cookies banner, UseBounce widget, GuideOverlay, `#bannerMessage`, SiteWideBanner). The entry-point helpers already call layer 2 after the first navigation; **call `hideAllModalsAndPopups(page)` again after any subsequent in-test `page.goto`, module switch, or login redirect** — a new survivor can mount mid-test.
4. **Always enter via `goToPageWithLang` or `goToPageWithUser`** for the first navigation in `test.beforeEach`. Do not start a test with a bare `page.goto(...)`.
5. **Locator priority:** `getByRole` > `getByLabel` > `getByText` > `getByTestId` > CSS. Avoid brittle CSS like `.react-tags__search-input` in new code.
6. **Never use `page.waitForTimeout(ms)` to wait for state.** Use web-first assertions (`await expect(locator).toBeVisible()`) — they auto-retry. `waitForTimeout` is acceptable *only* for deliberate pacing (e.g., after a modal dismiss), and if used, it **must** be wrapped with `t()`.
7. **New page objects must extend `HelperBase`** and follow the canonical style (§5).
8. **Respect the legacy list (§15).** Do not model new code on files flagged there.
9. **For Shadow-DOM / custom-element surfaces, trust Playwright's native locators.** `getByRole`, `getByLabel`, `getByText`, and CSS all pierce *open* shadow roots by default — no `>>>`, `::shadow`, or `page.evaluate(querySelector)` gymnastics. Reach for `evaluate` only when a role/label path truly can't reach the target.
10. **Read the React component before writing locators in a new feature area.** Source lives under `static/js/` at the repo root. Five minutes reading the component that owns the DOM you're testing saves thirty minutes of guessing. Skip this step only when your test reuses existing POM methods unchanged — for any new POM method or new feature area, read the source first.
11. **Mode/container anchors confirm React reached a state — they do not confirm data has loaded.** Most Sefaria panels render their wrapper immediately and stream content in async. When asserting on per-item rendering (versions, results, segments, list rows), wait for a *specific child element* to be visible, not just the outer container.
12. **Do not `test.skip` for missing or unexpected production data — adapt the test instead.** If a feature surface appears empty or a locator doesn't match, verify the data state via the Sefaria API (§2A) and adjust: pick a different ref, switch to a structural assertion, or document the verification trail in a comment. `test.skip` / `test.fixme` are reserved for harness limitations, never for environment data gaps.
13. **Verify production data via the Sefaria API before writing data-shaped assertions.** A 30-second API call beats three failed test runs. See §2A for the endpoint catalogue.
14. **Throwaway research specs are a sanctioned workflow.** When you don't know what production renders, write `__research__.spec.ts` (or `__research2__.spec.ts`), log JSON state with `console.log(JSON.stringify(...))`, run with `--workers=1`, codify findings into the real spec, then **delete the research file**. Never commit research specs.
15. **In a bilingual app, prefer English-stable attributes over visible text.** When a component exposes a `data-name`, an English-keyed constant, or any other interface-language-invariant anchor, use it over the displayed label. `pm.onResourcePanel().toolsButton('About this Text')` (which targets `data-name`) is robust under `interface=hebrew`; `getByText('About this Text')` is not.
16. **Click Font Awesome `<i>` icons with `force: true` after scrolling them into view.** FA renders icons via CSS pseudo-elements, leaving the `<i>` host with zero intrinsic dimensions. Playwright's actionability check then reports them as "not visible" even when they paint on screen. Pattern: `await el.scrollIntoViewIfNeeded(); await el.click({ force: true });`. Same applies to any `role="button"` element that delegates its visual to a pseudo-element or background-image.
17. **Pin `page.once('dialog', d => d.accept())` *before* the click that triggers a native dialog.** Sefaria uses `window.confirm()` for destructive ops (`AddNoteBox.deleteNote`, etc.). If the dialog handler is registered after the click, the dialog auto-dismisses with cancel and the test silently no-ops.
18. **For destructive APIs, intercept the network call — don't pollute production state.** Sefaria endpoints like `/api/notes`, `/api/sheets/<id>/add`, `/api/send_feedback`, `/api/links` mutate real user state. In tests, do `await page.route('**/api/<endpoint>', route => { posted = true; body = route.request().postData(); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) }); });` and assert on the captured request body. The user-visible state never changes; the test still proves the click triggered the correct payload.
19. **jQuery `$.post` urlencodes bodies with `+` for space, not `%20`.** `decodeURIComponent("Genesis+1%3A1")` returns `Genesis+1:1`, not `Genesis 1:1`. Always normalize with `.replace(/\+/g, ' ')` before substring-matching API request bodies. Also: `decodeURIComponent` throws on stray unescaped characters mixed with `%XX` sequences — when the payload may contain user-typed content with special chars, skip the decode and substring-match the raw urlencoded body instead.
20. **Tests should pass at full parallelism — fix flakes, don't cap workers.** If a test fails only when other tests run alongside it, the root cause is almost always one of (a) too-short timeouts on async data fetches (production rate-limiting queues requests under load — bump to `t(40000)+` for endpoints like manuscripts/translations/notes, or use `test.slow()` to triple the test budget); (b) multiple sequential `isVisible({ timeout })` calls that each have their own race window — use one atomic `page.evaluate()` instead; (c) URL assertions that match a single hostname without considering auth-required redirects (Twitter → x.com login, Facebook → m.facebook.com mobile, …) — match on the encoded payload, not the post-redirect URL. Capping workers hides flakes instead of fixing them.
21. **Destructive-auth tests must use a profile no other concurrent test reads.** UI logout, UI re-login as a globalSetup-managed account, password change, or anything else that destroys or rotates the server-side Django session row will invalidate the shared `auth_*.json` for every other concurrent worker reading it. The session-on-disk model in [global-setup.ts](global-setup.ts) is read-only and shared; mutating one worker's view mutates them all. Today the only such test is Sanity 7 ("User can logout successfully" in [Sanity/user-flow-sanity.spec.ts](Sanity/user-flow-sanity.spec.ts)), which uses `BROWSER_SETTINGS.enAdmin` rather than `enUser` because no other Sanity test depends on the admin session staying alive. If you add a new test that performs a UI logout, a UI login of the same email as a globalSetup profile, or a password change, you MUST EITHER: (a) use a profile no other concurrent test depends on — currently `enAdmin` is the de-facto throwaway since Sanity 7 already destroys it every run; if your test needs admin-specific behavior to persist, flag the need for a dedicated 4th throwaway account before merging — OR (b) intercept the destructive request with `page.route('**/logout', …)` so the server-side session row is never touched. The UI redirect behavior is testable without the real server round-trip; see rule 18 for the analogous pattern with destructive APIs. `cross-module-login.spec.ts` Scenarios 4-7 are an existing tripwire: they perform parallel UI logins as `testUser` and currently pass only because Django doesn't regenerate sibling sessions on fresh login — if that policy tightens upstream, that file becomes the next flake.

---

## 2A. API-driven data verification

Sefaria's public APIs are the fastest oracle for "does this data exist on production right now?" Hit them with `WebFetch` or `curl` before writing a data-shaped assertion. If the API says the field is empty or the version doesn't exist, the test cannot pass — change the test inputs, don't run-and-pray.

| Endpoint | Returns | Reach for it when… |
| --- | --- | --- |
| `GET /api/texts/<Ref>?with_full_versions=1` | Full version metadata for a ref | Asserting on translations, version counts, `extendedNotes`, version titles |
| `GET /api/v3/versions/<Ref>` | Version list with extended metadata | Per-version assertions in the Translations panel |
| `GET /api/related/<Ref>` | Connection / sheet / topic associations | Asserting on Related Texts categories, counts, topics, web pages |
| `GET /api/words/<word>?lookup_ref=<Ref>` | Lexicon entries (BDB, Klein, Jastrow, …) | Asserting on dictionary lookups or the active dictionaries for a word |
| `GET /api/topics/<slug>?annotated=false` | Topic data, including disambiguation `possibilities` | Asserting on named-entity behavior, author topic pages |
| `GET /api/name/<query>` | Autocomplete completions | Asserting on search-bar suggestions |
| `GET /api/profile/<slug>` | Public profile data | Profile-page tests |

**Worked example.** RP-054 needs to verify "selecting the first Hebrew word returns a BDB dictionary entry." Workflow:

1. `GET /api/words/<word>?lookup_ref=Genesis.1.1` — confirm at least one entry has `parent_lexicon` starting with `BDB`.
2. If yes → assertion: `.entry .attribution :text-matches("BDB", "i")` will pass on production.
3. If no → pick a different word, or change the assertion. *Don't* `test.skip`.

**When NOT to bother.** UI-mechanics tests (header clicks, modal close, sidebar nav, login form behavior) don't assert on data shape — skip the API step. The rule applies when the test asserts on what the data *says*, not on what the UI *does*.

---

## 3. Architecture map

```text
global-setup.ts  ← runs ONCE before any worker; logs in each account, writes auth_*.json
   │
   ▼
spec.ts (in library/ | voices/ | assistant/ | Sanity/ | Misc/)
   │
   ├── new PageManager(page, language)  ← mounts 20 page objects (incl. libraryAssistantPage)
   │        │
   │        └── pages/*.ts (extend HelperBase)
   │
   ├── goToPageWithLang / goToPageWithUser (utils.ts)  ← reads auth_*.json (never writes)
   ├── hideAllModalsAndPopups (utils.ts)
   ├── t() timeout wrapper (globals.ts)
   └── constants.ts (MODULE_URLS, MODULE_SELECTORS, EXTERNAL_URLS, ...)
```

Key infrastructure files:

- [global-setup.ts](global-setup.ts) — runs once before any worker; logs each unique account in exactly once and writes one read-only `auth_*.json` per profile (§4)
- [globals.ts](globals.ts) — `LANGUAGES`, `SOURCE_LANGUAGES`, `BROWSER_SETTINGS`, `TIMEOUT_MULTIPLIER`, `t()`, `testUser`, `testAdminUser`, `testLAUser`
- [utils.ts](utils.ts) — `goToPageWithLang`, `goToPageWithUser`, `installOverlaySuppression`, `hideAllModalsAndPopups`, `changeLanguage`, `fixCookieDomainsForCrossSubdomain`, MDL helpers, geo-location
- [constants.ts](constants.ts) — `MODULE_URLS`, selectors, `EXTERNAL_URLS`, `SEARCH_DROPDOWN`, `VALID_TOPICS`, `SITE_CONFIGS`
- [pages/pageManager.ts](pages/pageManager.ts) — mounts all page objects
- [pages/helperBase.ts](pages/helperBase.ts) — base class (`page`, `language`)

---

## 4. Entry points — which to use

| Scenario | Use |
| --- | --- |
| Anonymous user, EN UI | `goToPageWithLang(context, url, LANGUAGES.EN)` |
| Anonymous user, HE UI | `goToPageWithLang(context, url, LANGUAGES.HE)` |
| Logged-in primary user, EN | `goToPageWithUser(context, url, BROWSER_SETTINGS.enUser)` |
| Logged-in primary user, HE | `goToPageWithUser(context, url, BROWSER_SETTINGS.heUser)` |
| Logged-in admin, EN | `goToPageWithUser(context, url, BROWSER_SETTINGS.enAdmin)` |
| Logged-in admin, HE | `goToPageWithUser(context, url, BROWSER_SETTINGS.heAdmin)` |
| LA-whitelisted user, EN (for `<lc-chatbot>` tests) | `goToPageWithUser(context, url, BROWSER_SETTINGS.enLAUser)` — see [assistant/README.md](assistant/README.md) |
| LA-whitelisted user, HE (Hebrew `<lc-chatbot>`) | `goToPageWithUser(context, MODULE_URLS.HE.LIBRARY, BROWSER_SETTINGS.heLAUser)` — dedicated Hebrew-preference account logged in natively on `.org.il`; see [assistant/README.md](assistant/README.md) §12 |

**How auth works (read this once):** [global-setup.ts](global-setup.ts) runs **before any worker starts**, logs each unique account in exactly once, and writes one read-only `auth_*.json` file per profile. Workers (each a separate Node process) only ever **read** those files. No per-test login, no file-write race at full parallelism. For the standard user and admin, the EN/HE variants are stamped from a single captured login (one login per account keeps setup fast), differing only by the `interfaceLang` cookie — Hebrew runs *anonymously* on the `.org.il` domain, since the `.org` session cookie isn't sent cross-TLD. The Hebrew Library Assistant is the exception: it needs a logged-in session **on** the Hebrew domain, so it uses a separate Hebrew-preference account logged in directly on `.org.il` (see `heLAUser` in §10).

> ⚠️ **`BROWSER_SETTINGS.english` / `.hebrew` no longer exist** (removed in the auth refactor). Anonymous tests must call `goToPageWithLang(context, url, LANGUAGES.EN | LANGUAGES.HE)`; logged-in tests must use `enUser` / `heUser` / `enAdmin` / `heAdmin` / `enLAUser`.

**Known limitation:** `goToPageWithLang` and `goToPageWithUser` cannot be combined in one call. Use the user helper first, then call `changeLanguage(page, lang)` if needed — though in practice you should never need this, since `enUser`/`heUser` already bake the interface language into storage state.

---

## 5. Canonical page-object style

**Reference implementation:** [pages/moduleHeaderPage.ts](pages/moduleHeaderPage.ts), [pages/moduleSidebarPage.ts](pages/moduleSidebarPage.ts).

Rules:

- Extends `HelperBase` — inherits `page`, `language`.
- Constructor: `constructor(page: Page, language: string) { super(page, language); }`.
- Locators: use **private `get` accessors** for reusable element lookups. Don't expose raw locators on the class surface.
- Public methods are async actions returning `void` or relevant data (new page, strings, etc.).
- Import `t` from globals and wrap every explicit timeout.
- Import `hideAllModalsAndPopups` and call it defensively before header interactions when overlays may appear.

**Skeleton:**

```ts
import { expect, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { t } from '../globals';
import { MODULE_SELECTORS } from '../constants';

export class SomeFeaturePage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  private get container() {
    return this.page.getByRole('region', { name: /feature/i });
  }

  async doTheThing() {
    await hideAllModalsAndPopups(this.page);
    const button = this.container.getByRole('button', { name: /submit/i });
    await expect(button).toBeVisible({ timeout: t(5000) });
    await button.click();
  }
}
```

**Then register in [pages/pageManager.ts](pages/pageManager.ts):** import, add private field, instantiate in constructor, add `onSomeFeaturePage()` accessor.

---

## 6. Canonical spec structure

**Reference implementation:** [library/header.spec.ts](library/header.spec.ts).

```ts
import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

test.describe('Feature X — English', () => {
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

- Filename: `kebab-case.spec.ts`.
- `test.describe` string: `'<Module> <Feature> — <Language>'` when the suite is language-scoped.
- Test ID prefix when applicable: `MOD-H###` (header), `MOD-S###` (sidebar), `Sanity N` (sanity suite).
- Use `test.beforeEach` to re-create the `page`/`pm` per test. Don't share state unless you deliberately opt into `test.describe.configure({ mode: 'serial' })`.

---

## 7. Where tests live — folder decision table

| Feature under test | Folder | Project names | baseURL |
| --- | --- | --- | --- |
| Library-module UI (header, sidebar, reader) | `library/` | `chrome-library`, `firefox-library`, `safari-library` | `www.<sandbox>` |
| Voices-module UI (chiburim sheets, trending, ...) | `voices/` | `chrome-voices`, `firefox-voices`, `safari-voices` | `voices.<sandbox>` |
| Library Assistant chatbot (`<lc-chatbot>`) | `assistant/` | `chrome-assistant` | `www.<sandbox>` |
| Resource Panel (`ConnectionsPanel`, RP-NNN) | `Full testing by Feature/Resource Panel/` | `chrome/firefox/safari-resource-panel` | `www.<sandbox>` |
| Voices Topics (`/topics/<slug>` + `/topics` landing, TOV-NNN) | `Full testing by Feature/Voices Topics/` | `chrome/firefox/safari-voices-topics` | `voices.<sandbox>` |
| Library Topics (`/topics/<slug>` + `/topics` landing, LIB-NNN) | `Full testing by Feature/Library Topics/` | `chrome/firefox/safari-library-topics` | `www.<sandbox>` |
| Voices Bookmarks & History (sheet-page bookmark + `/saved`, VBM-NNN) | `Full testing by Feature/Voices Bookmarks (Saved) and History/` | `chrome/firefox/safari-voices-bookmarks` | `voices.<sandbox>` |
| Mobile-viewport / responsive UI (hamburger drawer, mobile auth flow) | `mobile web/` *(separate config — `playwright.mobileweb.config.ts`)* | `chrome-mobile-library` (Pixel 5), `safari-mobile-library` (iPhone 13) | `www.<sandbox>` |
| End-to-end smoke / release gate | `Sanity/` (+ any `@sanity`-tagged test, anywhere) | `chrome-sanity`, `firefox-sanity`, `safari-sanity` | `www.<sandbox>` |
| Cross-cutting or unplaceable (help redirects, etc.) | `Misc/` | `chrome-misc`, `firefox-misc`, `safari-misc` | `www.<sandbox>` |

> The `*-sanity` projects are **tag-scoped**, not folder-scoped (`testDir: './e2e-tests'` + `grep: /@sanity/`): they run every test tagged `{ tag: '@sanity' }` regardless of folder. To add a release-gate test that lives elsewhere to the sanity run, tag it in place — don't copy it into `Sanity/`. See [Sanity/README.md](Sanity/README.md) §3.

Rule of thumb:

- Is the behavior specific to one module's UI? → `library/` or `voices/`.
- Is it the embedded LA chatbot (including negative-visibility tests anywhere in the app)? → `assistant/`.
- Is it a deep CSV-driven feature suite (Resource Panel RP-NNN, Voices Topics TOV-NNN)? → its own `Full testing by Feature/<feature>/` folder with its own Playwright project.
- Does it only exist below the 843 px mobile breakpoint (hamburger drawer, mobile-only menus, mobile auth flow)? → `mobile web/` (and runs under `--config=playwright.mobileweb.config.ts`).
- Does it traverse both modules (login on A, verify on B)? → `Sanity/`.
- Does it validate platform-level invariants (redirects, static routes)? → `Misc/`.

---

## 8. Constants catalogue — when to reach for `constants.ts`

From [constants.ts](constants.ts), key exports and when to use each:

| Export | Use when |
| --- | --- |
| `MODULE_URLS.EN.LIBRARY` / `.VOICES`, `MODULE_URLS.HE.LIBRARY` / `.VOICES` | You need a base URL for a module + language. |
| `MODULE_SELECTORS` | Interacting with module header (logo, icons, dropdowns). |
| `READER_SELECTORS` | Asserting on reader-page DOM structure. |
| `SHEET_EDITOR_SELECTORS`, `SaveStates` | Sheet editor flows (publish/save/unpublish lifecycle). |
| `SIDEBAR_SELECTORS` | Navigating the sticky nav sidebar / its modules. |
| `TOPIC_SELECTORS` | Topic pages, trending, autocomplete. |
| `EXTERNAL_URLS.DONATE` / `.HELP` / `.DEVELOPERS` | Asserting links open external destinations. |
| `SEARCH_DROPDOWN.*` | Search autocomplete sections, icons, test terms per module. |
| `VALID_TOPICS` | Voices trending topic workflows — pick a known-valid slug. |
| `SITE_CONFIGS.LIBRARY` / `.VOICES` | Tab order, main nav links per module (used in `a11y` / header tests). |
| `MODULE_SWITCHER`, `MODULE_TEXTS` | Cross-module switcher menu validation. |

**If you find yourself defining a string/regex that feels like it belongs site-wide — add it to `constants.ts` instead of inlining.**

---

## 9. Language handling

**Interface language constants** (from [globals.ts](globals.ts)):

```ts
LANGUAGES.EN   // 'english'
LANGUAGES.HE   // 'hebrew'
```

**Source-text language regex constants** (for source-text pages):

```ts
SOURCE_LANGUAGES.EN   // /^(תרגום|Translation)$/
SOURCE_LANGUAGES.HE   // /^(מקור|Source)$/
SOURCE_LANGUAGES.BI   // /^(מקור ותרגום|Source with Translation)$/
```

**Mid-test switching:** use `changeLanguage(page, LANGUAGES.HE)` from utils — falls back to cookie-based switching if the UI dropdown is flaky.

**Multi-language test pattern** (re-emitted per language):

```ts
const configs = [
  { label: 'English', lang: LANGUAGES.EN },
  { label: 'Hebrew',  lang: LANGUAGES.HE },
];

for (const { label, lang } of configs) {
  test.describe(`Feature X — ${label}`, () => {
    test.beforeEach(async ({ context }) => {
      page = await goToPageWithLang(context, MODULE_URLS[lang === LANGUAGES.HE ? 'HE' : 'EN'].LIBRARY, lang);
      pm = new PageManager(page, lang);
      await hideAllModalsAndPopups(page);
    });
    // tests...
  });
}
```

---

## 10. Auth state system

**Pre-seeded storage states** keyed by `BROWSER_SETTINGS.<name>` (six profiles — see §4):

- `enUser`, `heUser` — standard test user (`testUser`)
- `enAdmin`, `heAdmin` — admin / superuser (`testAdminUser`); also the de-facto destructive-auth throwaway (see rule §2.21)
- `enLAUser` — Library Assistant whitelisted user (`testLAUser`), English. Only LA-whitelisted accounts see the `<lc-chatbot>` element. Do **not** reuse `enUser` for LA tests — the element won't mount and `waitForReady()` will time out.
- `heLAUser` — **separate** LA-whitelisted account whose account Site-Language is **Hebrew** (creds `PLAYWRIGHT_LA_USER_HE_*`, `testHeLAUser`). Hebrew runs on the `.org.il` domain, and a logged-in user is server-side-routed to their account-language's domain — so this must be its own Hebrew-preference account (not the English `enLAUser`/`testLAUser`). [global-setup.ts](global-setup.ts) logs it in **natively on `.org.il`** (`site: 'IL'`), so `goToPageWithUser(MODULE_URLS.HE.LIBRARY, heLAUser)` lands logged-in in Hebrew with no special machinery. The Hebrew LA suite runs fully parallel. See [assistant/README.md](assistant/README.md) §12.

> The pre-refactor `BROWSER_SETTINGS.english` / `.hebrew` profiles **no longer exist**. Anonymous tests use `goToPageWithLang(...)`; logged-in tests use the six profiles above.

**How it works** (the current global-setup model — see §4 for the full version):

1. **Before any worker starts**, [global-setup.ts](global-setup.ts) wipes every `auth_*.json` from the previous run, logs each *unique* account in exactly once, and writes one **read-only** file per profile: `auth_english_user.json`, `auth_hebrew_user.json`, `auth_english_admin.json`, `auth_hebrew_admin.json`, `auth_english_la_user.json`, `auth_hebrew_la_user.json`. The English accounts log in on the English (`.org`) domain; the Hebrew LA account logs in natively on the Hebrew (`.org.il`) domain (`site: 'IL'`).
2. **Each worker** (a separate Node process) only ever **reads** those files via `goToPageWithUser` — no per-test login, no file-write race at full parallelism.
3. For the standard user/admin, the EN/HE variants are **stamped from one captured login** (one login per account), differing only in the `interfaceLang` cookie. (The Hebrew LA account is logged in separately on the `.org.il` domain — see §10.)
4. Cross-subdomain cookies are fixed up via `fixCookieDomainsForCrossSubdomain` so a login on `www.*` also authenticates `voices.*`.

**Credentials** come from `PLAYWRIGHT_USER_EMAIL` / `PLAYWRIGHT_USER_PASSWORD` / `PLAYWRIGHT_SUPERUSER_EMAIL` / `PLAYWRIGHT_SUPERUSER_PASSWORD` / `PLAYWRIGHT_LA_USER_EMAIL` / `PLAYWRIGHT_LA_USER_PASSWORD` env vars.

**Do not** manually delete `auth_*.json` files — global-setup wipes and rewrites them at the start of every run.

---

## 11. Timeouts

- Global test timeout: `t(50000)` (50s × multiplier) — from [playwright.config.ts](../playwright.config.ts).
- Global expect timeout: `t(10000)` (10s × multiplier).
- `TIMEOUT_MULTIPLIER` env var scales everything — range `0.1–3.0`, default `1.0`. Bump to 2 or 3 for slow CI / debugging.

**Always wrap:**

```ts
// ✅ Correct
await expect(el).toBeVisible({ timeout: t(15000) });
test.setTimeout(t(120000));

// ❌ Wrong — ignores multiplier
await expect(el).toBeVisible({ timeout: 15000 });
```

**For polling conditions**, prefer `await expect(locator).toPass({ timeout: t(...) })` over manual polling loops.

---

## 12. Worked example — adding a new test

**Task:** Add a test that verifies the Library sidebar footer's "Help" link opens the Zendesk help center in a new tab.

**Step 1 — decide folder.** This is Library-module-specific UI → `e2e-tests/library/`.

**Step 2 — decide filename.** `sidebar-help-link.spec.ts` (kebab-case, descriptive).

**Step 3 — check existing page objects.** `pm.onModuleSidebar()` from [pages/moduleSidebarPage.ts](pages/moduleSidebarPage.ts) already exposes `clickAndVerifyLink(spec: FooterLinkSpec)`. No new page-object method needed.

**Step 4 — check constants.** [constants.ts](constants.ts) already has `EXTERNAL_URLS.HELP` as a regex matching the Zendesk URL shape. Use it.

**Step 5 — write the spec.**

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

**Step 6 — run it.**

```bash
npx playwright test library/sidebar-help-link.spec.ts --project=chrome-library
```

**Step 7 — if red:** check, in order:
1. Did a modal appear? → `await hideAllModalsAndPopups(page)` before the action.
2. Wrong URL regex? → `console.log(newPage.url())` and refine `EXTERNAL_URLS.HELP` if needed (edit constants, not the test).
3. Slow environment? → bump `TIMEOUT_MULTIPLIER=2` in `.env`.
4. Locator changed? → update the page object, not the test.

---

## 13. Audit-a-test checklist

When reviewing an existing spec or page object, flag each of:

- [ ] **PageManager used?** Specs should call `pm.onX()`, not raw `page.locator()`.
- [ ] **Timeouts wrapped with `t()`?** Any bare `5000`, `10000`, `timeout: 2000` is a bug.
- [ ] **`hideAllModalsAndPopups` after navigation?** Missing calls cause "element intercepts pointer events" flakes.
- [ ] **Entry-point helper used?** First navigation should be `goToPageWithLang` or `goToPageWithUser`, not `page.goto`.
- [ ] **Locators role-based?** `getByRole` / `getByLabel` / `getByText` preferred. Brittle CSS in spec files = red flag.
- [ ] **`page.waitForTimeout`?** If unwrapped or used to wait for state, flag. Replace with assertion.
- [ ] **Magic strings / URLs?** Should be in `constants.ts`.
- [ ] **Page object extends `HelperBase`?** If not, flag unless it's on the legacy list (§15).
- [ ] **Test isolation?** Unless explicitly `serial`, each test should work independently (fresh `beforeEach`).
- [ ] **Credentials hardcoded?** Must come via `testUser` / `testAdminUser` / `testLAUser` / `BROWSER_SETTINGS`.
- [ ] **Console logs left in?** `console.log` in spec/page code should be removed before merge (a few exist in [pages/moduleHeaderPage.ts](pages/moduleHeaderPage.ts) — see §15).
- [ ] **For LA (chatbot) tests — using `BROWSER_SETTINGS.enLAUser`?** Other accounts won't see `<lc-chatbot>`; `waitForReady()` will time out.
- [ ] **For LA send tests — `test.setTimeout(t(90000))`?** Backend round-trip is ~10–20s; the default 50s global timeout is too tight once auth + navigation are included.
- [ ] **Mode anchor vs. data-loaded?** If the test asserts on per-item content, it must wait for a *specific child*, not just the outer container. A passing-on-empty test is a flake waiting to happen.
- [ ] **`test.skip` / `test.fixme` justified?** Skips for missing production data are a smell — verify via API (§2A) and adapt the test, or convert to a structural assertion with the verification trail in a comment.
- [ ] **Bilingual-safe locators?** If the spec runs (or could run) in Hebrew UI, anchor on `data-*` attributes or stable English props, not visible-text matches.
- [ ] **Research specs deleted?** `__research__*.spec.ts` files must not be committed.
- [ ] **Correct `BROWSER_SETTINGS` profile?** `english` / `hebrew` are anonymous (`user: null`); use `enUser` / `heUser` / `enAdmin` / `heAdmin` / `enLAUser` for any test requiring login (§4).
- [ ] **FA-icon clicks?** Any click on an `<i class="fa-*">` must use `click({ force: true })` after `scrollIntoViewIfNeeded`.
- [ ] **Dialog handlers registered before the triggering click?** `page.once('dialog', d => d.accept())` must run *before* the action that opens a `confirm()` / `alert()` / `prompt()`.
- [ ] **Destructive APIs intercepted?** Any test that creates / edits / deletes user-visible state via `/api/...` should route-intercept the endpoint so production stays clean.
- [ ] **Destructive auth?** If the test calls UI logout, UI re-login of a globalSetup profile, or password-change endpoints, does it use a profile no other concurrent test reads (currently `enAdmin` is the only safe choice — Sanity 7 already destroys it every run), OR intercept the destructive endpoint via `page.route`? See rule §2.21.
- [ ] **`+`-decoding for jQuery payloads?** When asserting on intercepted request bodies, normalize with `.replace(/\+/g, ' ')` before substring matching, or assert on the raw urlencoded form.
- [ ] **Resilient to full parallelism?** Auth-related flakes are now structurally impossible: [global-setup.ts](global-setup.ts) writes each `auth_*.json` exactly once before any worker starts, and `goToPageWithUser` reads (never writes) those files. If a test flakes only at full parallelism, the cause is in the test itself — longer timeouts on async fetches, atomic `page.evaluate` instead of sequential `isVisible`s, redirect-tolerant URL matching, or `test.slow()` on a known-heavy describe. Not capping workers globally. (The mobile config is the one exception — see §20 note about staging throttling.)

---

## 14. Running tests

```bash
# All projects
npx playwright test

# One project
npx playwright test --project=chrome-library
npx playwright test --project=chrome-assistant         # Library Assistant suite
npx playwright test --project=chrome-resource-panel    # Resource Panel suite
npx playwright test --project=chrome-voices-topics     # Voices Topics suite
npx playwright test --project=chrome-library-topics    # Library Topics suite
npx playwright test --project=chrome-bookmarks-(saved)-and-history  # Voices Bookmarks & History suite

# Sanity = TAG-scoped: runs every test tagged `{ tag: '@sanity' }` anywhere in
# the tree, not just the Sanity/ folder (testDir './e2e-tests' + grep /@sanity/).
# Add a release-gate test to this run by tagging it in place — never copy it
# into Sanity/. See Sanity/README.md §3.
npx playwright test --project=chrome-sanity            # @sanity-tagged release-gate suite

# Mobile suite (separate config — runs under width < 843 px viewport)
npx playwright test --config=playwright.mobileweb.config.ts
npx playwright test --config=playwright.mobileweb.config.ts --project=chrome-mobile-library

# One file
npx playwright test library/header.spec.ts

# One test by name
npx playwright test -g 'MOD-H002'
npx playwright test -g 'UX-003'        # LA behavioral (matches EN + HE)
npx playwright test -g 'LA-NEG-001'    # LA visibility boundary

# LA by language (English + Hebrew specs both live under chrome-assistant)
npx playwright test --project=chrome-assistant library-assistant.spec.ts          # English LA
npx playwright test --project=chrome-assistant library-assistant-hebrew.spec.ts    # Hebrew LA

# Interactive UI
npx playwright test --ui

# Debug / step-through
npx playwright test --debug library/header.spec.ts

# Slow machine
TIMEOUT_MULTIPLIER=2 npx playwright test

# HTML + JUnit reports
GENERATE_REPORTS=1 npx playwright test
# → reports in e2e-tests/e2e-test-logs/html-report/ and /junit-results.xml
```

Traces, screenshots, and videos are retained on failure/retry in `e2e-tests/e2e-test-logs/test-results/`.

---

## 15. Legacy patterns — do not copy

These files are **functional and in use** — do NOT refactor them as part of unrelated work. Do NOT model new code on them.

| File | Issue | What to do instead |
| --- | --- | --- |
| [pages/banner.ts](pages/banner.ts) | Does not extend `HelperBase` | New page objects extend `HelperBase` per §5 |
| [pages/sheetEditorPage.ts](pages/sheetEditorPage.ts) | Uses `locator = () => page.locator(...)` arrow-function fields | Use private `get` accessors per §5 |
| [pages/accountSettingsPage.ts](pages/accountSettingsPage.ts), [pages/profilePage.ts](pages/profilePage.ts), [pages/editProfilePage.ts](pages/editProfilePage.ts) | Public `get foo()` getter pattern — acceptable but not canonical | Prefer private `get` (not public) per §5 |
| [library/texts-tree-traversal.spec.ts](library/texts-tree-traversal.spec.ts) | Bypasses `PageManager` entirely; raw `page.getByRole()` throughout | All new specs go through `pm.onX()` per §6 |
| [pages/moduleHeaderPage.ts](pages/moduleHeaderPage.ts) — leaks selector strings to callers; two commented-out `console.log` remnants (lines 168, 172) | Not canonical; carries dead code | Model new POMs on `resourcePanelPage.ts` / `voicesTopicPage.ts`; don't add new `console.log` in page objects |

---

## 16. Cleanup candidates — document only, do NOT delete

Per user instruction, these are captured for future cleanup but must **not** be deleted in this pass.

### C1. `chrome-all` / `firefox-all` / `safari-all` projects in [playwright.config.ts](../playwright.config.ts) — *resolved*

- **What:** Three Playwright projects pointed at `testDir: './e2e-tests/tests'` (a directory that never existed), so they ran zero tests.
- **Status:** **Removed** from [playwright.config.ts](../playwright.config.ts). No longer present.

### C2. [pages/sourceSheetEditor.page.ts](pages/sourceSheetEditor.page.ts)

- **What:** ~362-line page object.
- **Problem:** Not registered in [pages/pageManager.ts](pages/pageManager.ts), not imported by any spec, duplicates much of [pages/sheetEditorPage.ts](pages/sheetEditorPage.ts).
- **Recommended cleanup:** Delete the file.

### C3. [fixtures.ts](fixtures.ts)

- **What:** Empty file (1 line).
- **Problem:** No imports reference it. Misleading name suggests Playwright `test.extend()` fixtures are used here, but they are not.
- **Recommended cleanup:** Delete the file, or populate with actual `test.extend()` custom fixtures if/when adopted (see §18).

### C4. Stale README sections — *handled by current rewrite*

- `e2e-tests/README.md` previously referenced deleted spec files (`reader.spec.ts`, `search.spec.ts`, `topics.spec.ts`, `sheets.spec.ts`) and an incorrect "Global Timeout: 200 seconds" figure.
- **Status:** Fixed in the 2026-04-14 rewrite.

### C5. Stale README.md section — *handled by current fix*

- [Sanity/README.md](Sanity/README.md) previously referenced a `Sanity/Go Live Temp/` subdirectory that does not exist; the files (`cross-module-redirects.spec.ts`, `help-sheet-redirects.spec.ts`) live directly in `Sanity/` and `Misc/`.
- **Status:** Fixed in the 2026-04-14 edit.

---

## 17. Library Assistant (embedded web-component) testing

The LA chatbot (`<lc-chatbot>`) is a Svelte custom element with an **open shadow root** embedded on the Library module. Full guide lives in [assistant/README.md](assistant/README.md); this section is the rules-of-engagement summary for a new agent.

**Setup:**

1. Entry: always `goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enLAUser)`. The QA account is whitelisted server-side; standard accounts do not see the element.
2. Page object: [pages/libraryAssistantPage.ts](pages/libraryAssistantPage.ts), accessed via `pm.onLibraryAssistant()`.
3. Always call `pm.onLibraryAssistant().waitForReady()` in `beforeEach` — asserts `<lc-chatbot>` mounted.

**Locators:**

- Playwright's `getByRole`, `getByLabel`, `getByText`, and default CSS all pierce the open shadow root. No special syntax.
- **Labels are language-specific** (the component is i18n'd) — never hardcode them in a test; go through the page object, which resolves them from `LA_LABELS[this.language]`. The live-verified English/Hebrew strings are tabulated in [assistant/README.md](assistant/README.md) §11 (e.g. EN `Close` / `Send` / `Dock Assistant`; HE `סגירה` / `שליחה` / `הצמדת עוזר הספרייה`). The old pre-i18n labels (`Close assistant`, `Send message`, `Dock assistant to side`, …) are gone from prod.
- Do not reach for `page.evaluate(host.shadowRoot.querySelector(...))` unless role/label/CSS truly can't reach the element.

**Quirks that bite tests if you don't know them:**

- Our QA user has `default-open="true"` on the host — the panel auto-opens on fresh contexts. Tests that need the panel *closed* must call `ensureClosed()` first.
- Svelte bindings require **real input events**. `page.fill()` / `page.type()` work. Programmatic `element.value = 'x'` inside `page.evaluate` does NOT flip the send button to enabled.
- Send round-trip hits the real `chat.sefaria.org` backend (~10–20s). Send-oriented tests must bump timeout via `test.setTimeout(t(90000))`.
- Storage state captured by `goToPageWithUser` may include chat localStorage from the first login. Use `.last()` on `.message.user` / `.message.assistant` rather than strict counts.
- The LA is **absent** on `voices.*` and for logged-out users — that's intentional behavior, covered by `LA-NEG-*` tests in [assistant/library-assistant.spec.ts](assistant/library-assistant.spec.ts).

**Bilingual:** The LA is now bilingual (English on `www.*`, Hebrew on `www.*.il`). The deployed component runs a `svelte-i18n` build, so labels are language-specific — the page object is parameterized (`LA_LABELS[this.language]` in [pages/libraryAssistantPage.ts](pages/libraryAssistantPage.ts)) with strings **verified against the live component** in both languages. Hebrew coverage mirrors the English suite in [assistant/library-assistant-hebrew.spec.ts](assistant/library-assistant-hebrew.spec.ts). Testing the Hebrew LA requires a logged-in session on the `.org.il` domain, which is why it uses a dedicated Hebrew-preference account logged in natively there (`heLAUser`, §10) — documented fully in [assistant/README.md](assistant/README.md) §12.

**Organization:**

- Single file [assistant/library-assistant.spec.ts](assistant/library-assistant.spec.ts) with `test.describe` per feature area. Split to a new file only when one area passes ~5 tests.
- Test IDs: `UX-NNN` for behavioral tests; `LA-NEG-NNN` / `LA-A11Y-NNN` / `LA-<AREA>-NNN` for emergent visibility / a11y / area tests.
- When you add a test, give it the next ID in its series and a short, descriptive title; the spec file is the source of truth for coverage.

**Backlog of tests still worth adding:** see [assistant/README.md](assistant/README.md) §10.

---

## 18. Future direction (informational, not required)

Playwright 2024/2025 guidance (via official docs) recommends `test.extend()` custom fixtures over shared class instances for POM. See: https://playwright.dev/docs/test-fixtures.

A hypothetical fixture-based version of our PageManager would look like:

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

Tests would then declare `async ({ page, pm }) => { ... }` directly. Also recommended: a `setup` project with `dependencies: ['setup']` wiring auth via `storageState` instead of the current hand-rolled `BROWSER_SETTINGS` system.

**This is a future migration target. Do not convert existing tests as part of unrelated PRs.**

---

## 19. Quick reference

| Need | File |
| --- | --- |
| Run commands, env setup, prereqs | [README.md](README.md) |
| Sanity suite test inventory | [Sanity/README.md](Sanity/README.md) |
| Library Assistant deep-dive guide (incl. coverage + backlog) | [assistant/README.md](assistant/README.md) |
| Resource Panel deep-dive guide | [Full testing by Feature/Resource Panel/README.md](Full%20testing%20by%20Feature/Resource%20Panel/README.md) |
| Voices Topics deep-dive guide | [Full testing by Feature/Voices Topics/README.md](Full%20testing%20by%20Feature/Voices%20Topics/README.md) |
| Library Topics deep-dive guide | [Full testing by Feature/Library Topics/README.md](Full%20testing%20by%20Feature/Library%20Topics/README.md) |
| Voices Bookmarks & History deep-dive guide | [Full testing by Feature/Voices Bookmarks (Saved) and History/README.md](Full%20testing%20by%20Feature/Voices%20Bookmarks%20History/README.md) |
| Canonical POM example | [pages/resourcePanelPage.ts](pages/resourcePanelPage.ts), [pages/voicesTopicPage.ts](pages/voicesTopicPage.ts) |
| Canonical spec example | [library/header.spec.ts](library/header.spec.ts) (minimal), [Full testing by Feature/Resource Panel/opening-and-general.spec.ts](Full%20testing%20by%20Feature/Resource%20Panel/opening-and-general.spec.ts) (POM-pure) |
| Shadow-DOM / web-component POM example | [pages/libraryAssistantPage.ts](pages/libraryAssistantPage.ts) |
| Shadow-DOM / web-component spec example | [assistant/library-assistant.spec.ts](assistant/library-assistant.spec.ts) |
| Core constants | [constants.ts](constants.ts), [globals.ts](globals.ts) |
| Core utilities | [utils.ts](utils.ts) |
| Playwright config (desktop) | [../playwright.config.ts](../playwright.config.ts) |
| Playwright config (mobile) | [../playwright.mobileweb.config.ts](../playwright.mobileweb.config.ts) |
| Mobile-viewport deep-dive guide | [mobile web/README.md](mobile%20web/README.md) |
| Mobile POM | [pages/mobileHamburgerPage.ts](pages/mobileHamburgerPage.ts) |
| Mobile spec examples | [mobile web/hamburger-menu.spec.ts](mobile%20web/hamburger-menu.spec.ts), [mobile web/auth-flow.spec.ts](mobile%20web/auth-flow.spec.ts) |

---

## 20. Mobile-viewport tests

Sefaria's mobile chrome (`<MobileNavMenu>` in `static/js/Header.jsx`) only mounts when `window.innerWidth < 843px` (see `static/css/breakpoints.css` `--bp-tablet-min`). The desktop projects in [../playwright.config.ts](../playwright.config.ts) all use `Desktop *` device descriptors — none reach the mobile breakpoint — so the mobile drawer is invisible to them.

**Rules of engagement:**

1. **Use the mobile config.** Tests under `mobile web/` are driven by [../playwright.mobileweb.config.ts](../playwright.mobileweb.config.ts), which defines two projects:
   - `chrome-mobile-library` — Pixel 5 (393 × 851)
   - `safari-mobile-library` — iPhone 13 (390 × 844)

   Both sit comfortably below 843 px. Do **not** add mobile tests to the desktop projects, and do **not** add desktop tests to the mobile config.
2. **POM:** [pages/mobileHamburgerPage.ts](pages/mobileHamburgerPage.ts), registered as `pm.onMobileHamburger()`. Owns the hamburger drawer; for the login form itself, reuse `pm.onLoginPage().loginAs(testUser)`.
3. **Tap, don't click.** Mobile emulation expects `.tap()` instead of `.click()`. Mixing the two on a popup link can race with the popup-event handler.
4. **Cross-module links open popups.** `ReaderApp.openURL` (ReaderApp.jsx:1264) calls `window.open(url, '_blank')` whenever `data-target-module` differs from the active module. "Voices on Sefaria", "Sefaria Library", "Developers on Sefaria", "Donate", and "Get Help" all spawn a popup tab — wait via `context.waitForEvent('page')` and assert on the popup, not the original page.
5. **Staging cookies banner.** The "OK" confirm on `sefariastaging.org`'s cookies banner is a `<div role="button">`, not a `<button>`, so `hideAllModalsAndPopups` misses it. The mobile POM's `waitForHeaderReady()` clicks `.cookiesNotification [role="button"]` explicitly and force-hides the wrapper.
6. **WebKit cookie removal lags.** After tapping Logout on the iPhone-13 emulation, `context().cookies()` can still hold the cleared `sessionid` for a few hundred ms past `domcontentloaded`. Use `expect.poll` (15 s) on the cookie check, not a synchronous read.
7. **Worker cap.** The mobile config caps non-CI workers at **2** with **1 retry** — staging throttles under 5+ concurrent mobile workers and starts returning 5xx on `/login`. Do not raise the worker count without confirming the sandbox can handle it.
8. **Test IDs:** `HAM-S###` (structure), `HAM-Q###` (search), `HAM-N###` (in-module nav), `HAM-X###` (external-tab links), `HAM-M###` (cross-module nav), `HAM-A###` (auth flow). Pick the closest existing prefix when extending; create a new one only for a new test area.

Full mobile-specific guide and the source-driven discoveries (A/א toggle is two SVGs; search categories read from item `alt`; etc.) live in [mobile web/README.md](mobile%20web/README.md).
