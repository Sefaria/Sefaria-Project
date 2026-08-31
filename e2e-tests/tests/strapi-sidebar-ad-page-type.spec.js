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
 *   5. Author vs topic pages, including the no-flash guarantee during client-side navigation.
 *   6. Legacy-Strapi degradation: a Strapi without the field rejects the full query; the client
 *      retries once without it and every surface keeps working.
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
import { prepareStrapiPage, waitForStrapiResponse } from './strapi.fixtures.js';

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
  // Both rows below because these are the ONLY two portals in existence ('sacks' and
  // 'steinsaltz', both in the standard local dump): one row proves the slot, the pair proves
  // it isn't an accident of one portal's module configuration — the two portals publish
  // different entry sets, so each exercises a differently-shaped sponsor sidebar.
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
  // `user_library` and `notifications` live in the authenticated describe at the bottom —
  // /notifications 302s to login and /texts/saved renders a logged-out signup wall (no
  // NavSidebar), so neither can join this anonymous matrix.
];

/** Skip (named, not silent) when a local prerequisite for this row is missing. */
async function skipUnlessPageAvailable(row, request) {
  // request.get resolves relative paths against the project baseURL; absolute voices URLs pass
  // through untouched. A network-level failure (unmapped host) resolves to null, not a throw.
  const response = await request.get(row.path).catch(() => null);
  if (row.seededTopic && (!response || response.status() === 404)) {
    test.skip(true, `${row.path} 404s — seed the topic pools once: .venv/bin/python e2e-tests/support/seed_topic_pools.py`);
  }
  if (row.voicesHost && !response) {
    test.skip(true, `${row.path} unreachable — add the voices host to /etc/hosts or set VOICES_SANDBOX_URL`);
  }
}

test.describe('Strapi Sidebar Ad — a page-type-targeted ad shows on its page', () => {
  let served;

  test.afterEach(() => {
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
    await page.goto('/texts/Tanakh/Torah');
    await waitForStrapiResponse(page);
    await expect(page.locator('.navSidebar')).toBeVisible();
    await expect(promoTitled(page, 'Covenant and Conversation ad')).toHaveCount(0);
  });
});

test.describe('Strapi Sidebar Ad — author pages vs topic pages', () => {
  let served;

  // Both ads ride in one payload so each test proves selection BETWEEN them, not mere presence.
  const authorAndTopicAds = () =>
    strapiPayload({ sidebarAds: [typedAd('author_page'), typedAd('topic_page')] });

  const skipUnlessTopicsSeeded = async (request) => {
    const response = await request.get('/topics/shabbat').catch(() => null);
    test.skip(
      !response || response.status() === 404,
      '/topics/<slug> 404s — seed the topic pools once: .venv/bin/python e2e-tests/support/seed_topic_pools.py',
    );
  };

  test.afterEach(() => {
    expectStrapiServed(served);
  });

  test('an author page shows the author_page ad and not the topic_page ad', async ({ page, context, request }) => {
    await skipUnlessTopicsSeeded(request);
    served = await routeWithStrapiPayload(context, authorAndTopicAds());
    await prepareStrapiPage(page, scenario);

    // samson-raphael-hirsch carries subclass "author" in Mongo and has no portal_slug (a
    // portal page would render the sponsor sidebar, which has no ad slot — see pageTypes.js).
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

    // The loading window is real even on a direct load: this sandbox serves topic pages with
    // `topicData: null` in the server props, so TopicPage always fetches /api/v2/topics/<slug>
    // client-side and sits in its loading state until the response lands. Holding that response
    // makes the window observable instead of racing the assertion. (The v2 path matters — a
    // '**/api/topics/**' glob would NOT match /api/v2/topics/ and would hold nothing.)
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

test.describe('Strapi Sidebar Ad — legacy Strapi without the pageType field', () => {
  // Keep in sync with LEGACY_STRAPI_RETRY_LOG in static/js/context.js — asserting the literal
  // here pins the console contract a production operator would grep for.
  const RETRY_LOG_PREFIX = 'Strapi rejected the full query; retrying without post-freeze fields:';

  test('the client retries without the field and ads still render, logging the downgrade', async ({ page, context }) => {
    // Play the part of an older Strapi: reject any query that mentions pageType the way GraphQL
    // really does (errors inside a 200), serve the legacy shape otherwise. The legacy payload's
    // rows must NOT carry pageType — that is the whole point — so it is stripped after building.
    const payload = strapiPayload({ sidebarAds: [sidebarAd({ shared: { title: 'Legacy Strapi ad' } })] });
    const legacyPayload = {
      data: Object.fromEntries(
        Object.entries(payload.data).map(([alias, rows]) => [
          alias,
          rows.map(({ pageType, ...rest }) => rest),
        ]),
      ),
    };

    const servedQueries = [];
    await context.route(STRAPI_URL_GLOB, async (route) => {
      const query = route.request().postData() || '';
      servedQueries.push(query);
      if (query.includes('pageType')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Cannot query field "pageType" on type "SidebarAd".' }],
            data: null,
          }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(legacyPayload) });
      }
    });

    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await prepareStrapiPage(page, scenario);
    await page.goto('/texts');

    // The ad renders from the retried legacy query — the degradation is invisible to the viewer.
    await expect(page.locator('.sidebarPromo', { hasText: 'Legacy Strapi ad' })).toBeVisible();

    // Both halves of the mechanism actually happened: two queries (full, then legacy)…
    expect(servedQueries.some((query) => query.includes('pageType'))).toBe(true);
    expect(servedQueries.some((query) => !query.includes('pageType'))).toBe(true);
    // …and the downgrade was logged loudly, not swallowed (assert the handler's log line — the
    // rendered ad alone would also be consistent with the retry never having been needed).
    expect(consoleErrors.some((text) => text.startsWith(RETRY_LOG_PREFIX))).toBe(true);
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
});
