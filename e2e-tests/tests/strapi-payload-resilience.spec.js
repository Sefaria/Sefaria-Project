/**
 * Playwright Tests: bad Strapi responses (synthetic payload)
 *
 * Two pieces of defensive code have guarded this path for as long as it has existed, and neither
 * had ever been executed by a test:
 *
 *   context.js       .catch((error) => console.error("Failed to get strapi data: ", error))
 *   Promotions.jsx   try { ... } catch (error) { console.error("Failed to process sidebar ads from Strapi: ", error) }
 *
 * They exist so a malformed or failed response degrades to "no promotions" instead of taking the
 * React tree down with it — the whole reader, not just the ad. Recording cannot reach any of it:
 * Strapi does not serve 500s, truncated JSON or last-generation payload shapes on request.
 *
 * THE ASSERTION THAT MAKES THESE NON-VACUOUS IS THE LOG LINE, not the absence of a surface. Nothing
 * rendering is exactly what a silently-dropped payload looks like too, so each test below asserts
 * the specific handler ran — that the failure was CAUGHT rather than never triggered. The empty
 * payload is the mirror image: it asserts NO error was logged, because an empty response is normal
 * (nothing published today) and must not be treated as a fault.
 *
 * WHAT THIS TURNED UP ABOUT THE Array.isArray GUARD. Promotions checks `Array.isArray(sidebarAds)`
 * with a comment about Strapi v4 nesting ads under `{ data: [...] }`. That guard cannot fire from
 * any payload: context.js always assigns groupByDocumentId's return value, which is an array
 * whatever the response looked like. A v4-shaped payload instead sails past the check as an array
 * of one nonsense document and throws downstream in buildInAppAdsFromSidebarAds, where
 * `sidebarAd.keywords.split()` meets an undefined `keywords`. So the try/catch is what actually
 * contains it, and the isArray check is defence-in-depth against a future caller. The test below
 * therefore asserts the CATCH ran, which is the behaviour that really protects the page.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload — i.e. it suppresses exactly what this spec asserts on (see e2e-tests/CLAUDE.md §22).
 *   So it intentionally uses a bare page.goto plus a synthetic route, keeping Strapi ON.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { SYNTHETIC_NOW, banner, sidebarAd, strapiPayload } from '../support/strapi-payload-factory.js';
import { prepareStrapiPage, useInterfaceLanguage, expectInterfaceLanguage, advanceBy } from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const PAGE_PATH = '/texts';
const DELAY_SECONDS = 5;

/** The exact prefixes the two handlers log; asserting on them proves the handler ran. */
const FETCH_FAILURE_LOG = 'Failed to get strapi data:';
const AD_PROCESSING_FAILURE_LOG = 'Failed to process sidebar ads from Strapi:';
// Row hygiene in groupByDocumentId (strapiLocalization.js) reports every dropped row with this
// prefix — the "loud" half of the malformed-document guards (see strapi-malformed-documents.spec.js).
const SKIPPED_ROWS_LOG = 'Skipped unusable Strapi row(s):';

const BANNER_TEXT = 'Synthetic banner delivered alongside a broken payload';
const AD_TITLE = 'Synthetic Resilience Ad';

const bannerBox = (page) => page.locator('#bannerMessage');
const modalBox = (page) => page.locator('#interruptingMessageBox');
const sidebarAds = (page) => page.locator('.sidebarPromo');

/** A well-formed payload: one banner plus one sidebar ad. */
const healthyPayload = () =>
  strapiPayload({
    banners: [
      banner({ shared: { showDelay: DELAY_SECONDS }, locales: { en: { bannerText: BANNER_TEXT } } }),
    ],
    sidebarAds: [sidebarAd({ locales: { en: { title: AD_TITLE } } })],
  });

/**
 * The healthy payload with its sidebar ads re-wrapped the way Strapi v4 nested collections.
 *
 * Built by mutating a real factory payload rather than hand-writing one, so everything except the
 * deliberate corruption stays exactly as the app expects it.
 */
const payloadWithV4WrappedAds = () => {
  const payload = healthyPayload();
  return {
    data: { ...payload.data, en_sidebarAds: { data: payload.data.en_sidebarAds } },
  };
};

async function open(page, context, payload, options) {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const strapi = await routeWithStrapiPayload(context, payload, options);
  await prepareStrapiPage(page, { pinnedNow: SYNTHETIC_NOW });
  await useInterfaceLanguage(page, LANGUAGES.EN);
  await page.goto(PAGE_PATH);
  await expectInterfaceLanguage(page, LANGUAGES.EN);

  // Well past any showDelay. Nothing arms a timer in the failure cases, so this must not wait for
  // one; it simply guarantees a surface had every chance to appear before we assert it did not.
  await advanceBy(page, DELAY_SECONDS * 1000 * 4);

  return { strapi, consoleErrors };
}

/** The page is still usable — the failure degraded the promotion, not the reader. */
async function expectPageStillWorks(page) {
  await expect(page.locator('.navSidebar')).toBeVisible();
}

const loggedOnce = (consoleErrors, prefix) => consoleErrors.filter((line) => line.includes(prefix));

test.describe('Strapi payload resilience — a bad response degrades to no promotions', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('an empty payload renders nothing and is not treated as an error', async ({ page, context }) => {
    // The normal "nothing published today" response. Distinguishes handled-emptiness from failure:
    // if this ever started logging, the app would be reporting routine quiet content as a fault.
    const opened = await open(page, context, { data: {} });
    strapi = opened.strapi;

    await expect(bannerBox(page)).toHaveCount(0);
    await expect(modalBox(page)).toHaveCount(0);
    await expect(sidebarAds(page)).toHaveCount(0);

    expect(loggedOnce(opened.consoleErrors, FETCH_FAILURE_LOG)).toEqual([]);
    expect(loggedOnce(opened.consoleErrors, AD_PROCESSING_FAILURE_LOG)).toEqual([]);
    await expectPageStillWorks(page);
  });

  test('sidebar ads in the old Strapi v4 shape are contained, and the banner still renders', async ({
    page,
    context,
  }) => {
    const opened = await open(page, context, payloadWithV4WrappedAds());
    strapi = opened.strapi;

    // The positive control, and the point of the test: the corruption is confined to the ads.
    // The banner in the same payload renders, so the response was received and processed.
    await expect(bannerBox(page)).toBeVisible();
    await expect(bannerBox(page)).toContainText(BANNER_TEXT);

    await expect(sidebarAds(page)).toHaveCount(0);
    // The containment point moved upstream with the malformed-document guards: the v4 wrapper
    // is not a usable row, so row hygiene drops it — loudly — before the ad builder ever runs.
    // Still one report, just from the earlier, more general guard.
    expect(loggedOnce(opened.consoleErrors, SKIPPED_ROWS_LOG)).toHaveLength(1);
    expect(loggedOnce(opened.consoleErrors, AD_PROCESSING_FAILURE_LOG)).toEqual([]);
    await expectPageStillWorks(page);
  });

  test('the same ad renders when its payload is well formed', async ({ page, context }) => {
    // Control for the case above: identical ad, un-wrapped. Without it, "no ad rendered" could
    // just as well mean sidebar ads never render on this page at all.
    const opened = await open(page, context, healthyPayload());
    strapi = opened.strapi;

    await expect(sidebarAds(page)).toHaveCount(1);
    await expect(sidebarAds(page)).toContainText(AD_TITLE);
    expect(loggedOnce(opened.consoleErrors, AD_PROCESSING_FAILURE_LOG)).toEqual([]);
  });

  test('GraphQL errors inside a 200 are a failed fetch — and dismissals survive them', async ({
    page,
    context,
  }) => {
    // GraphQL reports failures inside HTTP 200 ({errors: [...], data: null}), and the cache
    // endpoint passes that through uncached (sefaria/views.py). The client must treat it as a
    // FAILED fetch, not as "nothing published": the two are indistinguishable at the surface
    // (nothing renders either way), but only genuine emptiness may prune dismissal keys. A
    // seeded dismissal is the discriminator — before this guard, a transient error wiped every
    // viewer's dismissal state, and dismissed campaigns re-showed the moment the error cleared.
    await page.addInitScript(() => localStorage.setItem('modal_seeded-campaign', 'true'));

    const opened = await open(page, context, {
      errors: [{ message: 'Internal Server Error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
      data: null,
    });
    strapi = opened.strapi;

    await expect(bannerBox(page)).toHaveCount(0);
    await expect(modalBox(page)).toHaveCount(0);
    expect(loggedOnce(opened.consoleErrors, FETCH_FAILURE_LOG)).toHaveLength(1);

    // The point of the test: transient emptiness must not wipe dismissal state.
    const seededKey = await page.evaluate(() => localStorage.getItem('modal_seeded-campaign'));
    expect(seededKey).toBe('true');
    await expectPageStillWorks(page);
  });

  test('an HTTP 500 leaves the page working and is reported once', async ({ page, context }) => {
    const opened = await open(page, context, null, { status: 500, rawBody: 'Internal Server Error' });
    strapi = opened.strapi;

    await expect(bannerBox(page)).toHaveCount(0);
    await expect(sidebarAds(page)).toHaveCount(0);
    expect(loggedOnce(opened.consoleErrors, FETCH_FAILURE_LOG)).toHaveLength(1);
    await expectPageStillWorks(page);
  });

  test('a body that is not JSON leaves the page working and is reported once', async ({ page, context }) => {
    // A 200 whose body cannot be parsed — a truncated response or an error page served with the
    // wrong status. Distinct from the 500 above: it fails at response.json(), past the `response.ok`
    // check, so it exercises the other route into the same catch.
    const opened = await open(page, context, null, { status: 200, rawBody: '<html>not json at all</html>' });
    strapi = opened.strapi;

    await expect(bannerBox(page)).toHaveCount(0);
    await expect(sidebarAds(page)).toHaveCount(0);
    expect(loggedOnce(opened.consoleErrors, FETCH_FAILURE_LOG)).toHaveLength(1);
    await expectPageStillWorks(page);
  });
});
