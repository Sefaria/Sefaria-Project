import { test, expect, BrowserContext } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
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
 * Written TEST-FIRST, so some are expected to fail until the changes land
 * (for example the header pill's short label, `header.library_assistant_short`,
 * isn't in Sefaria's translation files on every branch yet).
 *
 * How they run: the same setup as library-assistant-q4-desktop.spec.ts — logged in
 * as the Library-Assistant test account, fake chat server, copy read by translation key.
 *
 * LA-QA-4's logged-out rows are test.fixme placeholders: the assistant (and so the
 * header pill) only shows to logged-out visitors on builds that have the logged-out
 * assistant (Sefaria/Sefaria-Project#3791). The signed-in row runs everywhere.
 *
 * Run: npx playwright test --project=chrome-assistant library-assistant-qa-desktop
 */

const DESKTOP = { width: 1280, height: 800 };
const QA_DESKTOP_TAGS = { tag: ['@qa', '@e2e', '@desktop'] };
const QA_DESKTOP_PHONE_TAGS = { tag: ['@qa', '@e2e', '@desktop', '@phone'] };
/** Why the logged-out rows are placeholders (shows in the test report). */
const NOT_BUILT = {
  type: 'not built yet',
  description: 'The assistant for logged-out visitors (and its header pill) is not on this build',
};
const LATE_QUESTION = 'Where does the Talmud discuss Hanukkah lights? (asked, then closed)';
const LATE_LABEL = 'Late answer';

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

    if (who === 'logged out') {
      test.fixme(title, { ...QA_DESKTOP_TAGS, annotation: NOT_BUILT }, async () => {
        // Steps once it's built:
        //  1. goToPageWithLang(context, MODULE_URLS.<EN|HE>.LIBRARY, lang) — logged out.
        //  2. la.expectHeaderPillShows(pill).
        //  3. Unless the pill is hidden: la.expectHeaderPillAtLeastFromDonate(16).
        //  4. la.expectNoHeaderIconCutOff().
      });
      return;
    }

    test(title, QA_DESKTOP_TAGS, async ({ context }) => {
      const { la } = await start(context, lang);
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
