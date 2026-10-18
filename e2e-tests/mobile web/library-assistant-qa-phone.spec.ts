import { test, expect, BrowserContext } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
import { ChatServerMock } from '../support/chatServerMock';
import { analyzeSlide } from '../support/motionAnalysis';
import { haveLongConversation, longAnswer, longAnswerStart } from '../support/longConversation';

/**
 * Library Assistant "QA changes" (LA-QA-*) on phones — the stories tagged @phone:
 * LA-QA-2, LA-QA-3, LA-QA-5, LA-QA-8, and the phone half of LA-QA-6 and LA-QA-7.
 * The desktop stories live in e2e-tests/assistant/library-assistant-qa-desktop.spec.ts.
 * (There is no LA-QA-1: that change was tried and dropped.)
 *
 * Every test is tagged @qa, so these can run apart from the original-spec stories:
 *   npx playwright test --config=playwright.mobileweb.config.ts --grep @qa
 *
 * Written TEST-FIRST, so some are expected to fail until the changes land.
 *
 * How they run: the same setup as library-assistant-phone.spec.ts — Pixel 5 /
 * iPhone 13 emulation at 393 × 852, logged in as the Library-Assistant test account,
 * fake chat server, copy read by translation key.
 *
 * LA-QA-2, LA-QA-3 and LA-QA-5 are test.fixme placeholders: they are about the
 * phone's on-screen keyboard opening and closing, and a browser emulating a phone
 * has no on-screen keyboard. They need a real phone or a keyboard simulation.
 * LA-QA-8 runs, except for its keyboard step.
 *
 * Run: npx playwright test --config=playwright.mobileweb.config.ts library-assistant-qa-phone
 */

const PHONE = { width: 393, height: 852 };
const QA_PHONE_TAGS = { tag: ['@qa', '@e2e', '@phone'] };
const QA_DESKTOP_PHONE_TAGS = { tag: ['@qa', '@e2e', '@desktop', '@phone'] };
const NO_KEYBOARD = 'A browser emulating a phone has no on-screen keyboard; this needs a real phone or a keyboard simulation';
/** Why the keyboard stories are placeholders (shows in the test report). */
const NEEDS_KEYBOARD = { type: 'needs a phone keyboard', description: NO_KEYBOARD };

const LATE_QUESTION = 'Where does the Talmud discuss Hanukkah lights? (asked, then closed)';
const LATE_LABEL = 'Late answer';
const NEW_QUESTION = 'And where is the blessing over the lights discussed?';

test.use({ viewport: PHONE });

/**
 * Standard start: fake chat server first (it must be in place before the page
 * loads), then log in, then make sure the assistant is closed so the test
 * starts from the Ask button.
 */
async function start(context: BrowserContext) {
  const mock = await ChatServerMock.install(context);
  const page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enLAUser);
  const pm = new PageManager(page, LANGUAGES.EN);
  await hideAllModalsAndPopups(page);
  const la = pm.onLibraryAssistantQ4();
  await la.waitForReady();
  await la.ensureClosed();
  return { page, mock, la };
}

// ---------------------------------------------------------------------------
// The keyboard (placeholders: no on-screen keyboard in a browser)
// ---------------------------------------------------------------------------

test.describe('Library Assistant QA — the keyboard (phone)', () => {
  test.fixme('LA-QA-2: The keyboard opens and closes without jumping or pausing', { ...QA_PHONE_TAGS, annotation: NEEDS_KEYBOARD }, async () => {
    // Steps on a real phone (or with a keyboard simulation):
    //  1. Open the assistant (la.openWithAskButton()).
    //  2. Tap the text box for the first time. The page behind doesn't scroll
    //     (la.expectPageBehindDoesNotScroll()); the text box moves up once and stays
    //     put while the keyboard opens, ending just above the keyboard.
    //  3. Close the keyboard. The text box goes back to the bottom as the keyboard
    //     slides away, with no pause.
    //  4. Type a question and tap Send with the keyboard open: the question is sent
    //     (mock.waitForQuestion()).
  });

  const placeExamples = [
    { where: 'the bottom', change: 'the keyboard opens', result: 'the last message is still just above the text box' },
    { where: 'the middle', change: 'the keyboard opens', result: 'the message just above the text box is still there' },
    { where: 'the middle', change: 'the text box grows to a second line', result: 'the message just above the text box is still there' },
    { where: 'the bottom', change: 'the keyboard closes', result: 'the last message is still just above the text box' },
  ];

  for (const { where, change, result } of placeExamples) {
    test.fixme(`LA-QA-3: The chat keeps its place — scrolled to ${where}, when ${change}, ${result}`, { ...QA_PHONE_TAGS, annotation: NEEDS_KEYBOARD }, async () => {
      // Steps on a real phone (or with a keyboard simulation):
      //  1. haveLongConversation(la, mock); scroll the chat to the row's place
      //     (la.scrollChatTo(1) for the bottom, la.scrollChatTo(0.5) for the middle).
      //  2. Note which message is just above the text box.
      //  3. Make the row's change happen.
      //  4. The same message is still just above the text box.
      // (The "text box grows to a second line" row doesn't need the keyboard itself,
      // but on a phone the keyboard is open while typing, so it's kept with the others.)
    });
  }

  test.fixme('LA-QA-5: Stop glides to its notice on phones', { ...QA_PHONE_TAGS, annotation: NEEDS_KEYBOARD }, async () => {
    // Not on Sefaria/ai-chatbot#242, which has no Stop button.
    // Steps on a real phone (or with a keyboard simulation):
    //  1. haveLongConversation(la, mock); mock.holdAnswers(); ask a question so an answer is generating.
    //  2. Scroll up to the middle of the chat (la.scrollChatTo(0.5)).
    //  3. Tap Stop. The chat scrolls smoothly (not a jump) to the bottom, with the stop notice in view.
    //  4. The question is back in the text box, and the keyboard stays closed.
  });
});

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

test.describe('Library Assistant QA — sending (phone)', () => {
  test('LA-QA-8: Sending glides to the thinking message on phones', QA_PHONE_TAGS, async ({ context }) => {
    test.setTimeout(t(90000));
    test.info().annotations.push({ type: 'skipped step', description: `"the chat never jumps up first while the keyboard closes" — ${NO_KEYBOARD}` });
    const { mock, la } = await start(context);
    await haveLongConversation(la, mock);

    const middle = await la.scrollChatTo(0.5);
    const { maxScroll } = await la.chatScroll();
    expect(middle, 'the chat should be scrolled up to the middle').toBeGreaterThan(2);
    expect(maxScroll - middle, 'the chat should be scrolled up to the middle').toBeGreaterThan(2);

    mock.holdAnswers(); // keep the thinking message on screen
    const frames = await la.sendAndWatchChatScroll(NEW_QUESTION);
    await la.expectChatAtBottom();
    const glide = analyzeSlide(frames.map((f) => ({ t: f.t, v: f.scrollTop })));
    expect(glide.endValue, 'the chat should scroll down').toBeGreaterThan(glide.startValue);
    expect(glide.inBetweenFrames, 'the chat should scroll smoothly, not jump').toBeGreaterThanOrEqual(2);
    const upward = frames.findIndex((f, i) => i > 0 && f.scrollTop < frames[i - 1].scrollTop - 1);
    expect(upward, `the chat should never scroll up on the way down (it did at ${Math.round(frames[upward]?.t ?? 0)}ms)`).toBe(-1);

    await la.expectInChatView(NEW_QUESTION);
    await la.expectThinkingInChatView();
    mock.releaseAnswers();
  });
});

// ---------------------------------------------------------------------------
// LA-QA-6 / LA-QA-7: where the chat is when the assistant reopens
// ---------------------------------------------------------------------------

test.describe('Library Assistant QA — reopening (phone)', () => {
  test('LA-QA-6: Reopening lands on the start of an answer that arrived while closed — not the top or the end of the chat (phone)', QA_DESKTOP_PHONE_TAGS, async ({ context }) => {
    test.setTimeout(t(90000));
    const { mock, la } = await start(context);
    await haveLongConversation(la, mock);

    // Ask, and close the assistant before the answer arrives.
    const asked = mock.questions.length;
    mock.answerNextWith(longAnswer(LATE_LABEL));
    mock.holdAnswers();
    await la.askQuestion(LATE_QUESTION);
    await mock.waitForQuestion(asked + 1);
    await la.closeWithMinimize();

    // The answer arrives while it's closed.
    mock.releaseAnswers();
    await la.expectAnswerReadyDot();

    await la.openWithAskButton();
    await la.expectChatShowsStartOf(longAnswerStart(LATE_LABEL), { notTopOrEnd: true });
  });

  test('LA-QA-7: Reopening returns to where the visitor left the chat; after a reload it opens at the bottom (phone)', QA_DESKTOP_PHONE_TAGS, async ({ context }) => {
    test.setTimeout(t(90000));
    const { page, mock, la } = await start(context);
    const latestMessage = await haveLongConversation(la, mock);

    // Scroll partway up, then close. No answer arrives while it's closed.
    const leftAt = await la.scrollChatTo(0.4);
    const { maxScroll } = await la.chatScroll();
    expect(leftAt, 'the chat should be scrolled partway up').toBeGreaterThan(2);
    expect(maxScroll - leftAt, 'the chat should be scrolled partway up').toBeGreaterThan(2);
    await la.closeWithMinimize();

    // Reopen without reloading: right where the visitor left it.
    await la.openWithAskButton();
    await la.expectChatScrolledTo(leftAt);

    // After a reload, the remembered place is gone: it opens at the bottom.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await hideAllModalsAndPopups(page);
    await la.waitForReady();
    await la.ensureClosed();
    await la.openWithAskButton();
    await la.expectInChatView(latestMessage);
    await la.expectChatAtBottom();
  });
});
