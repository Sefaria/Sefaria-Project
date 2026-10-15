import { test, expect, BrowserContext } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups, installEntitySearchMock } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { SearchPage, SearchTabId } from '../pages/searchPage';
import { MODULE_URLS, librarySearchUrl } from '../constants';
import { ChatServerMock } from '../support/chatServerMock';
import { sefariaString } from '../support/assistantStrings';
import { installNullStateRecorder, readNullStateRecords } from '../support/nullStateRecorder';
import { TOPIC_HITS } from '../fixtures/entitySearchFixtures';

/**
 * "Search with no results" (LA-NULL-*) — the stories tagged @desktop.
 * LA-NULL-1 and LA-NULL-5 are also tagged @phone; their phone runs live in
 * e2e-tests/mobile web/library-assistant-null-search-phone.spec.ts.
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
 *    `search.null.library_assistant_question` (added in commit f55ec7e3bf), so we
 *    no longer need to copy it from the story text.
 *
 * Logged-out stories (the logged-out row of LA-NULL-1, LA-NULL-8 → LA-NULL-12)
 * are written as test.fixme placeholders: the assistant doesn't load for
 * logged-out visitors yet (sefaria/helper/library_assistant.py), and there is no
 * "free answers" count or login prompt in the widget to drive or check. Each
 * placeholder spells out its steps so it can be filled in once that design exists.
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

test.use({ viewport: DESKTOP });

/** The question the button asks, in the given interface language, with the search filled in. */
function searchQuestion(query: string, lang = LANGUAGES.EN): string {
  return sefariaString('search.null.library_assistant_question', lang).replace(/\{query\}/g, query);
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
    const title = `LA-NULL-1: Assistant on, ${who}, ${tab} tab — no button on the page, assistant copy, "Library Assistant" on one line`;

    if (who === 'logged out') {
      test.fixme(title, { ...DESKTOP_PHONE_TAGS, annotation: NOT_BUILT }, async () => {
        // Steps once it's built:
        //  1. goToPageWithLang(context, librarySearchUrl(QUERY), LANGUAGES.EN) — logged out.
        //  2. selectTab(tab); waitForNullState().
        //  3. Same three checks as the logged-in rows below.
      });
      continue;
    }

    test(title, DESKTOP_PHONE_TAGS, async ({ context }) => {
      const { search } = await openEmptySearch(context, BROWSER_SETTINGS.enLAUser, tab);
      expect(await search.nullStateButtonHrefs(), 'no button on the page itself').toEqual([]);
      await expect.poll(() => search.nullStateBodyText(), { message: 'assistant version of the text' })
        .toBe(sefariaString(`search.null.${tab}.body.library_assistant`, LANGUAGES.EN));
      const phrase = sefariaString('header.library_assistant', LANGUAGES.EN);
      expect(await search.nullStateLinesUsedBy(phrase), `"${phrase}" should sit on one line`).toBe(1);
    });
  }
});

test.describe('Search with no results — assistant off: today\'s text and Browse button', () => {
  for (const tab of ALL_TABS) {
    test(`LA-NULL-2: Assistant off, ${tab} tab — one button to ${BROWSE_HREFS[tab]}, today's copy`, DESKTOP_TAGS, async ({ context }) => {
      const { search } = await openEmptySearch(context, BROWSER_SETTINGS.enUser, tab);
      expect(await search.nullStateButtonHrefs(), 'one button, the Browse link').toEqual([BROWSE_HREFS[tab]]);
      expect(await search.nullStateBodyText()).toBe(sefariaString(`search.null.${tab}.body`, LANGUAGES.EN));
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

      const assistantTexts = ALL_TABS.map((tab) => sefariaString(`search.null.${tab}.body.library_assistant`, LANGUAGES.EN));
      const plainTexts = ALL_TABS.map((tab) => sefariaString(`search.null.${tab}.body`, LANGUAGES.EN));
      const wrongTexts = assistantOn ? plainTexts : assistantTexts;
      const records = await readNullStateRecords(page);

      expect(records.length, 'the recorder should have seen the empty-search box').toBeGreaterThan(0);
      const wrong = records.filter((r) => r.hasBrowseButton === assistantOn || wrongTexts.includes(r.body));
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

    // Back to the library home page the test started on (no full reload).
    await page.goBack();
    await expect(page).not.toHaveURL(/\/search\?/);
    await la.expectLauncherReads('ask');
  });
});

test.describe('Search with no results — Hebrew interface', () => {
  test('LA-NULL-15: Hebrew — the button shows the Hebrew search label and sends the Hebrew question', { tag: ['@e2e', '@desktop', '@he'] }, async ({ context }) => {
    const { mock, la, search } = await startWithAssistant(context, { lang: LANGUAGES.HE });
    await searchWithNoResults(search);
    await la.expectLauncherReads('search'); // the label is looked up in he.json

    await la.clickSearchLauncher();
    await mock.waitForQuestion(1);
    expect(mock.questions).toEqual([searchQuestion(QUERY, LANGUAGES.HE)]);
  });
});

// ---------------------------------------------------------------------------
// Logged-out stories: placeholders until the logged-out assistant exists
// ---------------------------------------------------------------------------

test.describe('Search with no results — logged out (not built yet)', () => {
  test.fixme('LA-NULL-8: Logged out — the question goes into the visitor\'s one chat, under the earlier one', LOGGED_OUT_TAGS, async () => {
    // Steps once it's built:
    //  1. Logged out (goToPageWithLang), fake chat server installed, free answers left.
    //  2. Ask EARLIER_QUESTION from "✦ Ask"; wait for its answer; close.
    //  3. searchWithNoResults(); clickSearchLauncher().
    //  4. mock.asked[1].sessionId === mock.asked[0].sessionId (same chat), and the
    //     conversation shows EARLIER_QUESTION above searchQuestion(QUERY).
  });

  test.fixme('LA-NULL-9: Logged out at the limit — opens on the last chat, scrolled to the end, with the login prompt; nothing sent', LOGGED_OUT_TAGS, async () => {
    // Steps once it's built:
    //  1. Logged out with no free answers left (how to get there depends on how the count is kept).
    //  2. searchWithNoResults(); clickSearchLauncher().
    //  3. The assistant shows the last conversation, scrolled to the bottom, with the login prompt.
    //  4. mock.expectQuestionCountStays(<count before the click>).
  });

  test.fixme('LA-NULL-10: The search question never uses up the last free answer', LOGGED_OUT_TAGS, async () => {
    // Steps once it's built:
    //  1. Logged out; ask 1 question of their own (1 free answer left).
    //  2. searchWithNoResults(); clickSearchLauncher(); the answer arrives and no login prompt shows.
    //  3. Ask another question of their own; it is answered and the login prompt appears.
  });

  test.fixme('LA-NULL-11: That exception happens once per visitor', LOGGED_OUT_TAGS, async () => {
    // Steps once it's built:
    //  1. Logged out; already had one search question that didn't count; 1 free answer left.
    //  2. searchWithNoResults(SECOND_QUERY); clickSearchLauncher().
    //  3. The answer arrives and the login prompt appears.
  });

  test.fixme('LA-NULL-12: A search question counts like any other when it isn\'t the last', LOGGED_OUT_TAGS, async () => {
    // Steps once it's built:
    //  1. Logged out with 2 free answers left.
    //  2. searchWithNoResults(); clickSearchLauncher(); wait for the answer.
    //  3. The visitor has 1 free answer left (check however the design shows it).
  });
});
