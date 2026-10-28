import { test, expect, BrowserContext } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups, installEntitySearchMock } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { SearchPage, SearchTabId } from '../pages/searchPage';
import { LibraryAssistantQ4Page } from '../pages/libraryAssistantQ4Page';
import { MODULE_URLS, MODULE_TEXTS, librarySearchUrl } from '../constants';
import { ChatServerMock } from '../support/chatServerMock';
import { noResultsAssistantBody, sefariaString } from '../support/assistantStrings';
import { installNullStateRecorder, readNullStateRecords } from '../support/nullStateRecorder';
import { TOPIC_HITS } from '../fixtures/entitySearchFixtures';
import { longAnswer } from '../support/longConversation';

/**
 * "Search with no results" (LA-NULL-*) — the stories tagged @desktop.
 * LA-NULL-1, LA-NULL-5 and LA-NULL-16 are also tagged @phone; their phone runs,
 * and the phone-only LA-NULL-19, live in
 * e2e-tests/mobile web/library-assistant-null-search-phone.spec.ts.
 *
 * With the assistant on, "Library Assistant" (עוזר הספרייה) in the page's text is a
 * link that asks the assistant about the search, just like the floating
 * "Search with Library Assistant" button; the two share one "already asked"
 * (LA-NULL-13, LA-NULL-16 → LA-NULL-18). LA-NULL-18 also needs the ai-chatbot
 * widget change from Sefaria/ai-chatbot#242 (commit 0efd3cf).
 *
 * Written TEST-FIRST: parts of this feature are not built yet (for example the
 * assistant version of the empty-search text, and the assistant for logged-out
 * visitors), so some of these tests are expected to fail until it lands.
 *
 * How they run:
 *  - Desktop config (playwright.config.ts → chrome-assistant), window 1280 × 800.
 *  - "Assistant on" = the Library-Assistant test account (enLAUser / heLAUser).
 *    "Assistant off" = the standard test account (enUser), which never gets the assistant.
 *  - The chat server is faked inside the browser (support/chatServerMock.ts),
 *    so no AI backend is needed and we can see exactly which questions were sent.
 *  - The Books / Authors / Topics tabs get their results from a fake
 *    /api/entity-search (utils.installEntitySearchMock), so "no results" is
 *    guaranteed. The Sources tab uses the real search, where "qqzzxxvvkk" finds nothing.
 *  - Copy is read by translation key (support/assistantStrings.ts), never by
 *    matching words. That includes the question the button sends:
 *    `search.no_results.library_assistant_question` (added in commit f55ec7e3bf), so we
 *    no longer need to copy it from the story text.
 *
 * Logged-out stories LA-NULL-8 → LA-NULL-12 run as a visitor nobody logged in as
 * (goToPageWithLang). The fake chat server gives them a few free answers and counts
 * them the way ai-chatbot's server does (server/chat/anon_access.py), including the
 * rule that the empty-search question never uses up the last one, once per visitor.
 * The widget sends that question with context.source "search_no_results", which is
 * how the server tells it apart. The logged-out rows of LA-NULL-1 and LA-NULL-16, and
 * the logged-out LA-NULL-17, are still test.fixme placeholders.
 *
 * Run: npx playwright test --project=chrome-assistant library-assistant-null-search-desktop
 */

const DESKTOP = { width: 1280, height: 800 };
const DESKTOP_TAGS = { tag: ['@e2e', '@desktop'] };
const DESKTOP_PHONE_TAGS = { tag: ['@e2e', '@desktop', '@phone'] };
/** Why the logged-out stories are placeholders (shows in the test report). */
const NOT_BUILT = {
  type: 'not built yet',
  description: 'The assistant for logged-out visitors (with its free-answer count and login prompt) does not exist yet',
};
const LOGGED_OUT_TAGS = { ...DESKTOP_TAGS, annotation: NOT_BUILT };

const QUERY = 'qqzzxxvvkk';
const SECOND_QUERY = 'kkvvxxzzqq';
const EARLIER_QUESTION = 'Where does the Talmud discuss Hanukkah lights?';
const EARLIER_ANSWER = 'Hanukkah lights are discussed in Shabbat 21b (earlier answer).';
const SEARCH_ANSWER = 'Here are some places to look (answer to the search question).';

const NO_ENTITY_HITS = { topic: [], author: [], book: [] };

/** LA-NULL-2: where the Browse button points on each tab. */
const BROWSE_HREFS: Record<SearchTabId, string> = {
  sources: '/texts',
  books: '/texts',
  authors: '/people',
  topics: '/topics',
};
const ALL_TABS: SearchTabId[] = ['sources', 'books', 'authors', 'topics'];

/** LA-NULL-16: the link's color, #7C416F (mussar purple), the way getComputedStyle reports it. */
const MUSSAR_PURPLE = 'rgb(124, 65, 111)';
/**
 * LA-NULL-16: the word the text breaks after. The story names the word itself
 * ("or" / "או"); it is part of a longer sentence, so it has no translation key of its own.
 */
const LAST_OR: Record<string, string> = { [LANGUAGES.EN]: 'or', [LANGUAGES.HE]: 'או' };

test.use({ viewport: DESKTOP });

/** The question the button asks, in the given interface language, with the search filled in. */
function searchQuestion(query: string, lang = LANGUAGES.EN): string {
  return sefariaString('search.no_results.library_assistant_question', lang).replace(/\{query\}/g, () => query);
}

/**
 * Assistant-on start: fake chat server and fake entity search first (both must
 * be in place before the page loads), then log in on the library home page and
 * make sure the assistant is closed, so the test starts from the "✦ Ask" button.
 */
async function startWithAssistant(
  context: BrowserContext,
  opts: { lang?: string; entityHits?: Record<string, unknown[]> } = {},
) {
  const lang = opts.lang ?? LANGUAGES.EN;
  const isHebrew = lang === LANGUAGES.HE;
  const mock = await ChatServerMock.install(context, { listAskedChats: true });
  await installEntitySearchMock(context, opts.entityHits ?? NO_ENTITY_HITS);
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
  return { page, mock, la, search: pm.onSearchPage() };
}

/**
 * Search for `query` from the header and wait until the empty-search box is the one
 * for THIS search (its heading names the query) — after a second search the previous
 * search's box can still be on screen for a moment.
 */
async function searchWithNoResults(search: SearchPage, query = QUERY) {
  await search.submitHeaderSearch(query);
  await search.waitForNullState();
  await expect.poll(() => search.nullStateHeadingText(), { message: `empty-search box for "${query}"` }).toContain(query);
}

/** Open the empty search straight from its URL, as `profile`, on `tab`. */
async function openEmptySearch(context: BrowserContext, profile: typeof BROWSER_SETTINGS.enUser, tab: SearchTabId) {
  await ChatServerMock.install(context);
  await installEntitySearchMock(context, NO_ENTITY_HITS);
  const page = await goToPageWithUser(context, librarySearchUrl(QUERY), profile);
  const pm = new PageManager(page, LANGUAGES.EN);
  await hideAllModalsAndPopups(page);
  const search = pm.onSearchPage();
  await search.selectTab(tab);
  await search.waitForNullState();
  return { page, search };
}

/** LA-NULL-16: the assistant's name in the text is a purple, underlined link, starting the line after the last "or". */
async function expectAssistantNameIsLink(search: SearchPage, lang: string) {
  const look = await search.nullStateAssistantLinkLook();
  expect(look.color, 'the link should be mussar purple, #7C416F').toBe(MUSSAR_PURPLE);
  expect(look.underlined, 'the link should be underlined').toBe(true);
  await search.expectLineBreakAfterLastOr(LAST_OR[lang]);
}

/** Click the "Search with Library Assistant" button, or the assistant's name in the text; either way the assistant opens. */
async function clickToAsk(which: 'link' | 'button', la: LibraryAssistantQ4Page, search: SearchPage) {
  if (which === 'link') {
    await search.clickNullStateAssistantLink();
    await la.expectAssistantOpen();
  } else {
    await la.clickSearchLauncher();
  }
}

// ---------------------------------------------------------------------------
// LA-NULL-1 / LA-NULL-2 / LA-NULL-3: the page's own text and button
// ---------------------------------------------------------------------------

const assistantOnExamples: Array<{ who: 'logged out' | 'logged in with the assistant on'; tab: SearchTabId }> = [
  { who: 'logged out', tab: 'sources' },
  { who: 'logged in with the assistant on', tab: 'books' },
  { who: 'logged in with the assistant on', tab: 'authors' },
  { who: 'logged in with the assistant on', tab: 'topics' },
];

test.describe('Search with no results — assistant on: the page text (desktop)', () => {
  for (const { who, tab } of assistantOnExamples) {
    const title = `LA-NULL-1: Assistant on, ${who}, ${tab} tab — no button on the page, assistant copy, "Library Assistant" on one line and a link`;

    if (who === 'logged out') {
      test.fixme(title, { ...DESKTOP_PHONE_TAGS, annotation: NOT_BUILT }, async () => {
        // Steps once it's built:
        //  1. goToPageWithLang(context, librarySearchUrl(QUERY), LANGUAGES.EN) — logged out.
        //  2. selectTab(tab); waitForNullState().
        //  3. Same four checks as the logged-in rows below.
      });
      continue;
    }

    test(title, DESKTOP_PHONE_TAGS, async ({ context }) => {
      const { search } = await openEmptySearch(context, BROWSER_SETTINGS.enLAUser, tab);
      // A link in the sentence isn't a button, so it doesn't count here (see nullStateButtonHrefs).
      expect(await search.nullStateButtonHrefs(), 'no button on the page itself').toEqual([]);
      await expect.poll(() => search.nullStateBodyText(), { message: 'assistant version of the text' })
        .toBe(noResultsAssistantBody(tab, LANGUAGES.EN));
      const phrase = sefariaString('header.library_assistant', LANGUAGES.EN);
      expect(await search.nullStateLinesUsedBy(phrase), `"${phrase}" should sit on one line`).toBe(1);
      await search.expectNullStateAssistantLink();
    });
  }
});

test.describe('Search with no results — assistant off: today\'s text and Browse button', () => {
  for (const tab of ALL_TABS) {
    test(`LA-NULL-2: Assistant off, ${tab} tab — one button to ${BROWSE_HREFS[tab]}, today's copy`, DESKTOP_TAGS, async ({ context }) => {
      const { search } = await openEmptySearch(context, BROWSER_SETTINGS.enUser, tab);
      expect(await search.nullStateButtonHrefs(), 'one button, the Browse link').toEqual([BROWSE_HREFS[tab]]);
      expect(await search.nullStateBodyText()).toBe(sefariaString(`search.no_results.${tab}.body`, LANGUAGES.EN));
    });
  }
});

const flashExamples = [
  { label: 'assistant on', profile: BROWSER_SETTINGS.enLAUser, assistantOn: true },
  { label: 'assistant off', profile: BROWSER_SETTINGS.enUser, assistantOn: false },
] as const;

test.describe('Search with no results — no flash of the wrong version', () => {
  for (const { label, profile, assistantOn } of flashExamples) {
    test(`LA-NULL-3: Neither version flashes first — ${label}`, DESKTOP_TAGS, async ({ context }) => {
      // Watch the empty-search box from before the page loads (support/nullStateRecorder.ts).
      await installNullStateRecorder(context);
      const { page, search } = await openEmptySearch(context, profile, 'sources');
      for (const tab of ALL_TABS.slice(1)) {
        await search.selectTab(tab);
        await search.waitForNullState();
      }

      const assistantTexts = ALL_TABS.map((tab) => noResultsAssistantBody(tab, LANGUAGES.EN));
      const plainTexts = ALL_TABS.map((tab) => sefariaString(`search.no_results.${tab}.body`, LANGUAGES.EN));
      const wrongTexts = assistantOn ? plainTexts : assistantTexts;
      const records = await readNullStateRecords(page);

      expect(records.length, 'the recorder should have seen the empty-search box').toBeGreaterThan(0);
      // While the page waits to learn whether the assistant is there, the body is in the page but
      // hidden and there's no button: the reader sees neither version, which is allowed
      const seen = records.filter((r) => r.bodyVisible || r.hasBrowseButton);
      expect(seen.length, 'the empty-search box should end up visible').toBeGreaterThan(0);
      const wrong = seen.filter((r) => r.hasBrowseButton === assistantOn || wrongTexts.includes(r.body));
      expect(wrong, `every version of the box that ever appeared (${JSON.stringify(records)})`).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// LA-NULL-5 → LA-NULL-7, LA-NULL-13 → LA-NULL-15: the Ask button
// ---------------------------------------------------------------------------

test.describe('Search with no results — the Ask button becomes the search action (desktop)', () => {
  for (const reducedMotion of [false, true]) {
    const suffix = reducedMotion ? ' (reduced motion: no animation)' : '';

    test(`LA-NULL-5: The Ask button becomes "Search with Library Assistant", keeping its star, and grows over 200ms${suffix}`, DESKTOP_PHONE_TAGS, async ({ context }) => {
      const { page, la, search } = await startWithAssistant(context);
      if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });

      const samples = await la.watchLauncherWhile(() => searchWithNoResults(search), { ms: 20000, settleAfterChangeMs: 1000 });
      await la.expectLauncherReads('search');
      await la.expectSearchLauncherHasStar();

      la.expectGrewIntoSearchLabel(samples, { reducedMotion });
    });
  }

  test('LA-NULL-6: Clicking it opens the assistant, asks about the search, and starts thinking at once', DESKTOP_TAGS, async ({ context }) => {
    const { mock, la, search } = await startWithAssistant(context);
    mock.holdAnswers(); // keep the "thinking" state on screen long enough to see it
    await searchWithNoResults(search);
    await la.expectLauncherReads('search');

    await la.clickSearchLauncher();
    await la.expectThinkingWithin(1500);
    await mock.waitForQuestion(1);
    expect(mock.questions).toEqual([searchQuestion(QUERY)]);
    await la.expectConversationContains(searchQuestion(QUERY));
    mock.releaseAnswers();
  });

  test('LA-NULL-7: Signed in — the question starts a new chat, and the earlier chat stays in history', DESKTOP_TAGS, async ({ context }) => {
    const { mock, la, search } = await startWithAssistant(context);
    // An earlier conversation, still open in the assistant.
    mock.answerNextWith(EARLIER_ANSWER);
    await la.openWithAskButton();
    await la.askQuestion(EARLIER_QUESTION);
    await la.expectConversationContains(EARLIER_ANSWER);
    await la.closeWithMinimize();

    await searchWithNoResults(search);
    mock.answerNextWith(SEARCH_ANSWER);
    await la.clickSearchLauncher();
    await mock.waitForQuestion(2);
    expect(mock.asked[1].text).toBe(searchQuestion(QUERY));
    expect(mock.asked[1].sessionId, 'the search question should go to a new chat').not.toBe(mock.asked[0].sessionId);
    await la.expectConversationContains(SEARCH_ANSWER);
    await la.expectConversationLacks(EARLIER_QUESTION);

    await la.expectChatInHistory(EARLIER_QUESTION);
  });

  test('LA-NULL-13: It asks once per search', DESKTOP_TAGS, async ({ context }) => {
    const { mock, la, search } = await startWithAssistant(context);
    await searchWithNoResults(search);
    mock.answerNextWith(SEARCH_ANSWER);
    await la.clickSearchLauncher();
    await mock.waitForQuestion(1);
    await la.expectConversationContains(SEARCH_ANSWER);

    // Close and click again: same chat, nothing new sent.
    await la.closeWithMinimize('search');
    await la.clickSearchLauncher();
    await la.expectConversationContains(searchQuestion(QUERY));
    await mock.expectQuestionCountStays(1);
    await la.closeWithMinimize('search');

    // The link in the text counts as the same button: the button asked first, so the link just reopens the chat.
    await clickToAsk('link', la, search);
    await la.expectConversationContains(searchQuestion(QUERY));
    await mock.expectQuestionCountStays(1);
    await la.closeWithMinimize('search');

    // Another empty tab of the same search: the label never flips back to "Ask", even for a frame.
    const frames = await la.watchLauncherWhile(async () => {
      await search.selectTab('books');
      await search.waitForNullState();
    }, { ms: 1500 });
    const notSearchLabel = frames.filter((f) => f.label !== la.searchLabel);
    expect(notSearchLabel, 'every frame should show "Search with Library Assistant"').toEqual([]);
    await la.clickSearchLauncher();
    await mock.expectQuestionCountStays(1);
    await la.closeWithMinimize('search');

    // A different empty search is asked once.
    await searchWithNoResults(search, SECOND_QUERY);
    await la.expectLauncherReads('search');
    await la.clickSearchLauncher();
    await mock.waitForQuestion(2);
    expect(mock.questions[1]).toBe(searchQuestion(SECOND_QUERY));
    await mock.expectQuestionCountStays(2);
  });

  test('LA-NULL-14: Results bring back "Ask" — moving to a tab with results', DESKTOP_TAGS, async ({ context }) => {
    // Topics has results for this search; Sources (real search) and Books / Authors don't.
    const { la, search } = await startWithAssistant(context, { entityHits: { ...NO_ENTITY_HITS, topic: TOPIC_HITS } });
    await searchWithNoResults(search);
    await la.expectLauncherReads('search');

    await search.selectTab('topics');
    await search.waitForResultCards();
    await la.expectLauncherReads('ask');
  });

  test('LA-NULL-14: Results bring back "Ask" — leaving the search page', DESKTOP_TAGS, async ({ context }) => {
    const { page, la, search } = await startWithAssistant(context);
    await searchWithNoResults(search);
    await la.expectLauncherReads('search');

    // Leave through the header's Texts link (in-app, no full reload). Not the Back button:
    // one header search leaves two history entries (with and without `search_tab`), so a
    // single Back stays on the search page.
    await new PageManager(page, LANGUAGES.EN).onModuleHeader()
      .clickAndVerifyNavigation(MODULE_TEXTS.LIBRARY.EN.TEXTS_LINK, /\/texts/);
    await la.expectLauncherReads('ask');
  });
});

test.describe('Search with no results — Hebrew interface', () => {
  test('LA-NULL-15: Hebrew — the button shows the Hebrew search label and sends the Hebrew question; so does the link in the text', { tag: ['@e2e', '@desktop', '@he'] }, async ({ context }) => {
    const { mock, la, search } = await startWithAssistant(context, { lang: LANGUAGES.HE });
    await searchWithNoResults(search);
    await la.expectLauncherReads('search'); // the label is looked up in he.json

    await la.clickSearchLauncher();
    await mock.waitForQuestion(1);
    expect(mock.questions).toEqual([searchQuestion(QUERY, LANGUAGES.HE)]);

    // "עוזר הספרייה" in the text (found by the Hebrew value of header.library_assistant) is a
    // link that sends the same Hebrew question. The button already asked about this search,
    // so try the link on a new one.
    await la.closeWithMinimize('search');
    await searchWithNoResults(search, SECOND_QUERY);
    await clickToAsk('link', la, search);
    await mock.waitForQuestion(2);
    expect(mock.questions[1]).toBe(searchQuestion(SECOND_QUERY, LANGUAGES.HE));
  });
});

// ---------------------------------------------------------------------------
// LA-NULL-16 → LA-NULL-18: the assistant's name in the text is a link
// ---------------------------------------------------------------------------

const inlineLinkExamples = [
  { who: 'logged out', lang: LANGUAGES.EN, label: 'English' },
  { who: 'logged in with the assistant on', lang: LANGUAGES.HE, label: 'Hebrew' },
] as const;

test.describe('Search with no results — the assistant\'s name in the text is a link (desktop)', () => {
  for (const { who, lang, label } of inlineLinkExamples) {
    const title = `LA-NULL-16: ${who}, ${label} — the assistant's name in the text is a purple underlined link, starting the line after the last "or" (every tab)`;

    if (who === 'logged out') {
      test.fixme(title, { ...DESKTOP_PHONE_TAGS, annotation: NOT_BUILT }, async () => {
        // Steps once it's built:
        //  1. goToPageWithLang(context, librarySearchUrl(QUERY), LANGUAGES.EN) — logged out.
        //  2. For each tab: selectTab(tab); waitForNullState(); expectAssistantNameIsLink(search, LANGUAGES.EN).
      });
      continue;
    }

    test(title, { tag: ['@e2e', '@desktop', '@phone', '@he'] }, async ({ context }) => {
      const { search } = await startWithAssistant(context, { lang });
      await searchWithNoResults(search);
      for (const tab of ALL_TABS) {
        await search.selectTab(tab);
        await search.waitForNullState();
        await expectAssistantNameIsLink(search, lang);
      }
    });
  }

  test('LA-NULL-17: Clicking the link opens the assistant and sends the same question as "Search with Library Assistant"', DESKTOP_TAGS, async ({ context }) => {
    const { mock, la, search } = await startWithAssistant(context);
    mock.holdAnswers(); // keep the "thinking" state on screen long enough to see it
    await searchWithNoResults(search);
    await la.expectLauncherReads('search');

    await clickToAsk('link', la, search);
    await la.expectThinkingWithin(1500);
    await mock.waitForQuestion(1);
    // The button's question, read by key: the link must send exactly the same text.
    expect(mock.questions).toEqual([searchQuestion(QUERY)]);
    await la.expectConversationContains(searchQuestion(QUERY));
    mock.releaseAnswers();
  });

  test('LA-NULL-17: The link, signed in — the question starts a new chat, and the earlier chat stays in history (LA-NULL-7)', DESKTOP_TAGS, async ({ context }) => {
    const { mock, la, search } = await startWithAssistant(context);
    // An earlier conversation, still open in the assistant.
    mock.answerNextWith(EARLIER_ANSWER);
    await la.openWithAskButton();
    await la.askQuestion(EARLIER_QUESTION);
    await la.expectConversationContains(EARLIER_ANSWER);
    await la.closeWithMinimize();

    await searchWithNoResults(search);
    mock.answerNextWith(SEARCH_ANSWER);
    await clickToAsk('link', la, search);
    await mock.waitForQuestion(2);
    expect(mock.asked[1].text).toBe(searchQuestion(QUERY));
    expect(mock.asked[1].sessionId, 'the search question should go to a new chat').not.toBe(mock.asked[0].sessionId);
    await la.expectConversationContains(SEARCH_ANSWER);
    await la.expectConversationLacks(EARLIER_QUESTION);

    await la.expectChatInHistory(EARLIER_QUESTION);
  });

  test.fixme('LA-NULL-17: The link, logged out — LA-NULL-8 to LA-NULL-12 hold for the link as for the button', LOGGED_OUT_TAGS, async () => {
    // Steps once it's built: run each of LA-NULL-8 → LA-NULL-12 (below) with
    // clickToAsk('link', la, search) in place of la.clickSearchLauncher().
  });

  // The story says to run it both ways: link first, then button first.
  for (const first of ['link', 'button'] as const) {
    const other = first === 'link' ? 'button' : 'link';

    test(`LA-NULL-18: The link and the button ask once between them — ${first} first`, DESKTOP_TAGS, async ({ context }) => {
      const { mock, la, search } = await startWithAssistant(context);
      await searchWithNoResults(search);
      mock.answerNextWith(SEARCH_ANSWER);
      await clickToAsk(first, la, search);
      await mock.waitForQuestion(1);
      await la.expectConversationContains(SEARCH_ANSWER);

      // Close, then click the other one, then the same one again: each time the same chat
      // reopens and no second question is sent.
      for (const again of [other, first] as const) {
        await la.closeWithMinimize('search');
        await clickToAsk(again, la, search);
        await la.expectConversationContains(searchQuestion(QUERY));
        await la.expectConversationContains(SEARCH_ANSWER);
        await mock.expectQuestionCountStays(1);
      }
      await la.closeWithMinimize('search');

      // A different search with no results: the link asks it once.
      await searchWithNoResults(search, SECOND_QUERY);
      await clickToAsk('link', la, search);
      await mock.waitForQuestion(2);
      expect(mock.questions[1]).toBe(searchQuestion(SECOND_QUERY));
      await la.closeWithMinimize('search');
      await clickToAsk('link', la, search);
      await mock.expectQuestionCountStays(2);
    });
  }
});

// ---------------------------------------------------------------------------
// LA-NULL-8 → LA-NULL-12: logged out, with a few free answers
// ---------------------------------------------------------------------------

/**
 * Logged-out start: like startWithAssistant, but nobody is logged in, and the fake
 * chat server gives this visitor `freeAnswers` free answers.
 */
async function startLoggedOut(context: BrowserContext, freeAnswers: number) {
  const mock = await ChatServerMock.install(context, { freeAnswers });
  await installEntitySearchMock(context, NO_ENTITY_HITS);
  const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
  const pm = new PageManager(page, LANGUAGES.EN);
  await hideAllModalsAndPopups(page);
  const la = pm.onLibraryAssistantQ4();
  await la.waitForReady();
  await la.ensureClosed();
  return { page, mock, la, search: pm.onSearchPage() };
}

/**
 * Ask `question` from "✦ Ask", wait for `answer`, and close the assistant again.
 * `answerShows` is text the answer shows on screen, when `answer` is HTML.
 */
async function askFromAskButton(la: LibraryAssistantQ4Page, mock: ChatServerMock, question: string, answer: string, answerShows = answer) {
  mock.answerNextWith(answer);
  await la.openWithAskButton();
  await la.askQuestion(question);
  await la.expectConversationContains(answerShows);
  await la.closeWithMinimize();
}

/** Click "Search with Library Assistant" on the empty search for `query` and wait for the answer. */
async function askAboutSearch(la: LibraryAssistantQ4Page, mock: ChatServerMock, search: SearchPage, query = QUERY) {
  await searchWithNoResults(search, query);
  const count = mock.questions.length;
  mock.answerNextWith(SEARCH_ANSWER);
  await la.clickSearchLauncher();
  await mock.waitForQuestion(count + 1);
  expect(mock.asked[count].text).toBe(searchQuestion(query));
  expect(mock.asked[count].source, 'the widget should say the question is from the empty search').toBe('search_no_results');
  await la.expectConversationContains(SEARCH_ANSWER);
}

const LAST_QUESTION = 'And where is the blessing over the lights?';
const LAST_ANSWER = 'The blessing is in Shabbat 23a (last answer).';

test.describe('Search with no results — logged out', () => {
  test('LA-NULL-8: Logged out — the question goes into the visitor\'s one chat, under the earlier one', DESKTOP_TAGS, async ({ context }) => {
    const { mock, la, search } = await startLoggedOut(context, 3);
    await askFromAskButton(la, mock, EARLIER_QUESTION, EARLIER_ANSWER);

    await askAboutSearch(la, mock, search);
    expect(mock.asked[1].sessionId, 'the search question should go to the same chat').toBe(mock.asked[0].sessionId);
    const text = await la.conversationText();
    for (const line of [EARLIER_QUESTION, EARLIER_ANSWER, searchQuestion(QUERY), SEARCH_ANSWER]) {
      expect(text, `the chat should still show "${line}"`).toContain(line);
    }
    expect(text.indexOf(searchQuestion(QUERY)), 'the search question should be under the earlier answer')
      .toBeGreaterThan(text.indexOf(EARLIER_ANSWER));
  });

  test('LA-NULL-9: Logged out at the limit — opens on the last chat, scrolled to the end, with the login prompt; nothing sent', DESKTOP_TAGS, async ({ context }) => {
    // One free answer, used on the earlier question: that answer brings the login prompt.
    const { mock, la, search } = await startLoggedOut(context, 1);
    await askFromAskButton(la, mock, EARLIER_QUESTION, longAnswer('Earlier answer'), 'Earlier answer, paragraph 10:');

    await searchWithNoResults(search);
    await la.expectLauncherReads('search');
    await la.clickSearchLauncher();
    await la.expectConversationContains(EARLIER_QUESTION);
    await la.expectLoginPrompt();
    await la.expectChatAtBottom();
    await mock.expectQuestionCountStays(1);
    await la.expectConversationLacks(searchQuestion(QUERY));
  });

  // Fails today, as LA-QA-7 does: ai-chatbot's openPanel (LCChatbot.svelte) ends with a
  // scrollToBottom, added with the login prompt (ai-chatbot e382ac5), that undoes the
  // "reopen where the reader left the chat" just before it. Turn this on once that's fixed.
  test.fixme('LA-NULL-9: Logged out at the limit — scrolled where the visitor left the chat during this visit (LA-QA-7); nothing sent', {
    ...DESKTOP_TAGS,
    annotation: { type: 'known bug', description: 'Reopening always scrolls to the bottom (ai-chatbot openPanel); LA-QA-7 fails the same way' },
  }, async ({ context }) => {
    test.setTimeout(t(90000));
    const { mock, la, search } = await startLoggedOut(context, 1);
    mock.answerNextWith(longAnswer('Earlier answer', 20));
    await la.openWithAskButton();
    await la.askQuestion(EARLIER_QUESTION);
    await la.expectConversationContains('Earlier answer, paragraph 20:');
    await la.expectLoginPrompt();
    const leftAt = await la.scrollChatTo(0.4);
    const { maxScroll } = await la.chatScroll();
    expect(leftAt, 'the chat should be scrolled partway up').toBeGreaterThan(2);
    expect(maxScroll - leftAt, 'the chat should be scrolled partway up').toBeGreaterThan(2);
    await la.closeWithMinimize();

    await searchWithNoResults(search);
    await la.clickSearchLauncher();
    await la.expectLoginPrompt();
    await la.expectChatScrolledTo(leftAt);
    await mock.expectQuestionCountStays(1);
  });

  test('LA-NULL-10: The search question never uses up the last free answer', DESKTOP_TAGS, async ({ context }) => {
    const { mock, la, search } = await startLoggedOut(context, 2);
    await askFromAskButton(la, mock, EARLIER_QUESTION, EARLIER_ANSWER);
    expect(mock.freeAnswersLeft(), 'one free answer left').toBe(1);

    await askAboutSearch(la, mock, search);
    await la.expectNoLoginPrompt();
    expect(await la.freeAnswersLeftInWidget(), 'the search answer should leave the last free answer').toBe(1);

    // Their own next question uses it: it is answered, and the login prompt appears.
    mock.answerNextWith(LAST_ANSWER);
    await la.askQuestion(LAST_QUESTION);
    await la.expectConversationContains(LAST_ANSWER);
    await la.expectLoginPrompt();
  });

  test('LA-NULL-11: That exception happens once per visitor', DESKTOP_TAGS, async ({ context }) => {
    const { mock, la, search } = await startLoggedOut(context, 2);
    await askFromAskButton(la, mock, EARLIER_QUESTION, EARLIER_ANSWER);
    // The first search question at the last free answer didn't count…
    await askAboutSearch(la, mock, search);
    await la.expectNoLoginPrompt();
    await la.closeWithMinimize('search');

    // …so a second one, with that same one free answer left, does.
    await askAboutSearch(la, mock, search, SECOND_QUERY);
    await la.expectLoginPrompt();
    expect(await la.freeAnswersLeftInWidget()).toBe(0);
  });

  test('LA-NULL-12: A search question counts like any other when it isn\'t the last', DESKTOP_TAGS, async ({ context }) => {
    const { mock, la, search } = await startLoggedOut(context, 2);

    await askAboutSearch(la, mock, search);
    // Nothing on screen shows the count, so check the one the widget keeps.
    expect(await la.freeAnswersLeftInWidget(), 'the search answer should use up a free answer').toBe(1);
    await la.expectNoLoginPrompt();

    // The next question is the last free one.
    mock.answerNextWith(LAST_ANSWER);
    await la.askQuestion(LAST_QUESTION);
    await la.expectConversationContains(LAST_ANSWER);
    await la.expectLoginPrompt();
  });
});
