# Library Assistant — E2E Test Guide

> Practical reference for writing Playwright tests against the Sefaria Library Assistant (LA) chatbot on `www.sefaria.org`. Last verified 2026-04-14 against branch `mdl-playwright`.

---

## 1. What the LA is

The Library Assistant is a Svelte-based custom element `<lc-chatbot>` embedded on `www.sefaria.org`. It talks to the backend at `https://chat.sefaria.org/api`. The UX spec lives in [ai-chatbot.csv](ai-chatbot.csv).

Key facts that shape how we test it:

- The host element mounts an **open Shadow DOM**. Playwright's default engine pierces open shadow roots for `getByRole`, `getByLabel`, `getByText`, and CSS locators — no special `>>>`, `::shadow`, or `evaluate(querySelector...)` gymnastics needed.
- The component is **user-gated**. Non-whitelisted users do not see the element at all. For our automation user, the host renders with `default-open="true"`, so the panel auto-opens on a fresh context.
- Send round-trip against prod is **~10–20 seconds** per message. Tests that actually send a prompt hit real infra and must lift their `test.setTimeout`.

---

## 2. The whitelisted QA user

The LA test account is `<PLAYWRIGHT_LA_USER_EMAIL>`. Credentials live in [e2e-tests/.env](../.env):

```
PLAYWRIGHT_LA_USER_EMAIL=
PLAYWRIGHT_LA_USER_PASSWORD=
```

Consumed by [globals.ts](../globals.ts) as `testLAUser`, wired through `BROWSER_SETTINGS.enLAUser` (`lang: english`, `file: auth_english_la_user.json`). Always enter through:

```ts
page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enLAUser);
```

**Do not reuse `BROWSER_SETTINGS.enUser` / `.heUser` / `.enAdmin`.** Those accounts are *not* whitelisted for the LA; the `<lc-chatbot>` element simply won't be in the DOM and tests will fail at `waitForReady()`.

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

| Element | Locator | Notes |
| --- | --- | --- |
| Host custom element | `page.locator('lc-chatbot')` | count is 1 when user is whitelisted |
| Panel (dialog) | `page.getByRole('dialog', { name: 'Chat window' })` | visible when container has `is-open` |
| Floating trigger pill | `page.getByRole('button', { name: 'Open Library Assistant' })` | visible only when panel is closed |
| Close button (X) | `page.getByRole('button', { name: 'Close assistant' })` | header |
| Dock → side | `page.getByRole('button', { name: 'Dock assistant to side' })` | visible in floating mode |
| Undock → floating | `page.getByRole('button', { name: 'Undock assistant' })` | visible in docked mode |
| More options (ellipsis) | `page.getByRole('button', { name: 'More options' })` | opens dropdown: `Restart conversation`, `Give feedback`, `Help`, `Opt-out in Settings` |
| Prompt textarea | `page.getByLabel('Prompt input')` | `maxlength="10000"` (CSV UX-021's "500 chars" is wrong — comment in the CSV agrees) |
| Send button | `page.getByRole('button', { name: 'Send message' })` | disabled when textarea is empty |
| User message bubble | `page.locator('.message.user')` | use `.last()` for the most recent |
| Assistant message bubble | `page.locator('.message.assistant')` | use `.last()` for the most recent |
| Thinking indicator | `page.locator('.thinking-content')` | visible while request is in-flight |
| Container (mode class) | `page.locator('lc-chatbot .lc-chatbot-container')` | `mode-floating`/`mode-docked` + `is-open` when panel is open |

If you ever need something the role/label approach can't reach, fall back to `page.evaluate(() => document.querySelector('lc-chatbot').shadowRoot.querySelector(...))`. Don't add brittle CSS to the page object for it.

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
| UX-027 (input disabled during send) | `ensureOpen()`, `typeMessage()`, `sendViaEnter()`, `expectInputDisabledDuringSend()`, `waitForResponse()` |

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
6. **The CSV is the spec; the CSV can also be wrong.** UX-021 claims 500-char limit; the actual `maxlength` on the textarea is 10000. When the CSV contradicts observed DOM, trust the DOM and note it.
7. **Cross-test isolation works out of the box** because each Playwright worker gets its own `BrowserContext`. Running 10 tests in parallel sends at most 3 real prompts — no rate-limit issues observed.
8. **Only the LA-whitelisted account sees the chatbot.** Standard automation accounts (`qa+automation@sefaria.org`) will not, so reusing `BROWSER_SETTINGS.enUser` / `.heUser` / `.enAdmin` will silently make `waitForReady()` time out. Always go through `enLAUser`.
9. **Trigger is absent, not hidden, when the panel is open.** Expect `toBeHidden()` (which also accepts absent/detached) rather than `not.toBeVisible()` for precision.

---

## 8. Running & debugging

```bash
# Whole LA suite
npx playwright test --project=chrome-assistant

# Single test by UX ID
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
| [library-assistant.spec.ts](library-assistant.spec.ts) | Spec implementing UX-001, UX-003, UX-004, UX-013, UX-014, UX-022, UX-023, UX-024, UX-026, UX-027 |
| [ai-chatbot.csv](ai-chatbot.csv) | Full UX test plan (source of truth for new tests) |
| [../pages/libraryAssistantPage.ts](../pages/libraryAssistantPage.ts) | Page object — all LA interactions live here |
| [../pages/pageManager.ts](../pages/pageManager.ts) | Registers `pm.onLibraryAssistant()` |
| [../globals.ts](../globals.ts) | `testLAUser`, `AUTH_PATHS.enLAUserFile`, `BROWSER_SETTINGS.enLAUser` |
| [../.env](../.env) | `PLAYWRIGHT_LA_USER_*` credentials |
| [../../playwright.config.ts](../../playwright.config.ts) | `chrome-assistant` project definition |

---

## 10. What's still TODO from the CSV

These UX IDs are spec'd in the CSV but *not* yet implemented. Add them following the recipe in §6:

- Panel layout / resize: UX-005 — UX-012
- Empty state, placeholder, draft persistence, char limit: UX-017 — UX-021
- Message rendering (markdown, links, citations, sanitization): UX-028 — UX-035
- Thinking / tool progress states: UX-036 — UX-039
- Error + retry: UX-040, UX-041
- Conversation history / scroll: UX-042 — UX-045
- Feedback (inline + modal): UX-046 — UX-056
- Header menu deep dives: UX-057 — UX-064
- Moderator settings panel (requires `is-moderator` attribute — not yet available on this QA user): UX-065 — UX-070
- Accessibility, theming, session, embedding, responsive: UX-071 — UX-085

When tackling any of these, first check whether the page object already covers the interaction. If so, just write the spec. If not, add a small, named method — don't inline raw locators in the spec file (per [../CLAUDE.md](../CLAUDE.md) §2).
