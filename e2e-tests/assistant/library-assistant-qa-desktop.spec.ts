import { test, expect, BrowserContext } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
import { ChatServerMock } from '../support/chatServerMock';
import { haveLongConversation, longAnswer, longAnswerStart } from '../support/longConversation';

/**
 * Library Assistant "QA changes" (LA-QA-*) on desktop — the stories tagged @desktop:
 * LA-QA-4 (header pill), and the desktop half of LA-QA-6 and LA-QA-7.
 * The phone stories live in e2e-tests/mobile web/library-assistant-qa-phone.spec.ts.
 * (There is no LA-QA-1: that change was tried and dropped.)
 *
 * Every test is tagged @qa, so these can run apart from the original-spec stories:
 *   npx playwright test --project=chrome-assistant --grep @qa
 *
 * How they run: the same setup as library-assistant-q4-desktop.spec.ts — logged in
 * as the Library-Assistant test account, fake chat server, copy read by translation key.
 * LA-QA-4's logged-out rows run as a visitor nobody logged in as.
 *
 * Run: npx playwright test --project=chrome-assistant library-assistant-qa-desktop
 */

const DESKTOP = { width: 1280, height: 800 };
const QA_DESKTOP_TAGS = { tag: ['@qa', '@e2e', '@desktop'] };
const QA_DESKTOP_PHONE_TAGS = { tag: ['@qa', '@e2e', '@desktop', '@phone'] };
const LATE_QUESTION = 'Where does the Talmud discuss Hanukkah lights? (asked, then closed)';
const LATE_LABEL = 'Late answer';

test.use({ viewport: DESKTOP });

/**
 * Standard start: fake chat server first (it must be in place before the page
 * loads), then log in (or, with `loggedOut`, stay a visitor nobody logged in as),
 * then make sure the assistant is closed so the test starts from the Ask button.
 */
async function start(context: BrowserContext, lang = LANGUAGES.EN, opts: { loggedOut?: boolean } = {}) {
  const mock = await ChatServerMock.install(context);
  const isHebrew = lang === LANGUAGES.HE;
  const url = isHebrew ? MODULE_URLS.HE.LIBRARY : MODULE_URLS.EN.LIBRARY;
  const page = opts.loggedOut
    ? await goToPageWithLang(context, url, lang)
    : await goToPageWithUser(context, url, isHebrew ? BROWSER_SETTINGS.heLAUser : BROWSER_SETTINGS.enLAUser);
  const pm = new PageManager(page, lang);
  await hideAllModalsAndPopups(page);
  const la = pm.onLibraryAssistantQ4();
  await la.waitForReady();
  await la.ensureClosed();
  return { page, mock, la };
}

// ---------------------------------------------------------------------------
// LA-QA-4: the header pill shortens or hides where the header is crowded
// ---------------------------------------------------------------------------

type PillLabel = 'full' | 'short' | 'hidden';
const PILL_WORDING: Record<PillLabel, string> = {
  hidden: 'is hidden',
  short: 'reads "✦ Ask" [header.library_assistant_short]',
  full: 'reads "✦ Library Assistant" [header.library_assistant]',
};

const pillExamples: Array<{ who: 'logged out' | 'signed in'; lang: string; label: string; width: number; pill: PillLabel }> = [
  { who: 'logged out', lang: LANGUAGES.EN, label: 'English', width: 870, pill: 'hidden' },
  { who: 'logged out', lang: LANGUAGES.EN, label: 'English', width: 930, pill: 'short' },
  { who: 'logged out', lang: LANGUAGES.EN, label: 'English', width: 1000, pill: 'short' },
  { who: 'logged out', lang: LANGUAGES.EN, label: 'English', width: 1100, pill: 'short' },
  { who: 'logged out', lang: LANGUAGES.EN, label: 'English', width: 1280, pill: 'full' },
  { who: 'signed in', lang: LANGUAGES.EN, label: 'English', width: 930, pill: 'short' },
  { who: 'logged out', lang: LANGUAGES.HE, label: 'Hebrew', width: 870, pill: 'hidden' },
  { who: 'logged out', lang: LANGUAGES.HE, label: 'Hebrew', width: 1100, pill: 'short' },
];

for (const { who, lang, label, width, pill } of pillExamples) {
  test.describe(`Library Assistant QA — header pill, ${who}, ${label}, ${width}px`, () => {
    test.use({ viewport: { width, height: DESKTOP.height } });
    const title = `LA-QA-4: ${who}, ${label}, ${width}px — the header pill ${PILL_WORDING[pill]}, at least 16px from "Donate", no header icon cut off`;

    test(title, QA_DESKTOP_TAGS, async ({ context }) => {
      const { la } = await start(context, lang, { loggedOut: who === 'logged out' });
      await la.expectHeaderPillShows(pill);
      if (pill !== 'hidden') await la.expectHeaderPillAtLeastFromDonate(16);
      await la.expectNoHeaderIconCutOff();
    });
  });
}

// ---------------------------------------------------------------------------
// LA-QA-6 / LA-QA-7: where the chat is when the assistant reopens
// ---------------------------------------------------------------------------

test.describe('Library Assistant QA — reopening (desktop)', () => {
  test('LA-QA-6: Reopening lands on the start of an answer that arrived while closed — not the top or the end of the chat', QA_DESKTOP_PHONE_TAGS, async ({ context }) => {
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

  test('LA-QA-7: Reopening returns to where the visitor left the chat; after a reload it opens at the bottom', QA_DESKTOP_PHONE_TAGS, async ({ context }) => {
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
