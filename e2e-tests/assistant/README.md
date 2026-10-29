# Library Assistant — E2E Test Guide

> Practical reference for writing Playwright tests against the Sefaria Library Assistant (LA) chatbot. Last verified 2026-06-03 against branch `mdl-playwright`.
>
> **The LA is now bilingual.** English runs on `www.sefaria.org`; Hebrew on `www.sefaria.org.il`. English coverage lives in [library-assistant.spec.ts](library-assistant.spec.ts); the mirrored Hebrew suite in [library-assistant-hebrew.spec.ts](library-assistant-hebrew.spec.ts). The deployed component runs a `svelte-i18n` build, so every label is language-specific — see §11 for the verified label reference and §12 for the Hebrew-session mechanics (cross-TLD session + account-language routing).

---

## 1. What the LA is

The Library Assistant is a Svelte-based custom element `<lc-chatbot>` embedded on `www.sefaria.org`. It talks to the backend at `https://chat.sefaria.org/api`. The implemented tests live in [library-assistant.spec.ts](library-assistant.spec.ts) — the source of truth for what's covered. Tests still worth adding are noted in §10.

Key facts that shape how we test it:

- The host element mounts an **open Shadow DOM**. Playwright's default engine pierces open shadow roots for `getByRole`, `getByLabel`, `getByText`, and CSS locators — no special `>>>`, `::shadow`, or `evaluate(querySelector...)` gymnastics needed.
- The component is **user-gated**. Non-whitelisted users do not see the element at all. For our automation user, the host renders with `default-open="true"`, so the panel auto-opens on a fresh context.
- Send round-trip against prod is **~10–20 seconds** per message. Tests that actually send a prompt hit real infra and must lift their `test.setTimeout`.

---

## 2. The whitelisted QA users (one per language)

There are **two** whitelisted LA accounts — one per interface language — because a logged-in user is routed to the domain of their account's Site-Language (full explanation in §12):

| | English | Hebrew |
| --- | --- | --- |
| `.env` creds | `PLAYWRIGHT_LA_USER_*` | `PLAYWRIGHT_LA_USER_HE_*` |
| globals | `testLAUser` → `BROWSER_SETTINGS.enLAUser` | `testHeLAUser` → `BROWSER_SETTINGS.heLAUser` |
| Site Language | English | **Hebrew** |
| Logs in on | `www.sefaria.org` | `www.sefaria.org.il` (`site: 'IL'`) |
| Auth file | `auth_english_la_user.json` | `auth_hebrew_la_user.json` |

Always enter through `goToPageWithUser`:

```ts
// English
page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enLAUser);
// Hebrew
page = await goToPageWithUser(context, MODULE_URLS.HE.LIBRARY, BROWSER_SETTINGS.heLAUser);
```

**Do not reuse `BROWSER_SETTINGS.enUser` / `.heUser` / `.enAdmin`.** Those accounts are *not* whitelisted for the LA; the `<lc-chatbot>` element simply won't be in the DOM and tests will fail at `waitForReady()`. Likewise, don't try to drive the Hebrew LA with the English account — see §12 for why that can't work.

---

## 3. How to enter and wait for the LA

Canonical `beforeEach`:

```ts
import { test, expect, Page } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t, BROWSER_SETTINGS } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

let page: Page;
let pm: PageManager;

test.beforeEach(async ({ context }) => {
  page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enLAUser);
  pm = new PageManager(page, LANGUAGES.EN);
  await hideAllModalsAndPopups(page);
  await pm.onLibraryAssistant().waitForReady();   // asserts `<lc-chatbot>` is mounted
});
```

After `waitForReady()` you are free to interact through the page object.

---

## 4. Selector reference

All locators pierce the open shadow root. Use role/label over CSS when possible.

> **Labels are language-specific** (the deployed component is i18n'd). Don't hardcode label strings in tests — go through the page object, which looks them up by translation key (§11). The authoritative, **live-verified** English/Hebrew strings are in §11. The table below lists the *structural* locators (role/CSS) that don't change between languages; the accessible **name** for the role-based ones comes from §11.

| Element | Locator shape | Notes |
| --- | --- | --- |
| Host custom element | `page.locator('lc-chatbot')` | count is 1 when user is whitelisted; `interface-lang` attr is `en` / `he` |
| Panel (dialog) | `getByRole('dialog', { name: <chatWindow> })` | visible when container has `is-open` |
| Floating trigger pill | `getByRole('button', { name: <openAssistant> })` | visible only when panel is closed |
| Close button (X) | `getByRole('button', { name: <close> })` | header |
| Dock / Undock | `getByRole('button', { name: <dock> / <undock> })` | dock visible floating, undock visible docked |
| More options (ellipsis) | `getByRole('button', { name: <moreOptions> })` | opens `role="menu"` dropdown |
| Menu items | `getByRole('menuitem')` | 5 base items, +`Settings` first for staff (see §11) |
| Prompt textarea | `getByLabel(<promptInput>)` | `maxlength="10000"` (the UX-021 test-plan figure of "500 chars" is wrong — the DOM is authoritative) |
| Send button | `getByRole('button', { name: <send> })` | disabled when textarea is empty |
| User message bubble | `page.locator('.message.user')` | use `.last()` for the most recent |
| Assistant message bubble | `page.locator('.message.assistant')` | use `.last()` for the most recent |
| Thinking indicator | `page.locator('.lc-thinking-block')` | visible while request is in-flight; its text rotates through several messages (see §11) |
| Container (mode class) | `page.locator('lc-chatbot .lc-chatbot-container')` | `mode-floating`/`mode-docked` + `is-open`; `interface-hebrew` class in HE |

`<name>` placeholders above are the per-language strings from §11. If you ever need something the role/label approach can't reach, fall back to `page.evaluate(() => document.querySelector('lc-chatbot').shadowRoot.querySelector(...))`. Don't add brittle CSS to the page object for it.

---

## 5. The `LibraryAssistantPage` page object

File: [pages/libraryAssistantPage.ts](../pages/libraryAssistantPage.ts). Registered on the `PageManager` as `pm.onLibraryAssistant()`.

Method map by UX ID:

| UX test | Method(s) |
| --- | --- |
| UX-001 (trigger visible when closed) | `ensureClosed()`, `expectTriggerVisible()` |
| UX-003 (trigger opens panel, focuses input) | `ensureClosed()`, `clickTriggerAndExpectOpen()` |
| UX-004 (close button closes panel) | `ensureOpen()`, `clickCloseAndExpectClosed()` |
| UX-013 (toggle to docked) | `ensureFloating()`, `toggleToDocked()` |
| UX-014 (toggle back to floating) | `ensureFloating()`, `toggleToDocked()`, `toggleToFloating()` |
| UX-022 (send disabled when empty) | `ensureOpen()`, `clearInput()`, `expectSendDisabled()` |
| UX-023 (send enabled when has text) | `ensureOpen()`, `typeMessage()`, `expectSendEnabled()` |
| UX-024 (Enter sends) | `ensureOpen()`, `typeMessage()`, `sendViaEnter()`, `expectUserMessageShown()`, `expectInputCleared()`, `waitForResponse()` |
| UX-026 (send button sends) | `ensureOpen()`, `typeMessage()`, `sendViaButton()`, `expectUserMessageShown()`, `expectInputCleared()`, `waitForResponse()` |
| UX-027 (input disabled, Send replaced by Stop during send) | `ensureOpen()`, `typeMessage()`, `sendViaEnter()`, `expectInputDisabledAndStopShownDuringSend()`, `waitForResponse()` |
| UX-036 (thinking indicator appears then clears) | `ensureOpen()`, `typeMessage()`, `sendViaEnter()`, `expectThinkingVisible()`, `waitForResponse()`, `expectThinkingGone()` |
| UX-057 (header menu opens with expected items) | `openHeaderMenu()`, `expectMenuVisible()`, `expectMenuItemTexts([...])` |
| UX-058 (outside click closes menu) | `openHeaderMenu()`, `clickOutsideMenu()`, `expectMenuHidden()` |
| UX-059 (Escape closes menu) — **`test.fixme`**: component does not yet handle Escape | `openHeaderMenu()`, `closeMenuWithEscape()`, `expectMenuHidden()` |
| UX-060 (Restart conversation clears messages) | `typeMessage()`, `sendViaEnter()`, `waitForResponse()`, `openHeaderMenu()`, `clickRestartConversation()`, `expectEmptyState()`, `expectNoUserMessages()` |
| LA-NEG-001 → 002 (LA absent off its intended surface) | `expectNotPresent()` — on `voices.*` home and a voices sheet |
| LA-LOGGED-OUT-001 → 002 (LA present for logged-out visitors) | `waitForReady()` — on logged-out Library home and reader pages (remote config `feature.chatbot.anonymous_enabled`, on by default) |
| LA-LOGGED-OUT-003 (logged-out visitor gets an answer) | `expectAnswerShown()` — real round trip to the chat server with no user |
| LA-LOGGED-OUT-005 (sign-up options appear once the free answers are used up) | `expectSignupOptionsHidden()` → `seedFreeAnswersUsedUp()` + reload → `expectSignupOptionsShown()`. The options are Sefaria's `SignupOptions` in the widget's `signup-options` slot (light DOM: `lc-chatbot > [slot="signup-options"]`) |
| LA-LOGGED-OUT-006 (Email opens the sign-up form) | `signupOption('email')` → `onLoginPage().expectEmailSignupFormShown()`, `expectNotPresent()`; `recordAnalyticsEvents()` (a stubbed `window.gtag`) saw `auth_flow_started` (`rate_limit_login_button`, `registration`), `auth_method_chosen` (`email`), `auth_process_started`, and the assistant's `assistant_click` (`rate_limit_login_button`) |
| LA-LOGGED-OUT-007 (Apple starts sign-up) | `stubAppleSignIn()` → `signupOption('apple')` → the same three events, method `apple`, and `assistant_click`. Skipped when the sandbox has no Apple client ID |
| LA-LOGGED-OUT-008 (Google's button is in place) | `expectGoogleButtonOverGoogleOption()`: Google's iframe sits inside the Google circle. Its click can't be automated, so a real Google sign-up is checked by hand. Skipped when the sandbox has no Google client ID |
| LA-LOGGED-OUT-009 (no sign-up options when logged in) | `enLAUser` → `expectNoSignupOptions()` |
| LA-LOGGED-OUT-004 (logout clears the saved chat) | `seedSavedChat()` + the `lc_chatbot_clear` cookie a logout sets → reload → `savedChatKeys()` empty and cookie gone |

State helpers (use these liberally at the top of a test to reach a known state):

- `waitForReady()` — assert the host is mounted.
- `isPanelOpen()` — boolean.
- `ensureClosed()` / `ensureOpen()` — idempotent, safe to call regardless of current state.
- `ensureFloating()` — idempotent; also opens the panel if closed.

---

## 6. Writing a new LA test — worked example

**Task:** add a test for UX-025 (Shift+Enter inserts a newline and does NOT send).

**Step 1 — check the page object.** There's no `sendViaShiftEnter` method yet, but the primitives exist (`typeMessage`, a reachable textarea, and user message count). We'll add one small assertion helper and one action.

**Step 2 — add method to [libraryAssistantPage.ts](../pages/libraryAssistantPage.ts):**

```ts
async pressShiftEnter(): Promise<void> {
  await this.textarea.press('Shift+Enter');
}

async expectTextareaContains(substr: string): Promise<void> {
  await expect(this.textarea).toHaveValue(new RegExp(substr), { timeout: t(3000) });
}
```

**Step 3 — add the test to [library-assistant.spec.ts](library-assistant.spec.ts):**

```ts
test('UX-025: Shift+Enter inserts a newline and does not send', async () => {
  await pm.onLibraryAssistant().ensureOpen();
  const before = await pm.onLibraryAssistant().userMessageCount?.() ?? 0;
  await pm.onLibraryAssistant().typeMessage('line1');
  await pm.onLibraryAssistant().pressShiftEnter();
  await pm.onLibraryAssistant().expectTextareaContains('line1\n');
  // assert no new user message was posted
  // (add a helper on the page object if the count comparison recurs)
});
```

**Step 4 — run:**

```bash
npx playwright test --project=chrome-assistant -g 'UX-025'
```

**Step 5 — if red, debug (see §8).**

---

## 7. Gotchas & lessons learned

1. **`default-open="true"` means "closed" is not the default.** Tests that need a closed panel (UX-001, UX-003) must call `ensureClosed()` first. Don't assume a fresh context starts with the panel closed.
2. **Shadow DOM piercing is free** with Playwright's native locators. Do not reach for `page.evaluate(...)` unless role/label/CSS can't get there.
3. **Svelte input binding requires real input events.** `page.fill()` and `page.type()` work. Setting `textarea.value` via `page.evaluate(...)` does *not* flip the send button to enabled.
4. **Send round-trip is long.** Global test timeout is `t(50000)` — any test that actually sends must bump with `test.setTimeout(t(90000))`. The `waitForResponse()` helper expects the textarea to re-enable within that window.
5. **Use `.last()` on message selectors.** `BROWSER_SETTINGS.enLAUser` persists storage state (including any chat localStorage written at login), so historical messages may be present. Latest-match assertions are robust to that.
6. **The written test plan can be wrong — trust the DOM.** UX-021 claims a 500-char limit; the actual `maxlength` on the textarea is 10000. When the plan contradicts the observed DOM, trust the DOM and note it in a comment.
7. **Cross-test isolation works out of the box** because each Playwright worker gets its own `BrowserContext`. Running 10 tests in parallel sends at most 3 real prompts — no rate-limit issues observed.
8. **Only the LA-whitelisted account sees the chatbot.** Standard automation accounts (`qa+automation@sefaria.org`) will not, so reusing `BROWSER_SETTINGS.enUser` / `.heUser` / `.enAdmin` will silently make `waitForReady()` time out. Always go through `enLAUser`.
9. **Trigger is absent, not hidden, when the panel is open.** Expect `toBeHidden()` (which also accepts absent/detached) rather than `not.toBeVisible()` for precision.

---

## 8. Running & debugging

```bash
# Whole LA suite (English + Hebrew specs)
npx playwright test --project=chrome-assistant

# Just one language
npx playwright test --project=chrome-assistant library-assistant.spec.ts          # English
npx playwright test --project=chrome-assistant library-assistant-hebrew.spec.ts    # Hebrew

# Single test by UX ID (matches EN and HE variants)
npx playwright test --project=chrome-assistant -g 'UX-003'

# Interactive / step-through
npx playwright test --project=chrome-assistant --ui
npx playwright test --project=chrome-assistant --debug

# Slow machine / CI tuning
TIMEOUT_MULTIPLIER=2 npx playwright test --project=chrome-assistant

# Generate HTML + JUnit reports
GENERATE_REPORTS=1 npx playwright test --project=chrome-assistant
```

Useful probes when a selector "can't be found":

```js
// From page.evaluate — confirms the host is present and in open mode
const info = await page.evaluate(() => {
  const host = document.querySelector('lc-chatbot');
  return {
    hostExists: !!host,
    hasShadowRoot: !!host?.shadowRoot,
    containerClass: host?.shadowRoot?.querySelector('.lc-chatbot-container')?.className,
    // listing visible buttons in the shadow root
    buttons: Array.from(host?.shadowRoot?.querySelectorAll('button[aria-label]') || [])
      .map(b => b.getAttribute('aria-label')),
  };
});
console.log(info);
```

If the host is missing entirely: the user isn't whitelisted for LA, or storage state is stale. Delete `e2e-tests/auth_english_la_user.json` to force a fresh login.

---

## 9. File map

| File | Purpose |
| --- | --- |
| [library-assistant.spec.ts](library-assistant.spec.ts) | **English** spec: 15 behavioral tests (UX-001, 003, 004, 013, 014, 022, 023, 024, 026, 027, 036, 057, 058, 059 *(fixme)*, 060) + 4 visibility-boundary tests (LA-NEG-001 → 004) |
| [library-assistant-hebrew.spec.ts](library-assistant-hebrew.spec.ts) | **Hebrew** spec mirroring the English one (UX-… `(HE)` + LA-NEG-HE-001/003/004). Runs in parallel; see §12 |
| [../pages/libraryAssistantPage.ts](../pages/libraryAssistantPage.ts) | Page object — all LA interactions; labels looked up by translation key (§11) |
| [../pages/pageManager.ts](../pages/pageManager.ts) | Registers `pm.onLibraryAssistant()` |
| [../globals.ts](../globals.ts) | `testLAUser` / `testHeLAUser`, `AUTH_PATHS.enLAUserFile` / `heLAUserFile`, `BROWSER_SETTINGS.enLAUser` / `heLAUser` |
| [../.env](../.env) | `PLAYWRIGHT_LA_USER_*` (English) and `PLAYWRIGHT_LA_USER_HE_*` (Hebrew) credentials |
| [../../playwright.config.ts](../../playwright.config.ts) | `chrome-assistant` project definition (runs both specs) |

---

## 10. What's still TODO

These UX IDs are planned but *not* yet implemented (the ranges below exclude everything already covered in §5 / §9). Add them following the recipe in §6:

- Panel layout / resize: UX-005 — UX-012
- Empty state, placeholder, draft persistence, char limit: UX-017 — UX-021
- Message rendering (markdown, links, citations, sanitization): UX-028 — UX-035
- Thinking / tool progress states: UX-037 — UX-039 *(UX-036 done)*
- Error + retry: UX-040, UX-041
- Conversation history / scroll: UX-042 — UX-045
- Feedback (inline + modal): UX-046 — UX-056
- Header menu deep dives: UX-061 — UX-064 *(UX-057 → UX-060 done; UX-059 is implemented but `test.fixme` pending a component Escape-to-close fix)*
- Moderator settings panel: UX-065 — UX-070. The QA user *is* staff/moderator and already sees the `Settings` menu entry (covered by UX-057), so the deeper settings-panel flows are reachable and just need writing.
- Accessibility, theming, session, embedding, responsive: UX-071 — UX-084 *(UX-085, "LA hidden at 375px", was removed when the LA gained mobile support — phone coverage now lives in the LA-* Q4 stories, see §13)*

When tackling any of these, first check whether the page object already covers the interaction. If so, just write the spec. If not, add a small, named method — don't inline raw locators in the spec file (per [../CLAUDE.md](../CLAUDE.md) §2).

---

## 11. Bilingual label reference (looked up by translation key)

The component runs a `svelte-i18n` build (`interface-lang="en"` / `"he"`) and renders every label from a catalog. The page object does **not** type the words out: `labelsFor()` in [../pages/libraryAssistantPage.ts](../pages/libraryAssistantPage.ts) reads each label by key from ai-chatbot's `src/i18n/locales/{en,he}.json` through [../support/assistantStrings.ts](../support/assistantStrings.ts). So a Weblate copy edit doesn't break the suite, and the suite needs `AI_CHATBOT_REPO_PATH` (default `../ai-chatbot`) checked out at the ai-chatbot version the site under test runs. The lookup happens on first use, so specs that never touch the LA don't need the checkout.

| Element | Key | English today |
| --- | --- | --- |
| Trigger button (`aria-label`) | `assistant.header.openAssistant` | `Open Library Assistant` |
| Dialog (`aria-label`) | `assistant.header.chatWindow` | `Chat window` |
| Close (`title`/`aria`) | `assistant.header.close.tooltip` | `Close` |
| Dock header button (floating→docked) | `assistant.header.dock.tooltip` | `Maximize & move to sidebar` |
| Undock header button (docked→floating) | `assistant.header.undock.tooltip` | `Minimize & detach from sidebar` |
| More options | `assistant.header.moreOptions` | `More options` |
| Prompt input (`aria`) | `assistant.input.aria` | `Prompt input` |
| Send (`aria`) | `assistant.input.send.tooltip` | `Send` |
| Stop (`aria`), replaces Send while an answer is being written | `assistant.stop.aria` | `Stop` |
| Menu items, panel floating (in order) | `assistant.history.header.new.tooltip`, `assistant.menu.dock`, `assistant.menu.feedback`, `assistant.menu.help`, `assistant.menu.optout` | `New chat` / `Maximize & move to sidebar` / `Give feedback` / `Help` / `Disable in settings` |
| Settings menu item (moderator-only) | `assistant.menu.settings` | `Settings` |
| Restart menu item (`aria`) | `assistant.menu.restart.aria` | `Restart convo` |
| Thinking indicator text (`.lc-thinking-block`) | `assistant.loading.initial`, then `assistant.thinking.array.NN` in turn, then `assistant.thinking.final` | `Thinking`, then `Interpreting your question`, `Searching the library`, … `Synthesizing response` *(`expectThinkingVisible()` accepts any of them)* |

**Menu & moderator status.** The `Settings` item renders only for Django-**staff** accounts (the chatbot's `is-moderator` branch) — so the menu is **5 items** for a normal account, **6** (Settings first) for staff. The dock item names the *other* mode (`assistant.menu.dock` while floating, `assistant.menu.undock` while docked), so call `ensureFloating()` before checking the list. `expectedMenuTexts(isModerator)` builds the floating-mode list; pass `BROWSER_SETTINGS.<profile>.isModerator`. `enLAUser` is staff (`true`); `heLAUser` tracks the real `qa+automationLAHebrew` account — flip its `isModerator` flag in [../globals.ts](../globals.ts) if that account's staff status changes.

---

## 12. Testing the Hebrew LA — why it uses a dedicated account

Sefaria's MDL prod is **cross-TLD**: English = `www.sefaria.org`, Hebrew = `www.sefaria.org.il` (a *different registrable domain*). The single fact that determines the setup:

> **A logged-in user is routed server-side (HTTP 302) to the domain matching their *account's* Site-Language preference.** It is **not** overridable by the `interfaceLang` cookie or `?lang=he` — the redirect fires before any page JS.

Consequences (all verified live):

- An **English-preference** account is always bounced to `.org`/English when logged in — even on a direct `.il` navigation, and regardless of how its session was obtained. So it can never render the Hebrew LA.
- Logged **out**, `.il` stays Hebrew — which is why the older `heUser`/`heAdmin` tests "work": they run *anonymously* on `.il` (the `.org` session cookie isn't sent cross-TLD, so they were never logged in there).
- Therefore a logged-in **Hebrew** LA session requires an account whose Site-Language is **Hebrew**. One account has a single language preference, so this is necessarily a **separate** account from the English `enLAUser` — not a cookie/flip trick on the shared one.

> Note: Sefaria does **not** invalidate concurrent sessions for the same user (verified — a second login does not kill the first), so multiple accounts/logins coexist freely. The dedicated Hebrew account is needed purely because of the *language-routing* redirect above, not for any session reason.

**How it's wired (standard, fully parallel):**

- `BROWSER_SETTINGS.heLAUser` → `testHeLAUser` (creds `PLAYWRIGHT_LA_USER_HE_*`), a whitelisted account whose **Settings → Site Language is Hebrew**.
- [../global-setup.ts](../global-setup.ts) logs it in **natively on `www.sefaria.org.il`** (`site: 'IL'`), capturing a real `.org.il` session.
- The Hebrew spec's `beforeEach` is just `goToPageWithUser(context, MODULE_URLS.HE.LIBRARY, BROWSER_SETTINGS.heLAUser)` — identical to every other profile. No bridge, no flip, no `serial`; it runs in parallel with the English suite.

**Setup checklist for the Hebrew account:**

1. Create/confirm a whitelisted LA account and set its **Settings → Site Language = Hebrew** (so it lives on `.org.il` when logged in).
2. Add `PLAYWRIGHT_LA_USER_HE_EMAIL` / `PLAYWRIGHT_LA_USER_HE_PASSWORD` to [../.env](../.env).
3. Run: `npx playwright test --project=chrome-assistant library-assistant-hebrew.spec.ts`.

If those creds are missing, `global-setup` skips the account with a warning and the Hebrew tests fail with a clear "auth file missing" error.

See also [../CLAUDE.md](../CLAUDE.md) and the memory note "Hebrew logged-in needs a HE-preference account".

---

## 13. Q4 package stories (LA-BTN / LA-ENTRY / LA-PHONE / LA-COOKIE / LA-NOTE / LA-RTL)

Written **test-first** from the "Library Assistant behavior stories for automated tests" doc, so they fail until the features land.

| File | What |
| --- | --- |
| [library-assistant-q4-desktop.spec.ts](library-assistant-q4-desktop.spec.ts) | `@desktop` stories + LA-BTN-8, LA-ENTRY-2 (desktop config, `chrome-assistant`) |
| [../mobile web/library-assistant-phone.spec.ts](../mobile%20web/library-assistant-phone.spec.ts) | `@phone` stories + LA-PHONE-1, LA-PHONE-11 (mobile config) |
| [../pages/libraryAssistantQ4Page.ts](../pages/libraryAssistantQ4Page.ts) | Page object, `pm.onLibraryAssistantQ4()` |
| [../support/chatServerMock.ts](../support/chatServerMock.ts) | Fake chat server (`page.route`) — choose an answer's text and when it arrives |
| [../support/assistantStrings.ts](../support/assistantStrings.ts) | Copy by translation key; reads ai-chatbot's locale files from `AI_CHATBOT_REPO_PATH` (default `../ai-chatbot`) |
| [../support/motionAnalysis.ts](../support/motionAnalysis.ts) | Turns per-frame position samples into bounce / slide facts |

- **Copy by key, never by words.** The stories require it, so a Weblate edit can't break a test.
- **The chat server is faked**, so these tests don't need the AI backend and run in seconds.
- **Touch drags need Chromium.** Drags and swipes go through the Chromium DevTools protocol, so those tests (or steps) are skipped on WebKit.
- **LA-NOTE-4 is not written.** The stories don't say when the button reads "Search with Library Assistant".

```bash
npx playwright test --project=chrome-assistant library-assistant-q4-desktop
npx playwright test --config=playwright.mobileweb.config.ts --project=chrome-mobile-library library-assistant-phone
```

### Search with no results (LA-NULL-*)

Also test-first, same helpers as above.

| File | What |
| --- | --- |
| [library-assistant-null-search-desktop.spec.ts](library-assistant-null-search-desktop.spec.ts) | Every LA-NULL story on desktop (`chrome-assistant`) |
| [../mobile web/library-assistant-null-search-phone.spec.ts](../mobile%20web/library-assistant-null-search-phone.spec.ts) | The `@phone` ones: LA-NULL-1, LA-NULL-5, LA-NULL-16 and LA-NULL-19 (mobile config) |
| [../support/nullStateRecorder.ts](../support/nullStateRecorder.ts) | Records every version of the "no results" box from before the page loads (LA-NULL-3) |

- **"Assistant on"** is `enLAUser` / `heLAUser`; **"assistant off"** is `enUser`, which never gets the assistant.
- **The question the button sends** is read from Sefaria's `search.no_results.library_assistant_question` key.
- **"Library Assistant" in the text is a link** (LA-NULL-16 → 18) that sends the same question as the button; the two share one "already asked". It's part of the sentence, not a button, so LA-NULL-1's "no button on the page" check leaves it out. LA-NULL-18 also needs the widget change from Sefaria/ai-chatbot#242 (commit 0efd3cf).
- **Logged-out stories run as a visitor nobody logged in as** (`goToPageWithLang`): the logged-out rows of LA-NULL-1 and LA-NULL-16, and LA-NULL-8 → 12, each of which runs once by the button and once by the link (LA-NULL-17, logged out). The fake chat server gives them a few free answers and counts them the way ai-chatbot's server does.

```bash
npx playwright test --project=chrome-assistant library-assistant-null-search-desktop
npx playwright test --config=playwright.mobileweb.config.ts --project=chrome-mobile-library library-assistant-null-search-phone
```

### QA changes (LA-QA-*)

Stories added after QA on phones and the header pill. Every test is tagged `@qa`, so they can run apart from the original-spec stories. There is no LA-QA-1 (that change was dropped).

| File | What |
| --- | --- |
| [library-assistant-qa-desktop.spec.ts](library-assistant-qa-desktop.spec.ts) | LA-QA-4 (header pill shortens or hides), and the desktop half of LA-QA-6 and LA-QA-7 |
| [../mobile web/library-assistant-qa-phone.spec.ts](../mobile%20web/library-assistant-qa-phone.spec.ts) | LA-QA-3, 5, 8, and the phone half of LA-QA-6 and LA-QA-7 (mobile config) |
| [../support/longConversation.ts](../support/longConversation.ts) | Builds a chat long enough to scroll, for the "where is the chat scrolled" stories |

- **The keyboard stories are left to manual QA on a real phone**: a browser emulating a phone has no on-screen keyboard. That's LA-QA-2, and LA-QA-3's rows where the keyboard opens or closes; they have no tests here. LA-QA-3's "text box grows to a second line" row and LA-QA-5 (Stop glides to its notice) don't need the keyboard and run; LA-QA-5 checks "the keyboard stays closed" as "the text box isn't focused". LA-QA-8 runs, but its "while the keyboard closes" step is skipped (noted in the report).
- **LA-QA-4's logged-out rows are placeholders**; only the signed-in row runs, as the stories say for builds without the logged-out assistant.
- **Changed with these:** LA-ENTRY-2 now checks 1000px instead of 900px (at 900px the pill reads "✦ Ask"), LA-NOTE-3 checks the assistant opens on the start of the late answer, and LA-NULL-9's placeholder steps allow "where the visitor left it".

```bash
npx playwright test --project=chrome-assistant library-assistant-qa-desktop
npx playwright test --config=playwright.mobileweb.config.ts --project=chrome-mobile-library library-assistant-qa-phone
```
