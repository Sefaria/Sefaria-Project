import { test, expect, BrowserContext } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups, installEntitySearchMock } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { SearchPage, SearchTabId } from '../pages/searchPage';
import { MODULE_URLS, librarySearchUrl } from '../constants';
import { ChatServerMock } from '../support/chatServerMock';
import { noResultsAssistantBody, sefariaString } from '../support/assistantStrings';

/**
 * "Search with no results" (LA-NULL-*) on phones — the stories tagged @phone
 * (LA-NULL-1, LA-NULL-5, LA-NULL-16 and LA-NULL-19). Their desktop runs, and every
 * other LA-NULL story, live in e2e-tests/assistant/library-assistant-null-search-desktop.spec.ts —
 * read its header comment for how these tests are set up.
 *
 * Written TEST-FIRST, so some are expected to fail until the feature lands.
 *
 * How they run:
 *  - Mobile config (playwright.mobileweb.config.ts): Pixel 5 / iPhone 13
 *    emulation, with the window set to the stories' phone size, 393 × 852.
 *    The narrow window is where "Library Assistant" is most likely to wrap.
 *  - Logged in as the Library-Assistant test account (enLAUser).
 *  - Fake chat server (support/chatServerMock.ts) and fake Books / Authors /
 *    Topics results (utils.installEntitySearchMock), as on desktop.
 *
 * Run: npx playwright test --config=playwright.mobileweb.config.ts library-assistant-null-search-phone
 */

const PHONE = { width: 393, height: 852 };
const PHONE_TAGS = { tag: ['@e2e', '@desktop', '@phone'] };
const NOT_BUILT = {
  type: 'not built yet',
  description: 'The assistant for logged-out visitors (with its free-answer count and login prompt) does not exist yet',
};

const QUERY = 'qqzzxxvvkk';
/** A search with plenty of Sources results, so the button starts out reading "✦ Ask". */
const QUERY_WITH_RESULTS = 'shabbat';
const NO_ENTITY_HITS = { topic: [], author: [], book: [] };
const ALL_TABS: SearchTabId[] = ['sources', 'books', 'authors', 'topics'];

/** LA-NULL-16: the link's color, #7C416F (mussar purple), the way getComputedStyle reports it. */
const MUSSAR_PURPLE = 'rgb(124, 65, 111)';
/**
 * LA-NULL-16: the word the text breaks after. The story names the word itself
 * ("or" / "או"); it is part of a longer sentence, so it has no translation key of its own.
 */
const LAST_OR: Record<string, string> = { [LANGUAGES.EN]: 'or', [LANGUAGES.HE]: 'או' };

test.use({ viewport: PHONE });

/** Fake servers first (they must be in place before the page loads), then log in on `url`. */
async function start(context: BrowserContext, url: string, lang = LANGUAGES.EN) {
  await ChatServerMock.install(context);
  await installEntitySearchMock(context, NO_ENTITY_HITS);
  const profile = lang === LANGUAGES.HE ? BROWSER_SETTINGS.heLAUser : BROWSER_SETTINGS.enLAUser;
  const page = await goToPageWithUser(context, url, profile);
  const pm = new PageManager(page, lang);
  await hideAllModalsAndPopups(page);
  return { page, la: pm.onLibraryAssistantQ4(), search: pm.onSearchPage() };
}

/** The search page for `query` on the Hebrew site (librarySearchUrl only builds English ones). */
const hebrewSearchUrl = (query: string) => `${MODULE_URLS.HE.LIBRARY}/search?q=${encodeURIComponent(query)}`;

/** LA-NULL-16: the assistant's name in the text is a purple, underlined link, starting the line after the last "or". */
async function expectAssistantNameIsLink(search: SearchPage, lang: string) {
  const look = await search.nullStateAssistantLinkLook();
  expect(look.color, 'the link should be mussar purple, #7C416F').toBe(MUSSAR_PURPLE);
  expect(look.underlined, 'the link should be underlined').toBe(true);
  await search.expectLineBreakAfterLastOr(LAST_OR[lang]);
}

const assistantOnExamples: Array<{ who: 'logged out' | 'logged in with the assistant on'; tab: SearchTabId }> = [
  { who: 'logged out', tab: 'sources' },
  { who: 'logged in with the assistant on', tab: 'books' },
  { who: 'logged in with the assistant on', tab: 'authors' },
  { who: 'logged in with the assistant on', tab: 'topics' },
];

test.describe('Search with no results — assistant on: the page text (phone)', () => {
  for (const { who, tab } of assistantOnExamples) {
    const title = `LA-NULL-1: Assistant on, ${who}, ${tab} tab — no button on the page, assistant copy, "Library Assistant" on one line and a link (phone)`;

    if (who === 'logged out') {
      test.fixme(title, { ...PHONE_TAGS, annotation: NOT_BUILT }, async () => {
        // Steps once it's built: goToPageWithLang(context, librarySearchUrl(QUERY), LANGUAGES.EN)
        // (logged out), then selectTab(tab) and the same four checks as the rows below.
      });
      continue;
    }

    test(title, PHONE_TAGS, async ({ context }) => {
      const { search } = await start(context, librarySearchUrl(QUERY));
      await search.selectTab(tab);
      await search.waitForNullState();
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

const inlineLinkExamples = [
  { who: 'logged out', lang: LANGUAGES.EN, label: 'English' },
  { who: 'logged in with the assistant on', lang: LANGUAGES.HE, label: 'Hebrew' },
] as const;

test.describe('Search with no results — the assistant\'s name in the text is a link (phone)', () => {
  for (const { who, lang, label } of inlineLinkExamples) {
    const title = `LA-NULL-16: ${who}, ${label} — the assistant's name in the text is a purple underlined link, starting the line after the last "or" (every tab, phone)`;

    if (who === 'logged out') {
      test.fixme(title, { ...PHONE_TAGS, annotation: NOT_BUILT }, async () => {
        // Steps once it's built: goToPageWithLang(context, librarySearchUrl(QUERY), LANGUAGES.EN)
        // (logged out), then for each tab: selectTab(tab); waitForNullState();
        // expectAssistantNameIsLink(search, LANGUAGES.EN).
      });
      continue;
    }

    test(title, { tag: ['@e2e', '@desktop', '@phone', '@he'] }, async ({ context }) => {
      const { search } = await start(context, hebrewSearchUrl(QUERY), lang);
      for (const tab of ALL_TABS) {
        await search.selectTab(tab);
        await search.waitForNullState();
        await expectAssistantNameIsLink(search, lang);
      }
    });
  }
});

test.describe('Search with no results — the text scrolls clear of the floating button (phone)', () => {
  test('LA-NULL-19: Scrolled to the bottom, the last line of text sits at least 24px above "Search with Library Assistant"', { tag: ['@e2e', '@phone'] }, async ({ context }) => {
    // Start on a search that HAS results, so the assistant can be closed from its "✦ Ask"
    // button, then search again from the search page's own box (as in LA-NULL-5).
    const { la, search } = await start(context, librarySearchUrl(QUERY_WITH_RESULTS));
    await la.waitForReady();
    await la.ensureClosed();
    await search.submitSearchFromResultsPage(QUERY);
    await search.waitForNullState();
    await la.expectLauncherReads('search');

    await search.scrollNullStateToBottom();
    let gap = NaN;
    await expect.poll(async () => {
      gap = (await la.launcherBox('search')).y - await search.nullStateTextBottom();
      return gap;
    }, { message: 'space between the last line of text and the "Search with Library Assistant" button' })
      .toBeGreaterThanOrEqual(24)
      .catch((e) => { throw new Error(`the last line of text ends ${gap}px above the button\n${e.message}`); });
  });
});

test.describe('Search with no results — the Ask button becomes the search action (phone)', () => {
  for (const reducedMotion of [false, true]) {
    const suffix = reducedMotion ? ' (reduced motion: no animation)' : '';

    test(`LA-NULL-5: The Ask button becomes "Search with Library Assistant", keeping its star, and grows over 200ms${suffix} (phone)`, PHONE_TAGS, async ({ context }) => {
      // Start on a search that HAS results ("✦ Ask"), then search again from the
      // search page's own search box — the phone header has no always-visible search box.
      const { page, la, search } = await start(context, librarySearchUrl(QUERY_WITH_RESULTS));
      await la.waitForReady();
      await la.ensureClosed();
      if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });

      const samples = await la.watchLauncherWhile(async () => {
        await search.submitSearchFromResultsPage(QUERY);
        await search.waitForNullState();
      }, { ms: 20000, settleAfterChangeMs: 1000 });
      await la.expectLauncherReads('search');
      await la.expectSearchLauncherHasStar();

      la.expectGrewIntoSearchLabel(samples, { reducedMotion });
    });
  }
});
