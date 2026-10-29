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
 * LA-QA-3, LA-QA-5, LA-QA-8, and the phone half of LA-QA-6 and LA-QA-7.
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
 * A browser emulating a phone has no on-screen keyboard, so the keyboard stories
 * are left to manual QA on a real phone: LA-QA-2, and LA-QA-3's rows where the
 * keyboard opens or closes. LA-QA-3's "text box grows to a second line" row and
 * LA-QA-5 don't need the keyboard, and run here. LA-QA-8 runs, except for its
 * keyboard step.
 *
 * Run: npx playwright test --config=playwright.mobileweb.config.ts library-assistant-qa-phone
 */

const PHONE = { width: 393, height: 852 };
const QA_PHONE_TAGS = { tag: ['@qa', '@e2e', '@phone'] };
const QA_DESKTOP_PHONE_TAGS = { tag: ['@qa', '@e2e', '@desktop', '@phone'] };
/** Why LA-QA-8 skips its keyboard step (shows in the test report). */
const NO_KEYBOARD = 'A browser emulating a phone has no on-screen keyboard; this needs a real phone';

const LATE_QUESTION = 'Where does the Talmud discuss Hanukkah lights? (asked, then closed)';
const LATE_LABEL = 'Late answer';
const NEW_QUESTION = 'And where is the blessing over the lights discussed?';
/** LA-QA-3: long enough to wrap to a second line in the phone's text box, not a third. */
const TWO_LINE_QUESTION = 'And where is the blessing over the Hanukkah lights discussed in the Talmud?';

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
// LA-QA-3 / LA-QA-5: where the chat is when the text box grows, or on Stop
// ---------------------------------------------------------------------------

test.describe('Library Assistant QA — keeping the chat in place (phone)', () => {
  test('LA-QA-3: The chat keeps its place — scrolled to the middle, when the text box grows to a second line, the message just above the text box is still there', QA_PHONE_TAGS, async ({ context }) => {
    test.setTimeout(t(90000));
    const { mock, la } = await start(context);
    await haveLongConversation(la, mock);

    const middle = await la.scrollChatTo(0.5);
    const { maxScroll } = await la.chatScroll();
    expect(middle, 'the chat should be scrolled up to the middle').toBeGreaterThan(2);
    expect(maxScroll - middle, 'the chat should be scrolled up to the middle').toBeGreaterThan(2);

    const oneLine = await la.textBoxHeight();
    const before = await la.chatBottomEdge();
    await la.typeInTextBox(TWO_LINE_QUESTION);
    await expect.poll(() => la.textBoxHeight(), { timeout: t(5000), message: 'the text box should grow to a second line' })
      .toBeGreaterThan(oneLine + 5);
    await expect.poll(async () => (await la.chatBottomEdge()).height, { timeout: t(5000), message: 'the chat area should get shorter' })
      .toBeLessThan(before.height - 5);
    await expect.poll(async () => Math.abs((await la.chatBottomEdge()).contentAtBottom - before.contentAtBottom), {
      timeout: t(5000), message: 'the same message should still be just above the text box',
    }).toBeLessThanOrEqual(2);
  });

  test('LA-QA-5: Stop glides to its notice on phones', QA_PHONE_TAGS, async ({ context }) => {
    test.setTimeout(t(90000));
    const { mock, la } = await start(context);
    await haveLongConversation(la, mock);

    // Ask, and keep the answer generating (sending scrolls the chat to the bottom first).
    const asked = mock.questions.length;
    mock.holdAnswers();
    await la.askQuestion(NEW_QUESTION);
    await mock.waitForQuestion(asked + 1);
    await la.expectThinkingInChatView();
    await la.expectChatAtBottom();

    const middle = await la.scrollChatTo(0.5);
    const { maxScroll } = await la.chatScroll();
    expect(middle, 'the chat should be scrolled up to the middle').toBeGreaterThan(2);
    expect(maxScroll - middle, 'the chat should be scrolled up to the middle').toBeGreaterThan(2);

    const frames = await la.stopAndWatchChatScroll();
    await la.expectChatAtBottom();
    const glide = analyzeSlide(frames.map((f) => ({ t: f.t, v: f.scrollTop })));
    expect(glide.endValue, 'the chat should scroll down').toBeGreaterThan(glide.startValue);
    expect(glide.inBetweenFrames, 'the chat should scroll smoothly, not jump').toBeGreaterThanOrEqual(2);
    await la.expectStopNoticeInChatView();

    // The question is back in the text box. A phone's keyboard opens only for a focused
    // text box, so "the keyboard stays closed" is "the text box isn't focused".
    await la.expectTextBoxHolds(NEW_QUESTION);
    await la.expectTextBoxNotFocused();
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
