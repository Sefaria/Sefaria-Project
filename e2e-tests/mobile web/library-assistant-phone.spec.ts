import { test, expect, BrowserContext, Page } from '@playwright/test';
import { goToPageWithUser, gotoOrThrow, hideAllModalsAndPopups } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { LibraryAssistantQ4Page } from '../pages/libraryAssistantQ4Page';
import { MODULE_URLS } from '../constants';
import { ChatServerMock, SavedChat } from '../support/chatServerMock';
import { escapeRegExp } from '../support/assistantStrings';

/**
 * Library Assistant on phones — the "Q4 package" behavior stories
 * (LA-BTN, LA-ENTRY, LA-PHONE, LA-COOKIE, LA-NOTE, LA-RTL) tagged @phone,
 * plus the untagged phone-shaped ones (LA-PHONE-1, LA-PHONE-11).
 * The desktop-tagged stories live in e2e-tests/assistant/library-assistant-q4-desktop.spec.ts.
 *
 * Written TEST-FIRST: the phone version of the assistant is not built yet
 * (Sefaria's ReaderApp.jsx currently hides <lc-chatbot> on mobile), so these
 * tests are expected to fail until the feature lands.
 *
 * How they run:
 *  - Mobile config (playwright.mobileweb.config.ts): Pixel 5 / iPhone 13
 *    emulation (touch + mobile user agent), with the window set to the
 *    stories' phone size, 393 × 852.
 *  - Logged in as the Library-Assistant-enabled test account (enLAUser /
 *    heLAUser) — other accounts don't get the assistant at all.
 *  - The chat server is faked inside the browser (support/chatServerMock.ts),
 *    so answers are instant, have exactly the content a story needs, and
 *    arrive exactly when a story needs them.
 *  - Copy is looked up by translation key (support/assistantStrings.ts),
 *    which needs AI_CHATBOT_REPO_PATH (see e2e-tests/example.env).
 *  - Touch drags and swipes can only be sent through Chromium's DevTools
 *    protocol, so those tests are skipped on WebKit (a harness limitation).
 *
 * Run: npx playwright test --config=playwright.mobileweb.config.ts library-assistant-phone
 */

const LIBRARY = MODULE_URLS.EN.LIBRARY;
const TEXT_PAGE = `${LIBRARY}/Genesis.1`;
const SHABBAT_23B = `${LIBRARY}/Shabbat.23b`;
// The library home `/` always redirects to `/texts` (reader/views.py `home`).
const HOMEPAGE_URL = new RegExp(`^${escapeRegExp(LIBRARY)}/texts/?$`);

const PHONE = { width: 393, height: 852 };
const PHONE_TAGS = { tag: ['@e2e', '@phone'] };
const CHROMIUM_ONLY = 'Harness limitation: Playwright can only send touch drags and swipes through the Chromium DevTools protocol';

const QUESTION = 'Where does the Talmud discuss Hanukkah lights?';
const ANSWER_WITH_LINK = `The main discussion is in [Shabbat 23b](${SHABBAT_23B}).`;
// Real answers arrive as HTML with these classes (ai-chatbot prompts/prompt_text/response_format.md),
// and the widget's heading size and spacing hang off them, so markdown `###` would not do.
const ANSWER_WITH_HEADING =
  '<p class="response-generic">Here is some text before the heading.</p>' +
  '<h3 class="response-title">Heading for the test</h3>' +
  '<p class="response-generic">Here is some text under the heading.</p>';
const LATE_ANSWER = 'Hanukkah lights are discussed in the Talmud (late answer).';
const SAVED_CHAT: SavedChat = {
  sessionId: 'sess_mock_saved_1',
  title: 'Saved chat about Shabbat candles',
  question: 'Why do we light Shabbat candles?',
  answerMarkdown: 'Shabbat candles bring peace to the home (saved answer).',
};

test.use({ viewport: PHONE });

/**
 * Standard start for every test: fake chat server first (it must be in place
 * before the page loads), then log in and land on `url`, then make sure the
 * assistant is closed so the test starts from the Ask button.
 */
async function start(context: BrowserContext, url = LIBRARY, lang = LANGUAGES.EN) {
  const mock = await ChatServerMock.install(context, { savedChats: [SAVED_CHAT] });
  const profile = lang === LANGUAGES.HE ? BROWSER_SETTINGS.heLAUser : BROWSER_SETTINGS.enLAUser;
  const page = await goToPageWithUser(context, url, profile);
  const pm = new PageManager(page, lang);
  await hideAllModalsAndPopups(page);
  await pm.onLibraryAssistantQ4().waitForReady();
  await pm.onLibraryAssistantQ4().ensureClosed();
  return { page, pm, mock, la: pm.onLibraryAssistantQ4() };
}

// ---------------------------------------------------------------------------
// Ask button
// ---------------------------------------------------------------------------

test.describe('Library Assistant phone — Ask button', () => {
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ la } = await start(context));
  });

  test('LA-BTN-6: No hover color on touch screens — the first tap opens the assistant', PHONE_TAGS, async () => {
    await la.expectOneTapOpensWithoutHoverColor();
  });

  test('LA-BTN-9: Phones — the Ask button sits 16px from the bottom and 16px from the side', PHONE_TAGS, async () => {
    await la.expectAskButtonGaps(16, la.endSide);
  });
});

// ---------------------------------------------------------------------------
// On a text page (needs a long, scrollable page)
// ---------------------------------------------------------------------------

test.describe('Library Assistant phone — on a text page', () => {
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ la } = await start(context, TEXT_PAGE));
  });

  test('LA-BTN-10: The Ask button stays put while the visitor scrolls', PHONE_TAGS, async () => {
    await la.expectAskButtonStaysPutWhileScrolling();
  });

  test('LA-PHONE-2: Opening covers the page, the page behind does not scroll, the keyboard stays closed', PHONE_TAGS, async ({ browserName }) => {
    if (browserName === 'chromium') {
      // Prove the page CAN scroll before the assistant opens, so "does not scroll" below means something.
      expect(await la.scrollPage(200), 'the text page should scroll while the assistant is closed').toBe(true);
    }
    await la.openWithAskButton();
    await la.expectFullScreenSheet();
    await la.expectTextBoxNotFocused();
    if (browserName === 'chromium') {
      await la.expectPageBehindDoesNotScroll();
    } else {
      test.info().annotations.push({ type: 'skipped step', description: `page-behind-does-not-scroll — ${CHROMIUM_ONLY}` });
    }
  });
});

// ---------------------------------------------------------------------------
// Mobile header: hamburger menu entry point
// ---------------------------------------------------------------------------

test.describe('Library Assistant phone — hamburger menu item', () => {
  let pm: PageManager;
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ pm, la } = await start(context));
  });

  test('LA-ENTRY-6: Mobile menu item sits above Learning Schedules and opens the assistant', PHONE_TAGS, async () => {
    await pm.onMobileHamburger().openMenu();
    await la.expectMenuItemDirectlyAboveLearningSchedules();
    await la.expectAskButtonHidden();
    await la.tapMenuItemExpectMenuClosedAndAssistantOpen();
  });
});

// ---------------------------------------------------------------------------
// Width / orientation decides the layout
// ---------------------------------------------------------------------------

// For the assistant, "phone" means a window 600px wide or less, or 500px tall or less.
// (Sefaria's own mobile header switches at a different line: 842px wide or less.)
const widthExamples = [
  { width: 600, layout: 'a full-screen sheet' },
  { width: 601, layout: 'a floating panel' },
];

for (const { width, layout } of widthExamples) {
  test.describe(`Library Assistant phone — ${width}px wide window`, () => {
    test.use({ viewport: { width, height: PHONE.height } });
    let la: LibraryAssistantQ4Page;

    test.beforeEach(async ({ context }) => {
      ({ la } = await start(context));
    });

    test(`LA-PHONE-1: Width decides the layout — ${width}px opens as ${layout}`, { tag: '@e2e' }, async () => {
      await la.openWithAskButton();
      if (layout === 'a full-screen sheet') await la.expectFullScreenSheet();
      else await la.expectFloatingPanel();
    });
  });
}

test.describe('Library Assistant phone — held sideways', () => {
  test.use({ viewport: { width: 852, height: 393 } });
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ la } = await start(context));
  });

  test('LA-PHONE-11: A phone held sideways (852 × 393) gets the full-screen sheet', { tag: '@e2e' }, async () => {
    await la.openWithAskButton();
    await la.expectFullScreenSheet();
  });
});

// ---------------------------------------------------------------------------
// The full-screen sheet
// ---------------------------------------------------------------------------

test.describe('Library Assistant phone — the sheet', () => {
  let page: Page;
  let mock: ChatServerMock;
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ page, mock, la } = await start(context));
  });

  test('LA-PHONE-3: A link in an answer leads to its page; reopening shows the same conversation', PHONE_TAGS, async () => {
    mock.answerNextWith(ANSWER_WITH_LINK);
    await la.openWithAskButton();
    await la.askQuestion(QUESTION);
    await la.followAnswerLink('Shabbat 23b', /\/Shabbat\.23b/);
    await la.expectAssistantClosed();

    await hideAllModalsAndPopups(page);
    await la.openWithAskButton();
    await la.expectFullScreenSheet();
    await la.expectConversationContains(QUESTION);
    await la.expectConversationContains('Shabbat 23b');
  });

  test('LA-PHONE-3b: Back after following a link skips the assistant', PHONE_TAGS, async () => {
    mock.answerNextWith(ANSWER_WITH_LINK);
    await expect(page).toHaveURL(HOMEPAGE_URL);
    await la.openWithAskButton();
    await la.askQuestion(QUESTION);
    await la.followAnswerLink('Shabbat 23b', /\/Shabbat\.23b/);

    await page.goBack();
    await expect(page).toHaveURL(HOMEPAGE_URL, { timeout: t(10000) });
    await la.expectAssistantClosed();
  });

  test('LA-PHONE-4: History or conversation, not both', PHONE_TAGS, async () => {
    await la.openWithAskButton();
    await la.openChatHistory();
    await la.expectHistoryFillsSheetAndConversationHidden();
    await la.pickSavedChat(SAVED_CHAT.title);
    await la.expectConversationFillsSheet();
    await la.expectConversationContains(SAVED_CHAT.answerMarkdown);
  });

  const closeActions = [
    { action: 'minimize', description: 'taps the minimize (–) button', needsTouchDrag: false },
    { action: 'drag', description: 'drags the top bar down more than 120px', needsTouchDrag: true },
    { action: 'flick', description: 'flicks the top bar down quickly', needsTouchDrag: true },
    { action: 'back', description: "presses the phone's Back button", needsTouchDrag: false },
  ] as const;

  for (const { action, description, needsTouchDrag } of closeActions) {
    test(`LA-PHONE-5: Ways to close the sheet — the visitor ${description}`, PHONE_TAGS, async ({ browserName }) => {
      test.skip(needsTouchDrag && browserName !== 'chromium', CHROMIUM_ONLY);
      await la.openWithAskButton();
      await la.expectFullScreenSheet();
      await la.closeSheetBy(action);
    });
  }

  test('LA-PHONE-6: Back works normally after the assistant is closed', PHONE_TAGS, async () => {
    await gotoOrThrow(page, TEXT_PAGE, { waitUntil: 'domcontentloaded' });
    await hideAllModalsAndPopups(page);
    await la.waitForReady();
    await la.ensureClosed();

    await la.openWithAskButton();
    await la.closeWithMinimize();

    await page.goBack();
    await expect(page).toHaveURL(HOMEPAGE_URL, { timeout: t(10000) });
  });

  test('LA-PHONE-7: A short drag springs back to full screen over 0.2s', PHONE_TAGS, async ({ browserName }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);
    await la.openWithAskButton();
    await la.expectFullScreenSheet();

    const springBack = await la.dragShortAndMeasureSpringBack();
    expect(springBack.startValue, 'the sheet should follow the finger down while dragged').toBeGreaterThanOrEqual(30);
    expect(Math.abs(springBack.endValue), 'the sheet should end back at the top of the screen').toBeLessThanOrEqual(1);
    expect(springBack.inBetweenFrames, 'the sheet should slide back, not jump').toBeGreaterThanOrEqual(2);
    // 0.2s, with room for animation-frame timing (~16ms per frame) and slow test machines.
    expect(springBack.durationMs).toBeGreaterThanOrEqual(120);
    expect(springBack.durationMs).toBeLessThanOrEqual(400);
    await la.expectFullScreenSheet();
  });

  test('LA-PHONE-8: The drag handle — a centered 36 × 5px grey bar; top corners round to 16px while dragged', PHONE_TAGS, async ({ browserName }) => {
    await la.openWithAskButton();
    await la.expectDragHandle();
    if (browserName === 'chromium') {
      await la.expectTopCornersRoundWhileDragging(16);
    } else {
      test.info().annotations.push({ type: 'skipped step', description: `corners-while-dragging — ${CHROMIUM_ONLY}` });
    }
  });

  test('LA-PHONE-9: Sized for touch — 44px buttons, 48px menu rows, 16px fields, larger text, heading spacing', PHONE_TAGS, async () => {
    mock.answerNextWith(ANSWER_WITH_HEADING);
    await la.openWithAskButton();
    await la.askQuestion(QUESTION);
    await la.expectConversationContains('Here is some text under the heading.');
    await la.expectSizedForTouch('Heading for the test');
  });

  test('LA-PHONE-10: No sidebar option on phones', PHONE_TAGS, async () => {
    await la.openWithAskButton();
    await la.expectNoSidebarOption();
  });
});

// ---------------------------------------------------------------------------
// Cookie banner
// ---------------------------------------------------------------------------

test.describe('Library Assistant phone — cookie banner', () => {
  let page: Page;
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ page, la } = await start(context));
    await la.showCookieBanner();
  });

  test('LA-COOKIE-1: The Ask button floats 16px above the banner, even when the banner text wraps', PHONE_TAGS, async () => {
    await la.expectAskButtonAboveCookieBanner(16);

    // A narrower phone makes the banner's text wrap onto more lines. Today's text
    // still fits on three lines at 320px; at 280px the sentence itself wraps onto a fourth.
    const heightBefore = await la.cookieBannerHeight();
    await page.setViewportSize({ width: 280, height: PHONE.height });
    await expect.poll(() => la.cookieBannerHeight(), { timeout: t(5000), message: 'the banner text should wrap to more lines' })
      .toBeGreaterThan(heightBefore);
    await la.expectAskButtonAboveCookieBanner(16);
  });

  for (const reducedMotion of [false, true]) {
    const suffix = reducedMotion ? ' (with reduced motion)' : '';
    test(`LA-COOKIE-2: Accepting cookies lets the button slide back down over 0.2s${suffix}`, PHONE_TAGS, async () => {
      if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
      const slide = await la.acceptCookiesAndMeasureAskButtonSlide();
      expect(Math.abs(slide.endValue - 16), `the Ask button ends ${slide.endValue}px above the bottom`).toBeLessThanOrEqual(1);
      expect(slide.inBetweenFrames, 'the button should slide, never jump').toBeGreaterThanOrEqual(2);
      // 0.2s, with room for animation-frame timing (~16ms per frame) and slow test machines.
      expect(slide.durationMs).toBeGreaterThanOrEqual(120);
      expect(slide.durationMs).toBeLessThanOrEqual(400);
    });
  }

  test('LA-COOKIE-3: The open assistant covers the banner and stays usable', PHONE_TAGS, async () => {
    await la.openWithAskButton();
    await la.expectAssistantOnTopOfCookieBanner();
    await la.expectTextBoxAndSendUsable();
    await la.closeWithMinimize();
    await la.expectCookieBannerVisible();
    await la.expectAskButtonAboveCookieBanner(16);
  });
});

// ---------------------------------------------------------------------------
// Answer-ready notification (the @desktop @phone stories, phone half)
// ---------------------------------------------------------------------------

test.describe('Library Assistant phone — answer-ready notification', () => {
  let mock: ChatServerMock;
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ mock, la } = await start(context));
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

  test('LA-NOTE-3: Opening clears the dot', { tag: ['@e2e', '@desktop', '@phone'] }, async () => {
    mock.releaseAnswers();
    await la.expectAnswerReadyDot();
    await la.openWithAskButton();
    await la.expectConversationContains(LATE_ANSWER);
    await la.expectNoAnswerReadyDot();
    await la.closeWithMinimize();
    await la.expectNoAnswerReadyDot();
  });
});

// ---------------------------------------------------------------------------
// Hebrew
// ---------------------------------------------------------------------------

test.describe('Library Assistant phone — Hebrew', () => {
  let la: LibraryAssistantQ4Page;

  test.beforeEach(async ({ context }) => {
    ({ la } = await start(context, MODULE_URLS.HE.LIBRARY, LANGUAGES.HE));
  });

  test('LA-RTL-2: Phone sheet in Hebrew — the drag handle is still centered at the top', { tag: ['@e2e', '@phone', '@he'] }, async () => {
    await la.openWithAskButton();
    await la.expectFullScreenSheet();
    await la.expectDragHandle();
  });
});
