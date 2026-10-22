import { test, expect, BrowserContext, Page } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { LibraryAssistantQ4Page } from '../pages/libraryAssistantQ4Page';
import { MODULE_URLS } from '../constants';
import { ChatServerMock } from '../support/chatServerMock';

/**
 * Library Assistant on desktop — the "Q4 package" behavior stories tagged
 * @desktop (plus the untagged LA-BTN-8 and LA-ENTRY-2, which are about wide
 * windows). The phone stories live in e2e-tests/mobile web/library-assistant-phone.spec.ts.
 *
 * Written TEST-FIRST: the "✦ Ask" button, the header pill and the answer-ready
 * dot are not built yet, so these tests are expected to fail until they land.
 *
 * How they run:
 *  - Desktop config (playwright.config.ts → chrome/firefox/safari-assistant),
 *    window 1280 × 800 unless a story says otherwise.
 *  - Logged in as the Library-Assistant-enabled test account (enLAUser / heLAUser).
 *  - The chat server is faked inside the browser (support/chatServerMock.ts).
 *  - Copy is looked up by translation key (support/assistantStrings.ts),
 *    which needs AI_CHATBOT_REPO_PATH (see e2e-tests/example.env).
 *
 * LA-NOTE-4 ("the relabelled button gets the dot too") is intentionally not
 * written: the stories don't say when the button reads "Search with Library Assistant".
 *
 * Run: npx playwright test --project=chrome-assistant library-assistant-q4-desktop
 */

const DESKTOP = { width: 1280, height: 800 };
const DESKTOP_TAGS = { tag: ['@e2e', '@desktop'] };
const QUESTION = 'Where does the Talmud discuss Hanukkah lights?';
const LATE_ANSWER = 'Hanukkah lights are discussed in the Talmud (late answer).';

test.use({ viewport: DESKTOP });

/**
 * Standard start: fake chat server first (it must be in place before the page
 * loads), then log in, then make sure the assistant is closed so the test
 * starts from the Ask button.
 */
async function start(context: BrowserContext, lang = LANGUAGES.EN) {
  const mock = await ChatServerMock.install(context);
  const isHebrew = lang === LANGUAGES.HE;
  const page = await goToPageWithUser(
    context,
    isHebrew ? MODULE_URLS.HE.LIBRARY : MODULE_URLS.EN.LIBRARY,
    isHebrew ? BROWSER_SETTINGS.heLAUser : BROWSER_SETTINGS.enLAUser,
  );
  const pm = new PageManager(page, lang);
  await hideAllModalsAndPopups(page);
  await pm.onLibraryAssistantQ4().waitForReady();
  await pm.onLibraryAssistantQ4().ensureClosed();
  return { page, pm, mock, la: pm.onLibraryAssistantQ4() };
}

// ---------------------------------------------------------------------------
// Ask button
// ---------------------------------------------------------------------------

test.describe('Library Assistant desktop — Ask button', () => {
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ la } = await start(context));
  });

  test('LA-BTN-4: Look of the button — 56px, fully rounded, purple, 16px/500 label, 18px star', DESKTOP_TAGS, async () => {
    await la.expectAskButtonLook();
  });

  test('LA-BTN-5: Hover and press darken the button', DESKTOP_TAGS, async () => {
    await la.expectAskButtonHoverAndPressColor();
  });

  test('LA-BTN-7: Keyboard focus is visible, and Enter opens the assistant', DESKTOP_TAGS, async () => {
    await la.expectKeyboardFocusRingAndEnterOpens();
  });
});

const positionExamples = [
  { lang: LANGUAGES.EN, label: 'English', gap: 24, side: 'right' },
  { lang: LANGUAGES.HE, label: 'Hebrew', gap: 24, side: 'left' },
] as const;

for (const { lang, label, gap, side } of positionExamples) {
  test.describe(`Library Assistant desktop — Ask button position (${label})`, () => {
    let la: LibraryAssistantQ4Page;

    test.beforeEach(async ({ context }) => {
      ({ la } = await start(context, lang));
    });

    test(`LA-BTN-8: Position — ${label}: ${gap}px from the bottom and the ${side} edge`, { tag: '@e2e' }, async () => {
      await la.expectAskButtonGaps(gap, side);
    });
  });
}

// ---------------------------------------------------------------------------
// Fixed entry points: the header pill
// ---------------------------------------------------------------------------

// Not 900px: there the pill now reads "✦ Ask" (LA-QA-4); at 1000px it still reads "✦ Library Assistant".
for (const width of [1280, 1000]) {
  test.describe(`Library Assistant desktop — header pill at ${width}px`, () => {
    test.use({ viewport: { width, height: DESKTOP.height } });
    let la: LibraryAssistantQ4Page;

    test.beforeEach(async ({ context }) => {
      ({ la } = await start(context));
    });

    test(`LA-ENTRY-2: Header pill on the large and medium headers — ${width}px`, { tag: '@e2e' }, async () => {
      await la.expectHeaderPillJustBeforeSearchBox();
      await la.clickHeaderPill();
      await la.expectAssistantOpen();
    });
  });
}

test.describe('Library Assistant desktop — header pill', () => {
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ la } = await start(context));
  });

  test('LA-ENTRY-3: Header pill opens with the keyboard (Enter or Space)', DESKTOP_TAGS, async () => {
    await la.openHeaderPillWithKey('Enter');
    await la.closeWithMinimize();
    await la.openHeaderPillWithKey(' ');
  });

  test('LA-ENTRY-5: Look of the header pill — 30px, rounded, purple, 14px text, 16px star, darker on hover/press', DESKTOP_TAGS, async () => {
    await la.expectHeaderPillLook();
  });
});

test.describe('Library Assistant desktop — Voices', () => {
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    // No `start()` here: the assistant is not on Voices, so there is nothing to wait for.
    // Local note: on localhost the session cookie can't reach voices.localhost (see
    // e2e-tests/CLAUDE.md), so locally this runs logged out.
    const page: Page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enLAUser);
    la = new PageManager(page, LANGUAGES.EN).onLibraryAssistantQ4();
    await hideAllModalsAndPopups(page);
  });

  test('LA-ENTRY-4: Header pill only in the library — none on a Voices page', DESKTOP_TAGS, async () => {
    await la.expectNoHeaderPill();
  });
});

// ---------------------------------------------------------------------------
// Cookie banner on wide windows
// ---------------------------------------------------------------------------

test.describe('Library Assistant desktop — cookie banner', () => {
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ la } = await start(context));
    await la.showCookieBanner();
  });

  test("LA-COOKIE-4: Wider windows don't move the button — banner is a corner card, button stays 24px up", DESKTOP_TAGS, async () => {
    await la.expectCookieBannerIsCornerCard();
    await la.expectAskButtonGaps(24, 'bottom only');
  });
});

// ---------------------------------------------------------------------------
// Answer-ready notification
// ---------------------------------------------------------------------------

test.describe('Library Assistant desktop — answer-ready notification', () => {
  let page: Page;
  let mock: ChatServerMock;
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ page, mock, la } = await start(context));
    mock.answerNextWith(LATE_ANSWER);
    mock.holdAnswers();
    await la.askThenCloseBeforeAnswer(QUESTION, () => mock.waitForQuestion());
  });

  test('LA-NOTE-1: An answer that lands while the assistant is closed — dot, two bounces, announcement', { tag: ['@e2e', '@desktop', '@phone'] }, async () => {
    const watched = await la.watchAskButtonWhile(() => mock.releaseAnswers());
    await la.expectAnswerReadyDot();
    expect(watched.bounces.riseCount, 'the Ask button should bounce twice').toBe(2);
    expect(watched.bounces.stillAtEnd, 'then stay still').toBe(true);
    await la.expectAnswerReadyAnnouncement();
    await la.expectAskButtonNamedAnswerReady();
  });

  test('LA-NOTE-2: Look and timing — 12px red dot with white ring; 0.6s bounces rising 6px then a 2px hop; fading pings', DESKTOP_TAGS, async () => {
    const watched = await la.watchAskButtonWhile(() => mock.releaseAnswers());
    await la.expectAnswerReadyDot();
    await la.expectAnswerReadyDotLook();

    const { bounces, pings } = watched;
    expect(bounces.riseCount, 'two bounces').toBe(2);
    expect(Math.abs(bounces.maxRise - 6), `highest rise was ${bounces.maxRise}px`).toBeLessThanOrEqual(1);
    for (const hop of bounces.hopHeights) {
      expect(Math.abs(hop - 2), `hop after a bounce was ${hop}px`).toBeLessThanOrEqual(1);
    }
    for (const duration of bounces.bounceDurations) {
      // 0.6s per bounce, with room for animation-frame timing and slow test machines.
      expect(duration, `a bounce lasted ${duration}ms`).toBeGreaterThanOrEqual(450);
      expect(duration, `a bounce lasted ${duration}ms`).toBeLessThanOrEqual(800);
    }
    const pingCount = pings.reduce((total, p) => total + p.iterations, 0);
    expect(pingCount, 'the dot should send out a fading ping with each bounce').toBeGreaterThanOrEqual(2);
  });

  test('LA-NOTE-3: Opening clears the dot, and the assistant opens on the start of that answer', { tag: ['@e2e', '@desktop', '@phone'] }, async () => {
    mock.releaseAnswers();
    await la.expectAnswerReadyDot();
    await la.openWithAskButton();
    await la.expectConversationContains(LATE_ANSWER);
    await la.expectChatShowsStartOf(LATE_ANSWER);
    await la.expectNoAnswerReadyDot();
    await la.closeWithMinimize();
    await la.expectNoAnswerReadyDot();
  });

  test('LA-NOTE-5: Reduced motion — the dot appears without bouncing or pinging', DESKTOP_TAGS, async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const watched = await la.watchAskButtonWhile(() => mock.releaseAnswers());
    await la.expectAnswerReadyDot();
    expect(watched.bounces.maxRise, 'the button should not move').toBeLessThanOrEqual(0.5);
    expect(watched.pings, 'no fading pings').toEqual([]);
    expect(watched.movingAnimations, 'no moving animations').toEqual([]);
  });
});
