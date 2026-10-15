import { test, expect, BrowserContext } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups, installEntitySearchMock } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { SearchTabId } from '../pages/searchPage';
import { librarySearchUrl } from '../constants';
import { ChatServerMock } from '../support/chatServerMock';
import { sefariaString } from '../support/assistantStrings';

/**
 * "Search with no results" (LA-NULL-*) on phones — the stories tagged @phone
 * (LA-NULL-1 and LA-NULL-5). Their desktop runs, and every other LA-NULL story,
 * live in e2e-tests/assistant/library-assistant-null-search-desktop.spec.ts —
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

test.use({ viewport: PHONE });

/** Fake servers first (they must be in place before the page loads), then log in on `url`. */
async function start(context: BrowserContext, url: string) {
  await ChatServerMock.install(context);
  await installEntitySearchMock(context, NO_ENTITY_HITS);
  const page = await goToPageWithUser(context, url, BROWSER_SETTINGS.enLAUser);
  const pm = new PageManager(page, LANGUAGES.EN);
  await hideAllModalsAndPopups(page);
  return { page, la: pm.onLibraryAssistantQ4(), search: pm.onSearchPage() };
}

const assistantOnExamples: Array<{ who: 'logged out' | 'logged in with the assistant on'; tab: SearchTabId }> = [
  { who: 'logged out', tab: 'sources' },
  { who: 'logged in with the assistant on', tab: 'books' },
  { who: 'logged in with the assistant on', tab: 'authors' },
  { who: 'logged in with the assistant on', tab: 'topics' },
];

test.describe('Search with no results — assistant on: the page text (phone)', () => {
  for (const { who, tab } of assistantOnExamples) {
    const title = `LA-NULL-1: Assistant on, ${who}, ${tab} tab — no button on the page, assistant copy, "Library Assistant" on one line (phone)`;

    if (who === 'logged out') {
      test.fixme(title, { ...PHONE_TAGS, annotation: NOT_BUILT }, async () => {
        // Steps once it's built: goToPageWithLang(context, librarySearchUrl(QUERY), LANGUAGES.EN)
        // (logged out), then selectTab(tab) and the same three checks as the rows below.
      });
      continue;
    }

    test(title, PHONE_TAGS, async ({ context }) => {
      const { search } = await start(context, librarySearchUrl(QUERY));
      await search.selectTab(tab);
      await search.waitForNullState();
      expect(await search.nullStateButtonHrefs(), 'no button on the page itself').toEqual([]);
      await expect.poll(() => search.nullStateBodyText(), { message: 'assistant version of the text' })
        .toBe(sefariaString(`search.null.${tab}.body.library_assistant`, LANGUAGES.EN));
      const phrase = sefariaString('header.library_assistant', LANGUAGES.EN);
      expect(await search.nullStateLinesUsedBy(phrase), `"${phrase}" should sit on one line`).toBe(1);
    });
  }
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
