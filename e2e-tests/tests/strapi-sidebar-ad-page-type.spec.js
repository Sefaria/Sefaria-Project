/**
 * Playwright Tests: Strapi Sidebar Ad — page-type targeting
 *
 * Sidebar ads may carry a `pageType` string from Strapi (an enumeration field), matched against
 * the KIND of page the reader is on — classified from panel state in ReaderApp.getUserContext
 * (static/js/sefaria/pageTypes.js), or supplied by TopicPage for author-vs-topic. The gate ANDs
 * with the existing keyword/language/date/audience checks; `all_pages` (and any pre-field
 * document) behaves exactly as ads always did.
 *
 * WHAT THIS FILE COVERS:
 *   1. One "shows up" test per targetable page type — each fails only if that page type's
 *      classification + Promo slot + matching chain breaks on its real page.
 *   2. Backward compatibility (null pageType) and fail-closed behavior (unknown value).
 *   3. Negative targeting (an ad typed for one page kind absent on another).
 *   4. The page-type + multi-word-keyword conjunction on a real collection TOC — the flagship
 *      scenario: "collection TOCs" are structurally plain categories, so a specific collection
 *      is targeted with pageType `category_toc` AND a keyword like "covenant and conversation".
 *   5. Author vs topic vs portal pages, including the no-flash guarantee while topic data loads.
 *   6. Schema mismatch: a Strapi without the field rejects the full query; there is NO fallback —
 *      every promo surface stays dark and the mismatch is named in the console.
 *
 * LOCAL PREREQUISITES (beyond the usual sandbox + STRAPI_LOCATION configured server-side):
 *   - MongoDB with the standard local dump (real category/book/topic pages are navigated).
 *   - Topic pools seeded once: `.venv/bin/python e2e-tests/support/seed_topic_pools.py`.
 *     /topics/<slug> 404s on a stock sandbox because the Postgres django_topics pool tables are
 *     empty (the pool gate in reader.views.topic_page); the topic tests skip with that message
 *     rather than failing when unseeded.
 *   - /etc/hosts entries for the voices module host (voices.sefaria.test -> 127.0.0.1); the
 *     voices-hosted tests skip when the host is unreachable.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it): the standard
 * entry helpers (goToPageWithLang / goToPageWithUser) install overlay suppression that stubs
 * /api/strapi/graphql-cache — killing exactly what these specs assert on — so navigation is a
 * bare page.goto plus a synthetic Strapi route (see e2e-tests/CLAUDE.md §3, §22).
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { strapiPayload, sidebarAd, SYNTHETIC_NOW } from '../support/strapi-payload-factory.js';
import { prepareStrapiPage, waitForStrapiResponse, strapiResponseCount } from './strapi.fixtures.js';

/** Every Strapi surface arrives through this endpoint (same glob as strapi-payload-fixture.js). */
const STRAPI_URL_GLOB = '**/api/strapi/**';

/**
 * The voices-module host. Collections and the voices home page live on a separate module host
 * (reader.views redirects them off the library module); locally that is an /etc/hosts alias to
 * the same runserver. CI can override via env.
 */
const VOICES_URL = process.env.VOICES_SANDBOX_URL || 'http://voices.sefaria.test:8000';

const scenario = { pinnedNow: SYNTHETIC_NOW };

/** One synthetic ad targeting `pageType`, titled so assertions identify WHICH ad rendered. */
const typedAd = (pageType, overrides = {}) =>
  sidebarAd({ shared: { pageType, title: `Ad targeting ${pageType}`, ...overrides } });

const promoTitled = (page, title) => page.locator('.sidebarPromo', { hasText: title });

/**
 * The "shows up" matrix: one real page per targetable type. `anchor` is the container proving
 * the page rendered its sidebar host (only needed where the default .navSidebar doesn't apply —
 * TopicPage mounts Promotions in its own .sideColumn, outside NavSidebar).
 */
const SHOWS_ON = [
  { pageType: 'homepage', path: '/texts' },
  { pageType: 'category_toc', path: '/texts/Tanakh/Torah' },
  { pageType: 'book_toc', path: '/Genesis?tab=contents' },
  { pageType: 'topic_page', path: '/topics/shabbat', anchor: '.sideColumn', seededTopic: true },
  // samson-raphael-hirsch, NOT jonathan-sacks: Sacks has a portal_slug, and portal topic
  // pages classify EXCLUSIVELY as portal_page (their own row below) — an author-targeted ad
  // must not land on a sponsor-branded page. See the PORTAL_PAGE note in pageTypes.js.
  { pageType: 'author_page', path: '/topics/samson-raphael-hirsch', anchor: '.sideColumn', seededTopic: true },
  // The portal ad slot sits in PortalNavSideBar, appended after the sponsor's own modules.
  // Both rows below because these are the only two portals as of 2026-09 ('sacks' and
  // 'steinsaltz', both in the standard local dump): one row proves the slot, the pair proves
  // it isn't an accident of one portal's module configuration — as recorded in the dump, sacks
  // publishes only an About block while steinsaltz publishes all four sponsor modules, so each
  // exercises a differently-shaped sponsor sidebar.
  { pageType: 'portal_page', path: '/topics/jonathan-sacks', seededTopic: true },
  { pageType: 'portal_page', path: '/topics/adin-steinsaltz', seededTopic: true },
  { pageType: 'topic_category_toc', path: '/topics/category/prayer' },
  { pageType: 'topics_landing', path: '/topics' },
  { pageType: 'all_topics', path: '/topics/all/a' },
  { pageType: 'calendars', path: '/calendars' },
  { pageType: 'translations', path: '/translations/en' },
  { pageType: 'collection_page', path: `${VOICES_URL}/collections/romemu-nyc`, voicesHost: true },
  { pageType: 'public_collections', path: `${VOICES_URL}/collections`, voicesHost: true },
  { pageType: 'voices_home', path: `${VOICES_URL}/`, voicesHost: true },
  // `user_library` and `notifications` have their own tests in the authenticated describe at
  // the bottom — /notifications and /saved both 302 to the login page for anonymous visitors,
  // so neither can join this anonymous matrix.
];

/**
 * Skip (named, not silent) when a local prerequisite for this row is missing.
 *
 * The three causes are deliberately kept apart, because each has a different fix and conflating
 * them sends people down the wrong path (a timeout is not an unseeded pool; a 404 in seeded CI
 * is a real regression wearing a prerequisite's clothes):
 *   - no response at all  -> the host never answered (down, or an unmapped voices hostname);
 *   - 404 on a topic row  -> the pool gate — run the seed script AND restart the server;
 *   - anything else       -> run the test; if the page is truly broken, the test should FAIL.
 */
async function skipUnlessPageAvailable(row, request) {
  // request.get resolves relative paths against the project baseURL; absolute voices URLs pass
  // through untouched. A network-level failure (unmapped host, timeout) resolves to null.
  const response = await request.get(row.path).catch(() => null);
  if (!response) {
    test.skip(
      true,
      row.voicesHost
        ? `${row.path} unreachable — add the voices host to /etc/hosts or set VOICES_SANDBOX_URL`
        : `${row.path} did not answer — sandbox down or timing out (NOT a seeding problem)`,
    );
  }
  if (row.seededTopic && response.status() === 404) {
    test.skip(true, `${row.path} 404s — seed the topic pools once (.venv/bin/python e2e-tests/support/seed_topic_pools.py) and RESTART the Django server`);
  }
}

test.describe('Strapi Sidebar Ad — a page-type-targeted ad shows on its page', () => {
  let served;

  // Reset per test: without this, a test that skips before routing would hand afterEach either
  // undefined (first test in a worker — the guard would throw, turning a legitimate skip into a
  // failure) or the PREVIOUS test's handle (a vacuous pass on someone else's evidence).
  test.beforeEach(() => {
    served = undefined;
  });

  test.afterEach(({}, testInfo) => {
    if (testInfo.status === 'skipped') return; // a skipped test served nothing, by definition
    expectStrapiServed(served);
  });

  for (const row of SHOWS_ON) {
    test(`a ${row.pageType}-targeted ad shows on ${row.path.replace(VOICES_URL, '<voices>')}`, async ({ page, context, request }) => {
      await skipUnlessPageAvailable(row, request);
      served = await routeWithStrapiPayload(context, strapiPayload({ sidebarAds: [typedAd(row.pageType)] }));
      await prepareStrapiPage(page, scenario);

      await page.goto(row.path);

      await expect(promoTitled(page, `Ad targeting ${row.pageType}`)).toBeVisible();
    });
  }
});

test.describe('Strapi Sidebar Ad — page-type gate boundaries', () => {
  let served;

  test.afterEach(() => {
    expectStrapiServed(served);
  });

  test('an ad with pageType null (a pre-field document) still shows — backward compatibility', async ({ page, context }) => {
    // Explicit null mimics a Strapi document created before the field existed, or one fetched
    // through the legacy retry; normalizePageType maps it to all_pages.
    served = await routeWithStrapiPayload(
      context,
      strapiPayload({ sidebarAds: [sidebarAd({ shared: { pageType: null, title: 'Legacy ad' } })] }),
    );
    await prepareStrapiPage(page, scenario);

    await page.goto('/texts');

    await expect(promoTitled(page, 'Legacy ad')).toBeVisible();
  });

  test('a book_toc-targeted ad is absent on a category TOC', async ({ page, context }) => {
    served = await routeWithStrapiPayload(context, strapiPayload({ sidebarAds: [typedAd('book_toc')] }));
    await prepareStrapiPage(page, scenario);

    await page.goto('/texts/Tanakh/Torah');

    // Absence needs positive anchors or it proves nothing: the payload arrived AND the sidebar
    // host rendered, and only then is "no ad" meaningful.
    await waitForStrapiResponse(page);
    await expect(page.locator('.navSidebar')).toBeVisible();
    await expect(promoTitled(page, 'Ad targeting book_toc')).toHaveCount(0);
  });

  test('a homepage-targeted ad is absent on a topic category page', async ({ page, context }) => {
    served = await routeWithStrapiPayload(context, strapiPayload({ sidebarAds: [typedAd('homepage')] }));
    await prepareStrapiPage(page, scenario);

    await page.goto('/topics/category/prayer');

    await waitForStrapiResponse(page);
    await expect(page.locator('.navSidebar')).toBeVisible();
    await expect(promoTitled(page, 'Ad targeting homepage')).toHaveCount(0);
  });

  test('matching is reactive: a homepage ad leaves on client-side navigation and returns on back', async ({ page, context }) => {
    // Every other test in this file asserts on a cold page load — but this is a single-page app,
    // and the whole mechanism (getUserContext re-classifying on panel-state change, the matching
    // effect re-running) is only correct if matching REACTS to navigation without a reload. The
    // suite's own history motivates this: the sidebar-ads effect-deps regression (8e96add79) was
    // invisible on cold loads and only bit on exactly this kind of in-app transition.
    served = await routeWithStrapiPayload(context, strapiPayload({ sidebarAds: [typedAd('homepage')] }));
    await prepareStrapiPage(page, scenario);

    await page.goto('/texts');
    await expect(promoTitled(page, 'Ad targeting homepage')).toBeVisible();

    // A real click on a category link — ReaderApp handles it client-side (no reload).
    const responsesBeforeNavigation = await strapiResponseCount(page);
    await page.locator('a[href="/texts/Tanakh"]').first().click();
    await expect(page).toHaveURL(/\/texts\/Tanakh/);

    // The page is now a category TOC, so the homepage-targeted ad must be gone. Anchors: the
    // sidebar host is still rendered, and the Strapi counter proves this really was a client-side
    // transition — a full reload would have fetched the payload again and made this a second
    // cold-load test instead of the reactivity test it claims to be.
    await expect(page.locator('.navSidebar')).toBeVisible();
    await expect(promoTitled(page, 'Ad targeting homepage')).toHaveCount(0);
    expect(await strapiResponseCount(page)).toBe(responsesBeforeNavigation);

    // And back again: the same reactivity in reverse.
    await page.goBack();
    await expect(page).toHaveURL(/\/texts$/);
    await expect(promoTitled(page, 'Ad targeting homepage')).toBeVisible();
  });

  test('an unknown pageType value matches no page — fails closed', async ({ page, context }) => {
    // A CMS typo must show the ad NOWHERE (noticed and fixed), never EVERYWHERE (a silent
    // site-wide campaign) — the client passes unknown values through so they can't match.
    served = await routeWithStrapiPayload(context, strapiPayload({ sidebarAds: [typedAd('hompage')] }));
    await prepareStrapiPage(page, scenario);

    await page.goto('/texts');

    await waitForStrapiResponse(page);
    await expect(page.locator('.navSidebar')).toBeVisible();
    await expect(promoTitled(page, 'Ad targeting hompage')).toHaveCount(0);
  });

  test('pageType and a multi-word keyword must BOTH match — the collection TOC scenario', async ({ page, context }) => {
    // The flagship conjunction: "Covenant and Conversation" is a plain Category record (a
    // collection TOC is structurally indistinguishable from a canon category), so the specific
    // collection is targeted with category_toc + the category's name as a keyword. The keyword
    // is multi-word ON PURPOSE — commas split the Strapi field, inner spaces are content, and
    // the page's keyword targets carry the lowercased category name spaces and all.
    served = await routeWithStrapiPayload(
      context,
      strapiPayload({
        sidebarAds: [
          typedAd('category_toc', {
            title: 'Covenant and Conversation ad',
            keywords: 'covenant and conversation',
          }),
        ],
      }),
    );
    await prepareStrapiPage(page, scenario);

    // Both gates pass on the collection's own TOC…
    await page.goto('/texts/Tanakh/Modern%20Commentary%20on%20Tanakh/Jonathan%20Sacks/Covenant%20and%20Conversation');
    await expect(promoTitled(page, 'Covenant and Conversation ad')).toBeVisible();

    // …and on another category TOC the page type still matches but the keyword does not, so the
    // ad is withheld — proving the keyword narrows WITHIN the page type, not alongside it.
    // The response counter is CUMULATIVE per page, so the baseline must be captured before the
    // second navigation — waitForStrapiResponse's default baseline of 0 was already satisfied by
    // the first page's fetch and would wait for nothing, letting the absence assertion run
    // before this page's payload (and any ad) could possibly have rendered.
    const responsesBeforeNavigation = await strapiResponseCount(page);
    await page.goto('/texts/Tanakh/Torah');
    await waitForStrapiResponse(page, responsesBeforeNavigation);
    await expect(page.locator('.navSidebar')).toBeVisible();
    await expect(promoTitled(page, 'Covenant and Conversation ad')).toHaveCount(0);
  });
});

test.describe('Strapi Sidebar Ad — author pages vs topic pages', () => {
  let served;

  test.beforeEach(() => {
    served = undefined; // see the shows-up describe for why this reset matters
  });

  // Both ads ride in one payload so each test proves selection BETWEEN them, not mere presence.
  const authorAndTopicAds = () =>
    strapiPayload({ sidebarAds: [typedAd('author_page'), typedAd('topic_page')] });

  const skipUnlessTopicsSeeded = async (request) => {
    const response = await request.get('/topics/shabbat').catch(() => null);
    // Same three-way split as skipUnlessPageAvailable: an unreachable sandbox is NOT a seeding
    // problem, and naming it as one would send someone to the wrong fix.
    test.skip(!response, '/topics/shabbat did not answer — sandbox down or timing out (NOT a seeding problem)');
    test.skip(
      response?.status() === 404,
      '/topics/<slug> 404s — seed the topic pools once (.venv/bin/python e2e-tests/support/seed_topic_pools.py) and RESTART the Django server',
    );
  };

  test.afterEach(({}, testInfo) => {
    if (testInfo.status === 'skipped') return;
    expectStrapiServed(served);
  });

  test('an author page shows the author_page ad and not the topic_page ad', async ({ page, context, request }) => {
    await skipUnlessTopicsSeeded(request);
    served = await routeWithStrapiPayload(context, authorAndTopicAds());
    await prepareStrapiPage(page, scenario);

    // samson-raphael-hirsch carries subclass "author" in Mongo and has no portal_slug (a portal
    // topic would classify exclusively as portal_page — see pageTypes.js — so it could never
    // prove the author_page path).
    await page.goto('/topics/samson-raphael-hirsch');

    await expect(promoTitled(page, 'Ad targeting author_page')).toBeVisible();
    await expect(promoTitled(page, 'Ad targeting topic_page')).toHaveCount(0);
  });

  test('a portal page shows only a portal_page ad — never the author ad, though the topic IS an author', async ({ page, context, request }) => {
    await skipUnlessTopicsSeeded(request);
    // All three flavors ride together so the test proves exclusive selection, not mere presence.
    served = await routeWithStrapiPayload(
      context,
      strapiPayload({ sidebarAds: [typedAd('portal_page'), typedAd('author_page'), typedAd('topic_page')] }),
    );
    await prepareStrapiPage(page, scenario);

    // jonathan-sacks is BOTH subclass "author" and portal_slug "sacks" — the sharpest possible
    // input for the exclusivity rule: portal classification must beat the author signal.
    await page.goto('/topics/jonathan-sacks');

    await expect(promoTitled(page, 'Ad targeting portal_page')).toBeVisible();
    await expect(promoTitled(page, 'Ad targeting author_page')).toHaveCount(0);
    await expect(promoTitled(page, 'Ad targeting topic_page')).toHaveCount(0);
  });

  test('a plain topic page shows the topic_page ad and not the author_page ad', async ({ page, context, request }) => {
    await skipUnlessTopicsSeeded(request);
    served = await routeWithStrapiPayload(context, authorAndTopicAds());
    await prepareStrapiPage(page, scenario);

    await page.goto('/topics/shabbat');

    await expect(promoTitled(page, 'Ad targeting topic_page')).toBeVisible();
    await expect(promoTitled(page, 'Ad targeting author_page')).toHaveCount(0);
  });

  test('no topic-targeted ad appears while topic data is still loading — the no-flash guarantee', async ({ page, context, request }) => {
    await skipUnlessTopicsSeeded(request);
    served = await routeWithStrapiPayload(context, authorAndTopicAds());
    await prepareStrapiPage(page, scenario);

    // The loading window is real even on a direct load: `_topic_page_data` in reader/views.py
    // computes the topic payload and DISCARDS it (the function has no return statement), so
    // server props carry `topicData: null` in every environment and TopicPage always fetches
    // /api/v2/topics/<slug> client-side, sitting in its loading state until the response lands.
    // Holding that response makes the window observable instead of racing the assertion. If that
    // upstream missing return is ever fixed, the cache gets seeded server-side, no client fetch
    // fires, and this held route holds nothing — revisit this test then. (The v2 path matters —
    // a '**/api/topics/**' glob would NOT match /api/v2/topics/ and would hold nothing.)
    let releaseTopicResponse;
    const held = new Promise((resolve) => {
      releaseTopicResponse = resolve;
    });
    await context.route('**/api/v2/topics/**', async (route) => {
      await held;
      await route.continue();
    });

    await page.goto('/topics/shabbat');
    await waitForStrapiResponse(page);

    // While the topic response is held, TopicPage is in its loading state and mounts NO
    // Promotions at all — so nothing can flash and later be revoked. The topic panel existing
    // proves the page actually rendered before we assert absence (an absence on a blank page
    // would prove nothing).
    await expect(page.locator('.topicPanel')).toBeVisible();
    await expect(page.locator('.sidebarPromo')).toHaveCount(0);

    releaseTopicResponse();

    // Data arrives, classification is answered, and only the correctly-typed ad appears.
    await expect(promoTitled(page, 'Ad targeting topic_page')).toBeVisible();
    await expect(promoTitled(page, 'Ad targeting author_page')).toHaveCount(0);
  });
});

test.describe('Strapi Sidebar Ad — a Strapi without the pageType field (schema mismatch)', () => {
  // Kept in sync with the schema-mismatch hint in static/js/context.js — asserting the literal
  // pins the console contract an operator would grep for during a mismatched deploy.
  const SCHEMA_MISMATCH_HINT = 'LIKELY SCHEMA MISMATCH';

  test('nothing renders and the mismatch is named in the console — promotions stay dark, never degrade', async ({ page, context }) => {
    // Play the part of an out-of-date Strapi: GraphQL rejects the WHOLE query when it asks for a
    // field the schema lacks, and it reports that inside an HTTP 200 ({errors, data: null}).
    // There is deliberately NO fallback (decision 2026-09-01): frontend and Strapi are always
    // deployed compatibly, and a dark window during a deploy beats a degradation mechanism whose
    // fallback responses could be cached and served to healthy clients. So the page must show NO
    // promotions and must say WHY in the console.
    const served = [];
    await context.route(STRAPI_URL_GLOB, async (route) => {
      served.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Cannot query field \"pageType\" on type \"SidebarAd\".' }],
          data: null,
        }),
      });
    });

    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await prepareStrapiPage(page, scenario);
    await page.goto('/texts');

    // Positive anchors first: the request actually happened and the page rendered its sidebar —
    // otherwise "no promotions" would be true of a broken page too.
    await expect(page.locator('.navSidebar')).toBeVisible();
    expect(served.length).toBeGreaterThan(0);

    // The failure is named, not swallowed: the terminal fetch handler logs the error with the
    // schema-mismatch diagnosis (assert the handler's log line — an empty sidebar alone would
    // also be consistent with, say, nothing being published).
    await expect
      .poll(() => consoleErrors.some((text) => text.includes(SCHEMA_MISMATCH_HINT)))
      .toBe(true);

    // And nothing rendered: no ads, and no banner/modal either — the whole promo layer is dark.
    await expect(page.locator('.sidebarPromo')).toHaveCount(0);
    await expect(page.locator('#interruptingMessageBox')).toHaveCount(0);
  });
});

test.describe('Strapi Sidebar Ad — notifications page (authenticated)', () => {
  // /notifications 302s to login for anonymous visitors, so this row of the shows-up matrix
  // needs a real Django session — the same storageState mechanism as strapi-audience-real:
  // global-setup logs in with PLAYWRIGHT_USER_EMAIL/PASSWORD and writes the auth file; without
  // credentials this skips by name instead of failing. Cookies only; localStorage stays clean.
  const AUTH_FILE = 'e2e-tests/auth_english_user.json';
  const hasAuthSession = Boolean(process.env.PLAYWRIGHT_USER_EMAIL && process.env.PLAYWRIGHT_USER_PASSWORD);

  test.skip(!hasAuthSession, 'Needs PLAYWRIGHT_USER_EMAIL/PASSWORD — global-setup then writes e2e-tests/auth_english_user.json');
  test.use({ storageState: AUTH_FILE });

  let served;

  test.afterEach(() => {
    expectStrapiServed(served);
  });

  test('a notifications-targeted ad shows on the notifications page', async ({ page, context }) => {
    served = await routeWithStrapiPayload(context, strapiPayload({ sidebarAds: [typedAd('notifications')] }));
    await prepareStrapiPage(page, scenario);

    await page.goto('/notifications');

    await expect(promoTitled(page, 'Ad targeting notifications')).toBeVisible();
  });

  test('a user_library-targeted ad shows on the saved page', async ({ page, context }) => {
    // /saved is the real saved-content route (it serves initialMenu "saved"; the similar-looking
    // /texts/saved is just a category-path navigation page and renders the plain library menu).
    // Anonymous visitors get a 302 to login, so this needs the real session. saved/history/notes
    // all map to user_library through one component (UserHistoryPanel), so one page stands in
    // for all three menus.
    served = await routeWithStrapiPayload(context, strapiPayload({ sidebarAds: [typedAd('user_library')] }));
    await prepareStrapiPage(page, scenario);

    await page.goto('/saved');

    await expect(promoTitled(page, 'Ad targeting user_library')).toBeVisible();
  });
});
