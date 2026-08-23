/**
 * Playwright Tests: Strapi Sidebar Ad — date states
 *
 * Three ads in one payload — expired, active, future — of which exactly one may render.
 *
 * WHY THIS SURFACE GETS ALL THREE STATES IN ONE RECORDING. Promotions filters each ad
 * independently and renders every match, so the three states coexist on a single page load.
 * Selection instead surfaces only a single winning banner/modal, which is why those needed a
 * recording per state (strapi-banner-expired / strapi-banner-future). The two surfaces are also
 * separate implementations of the same rule, so neither set of tests covers the other:
 *   banner/modal → strapiSelection.js `isDateActive` — an out-of-window doc is never eligible
 *   sidebar ad   → Promotions  `.filter()` — rejects each inactive ad
 *
 * WHAT MAKES THE ASSERTION MEAN SOMETHING. All three ads are identical apart from their titles and
 * windows: same `keywords: '!everywhere'` (an exclude-only rule, so all three are eligible on any
 * page), same showTo, same debug flag, same locale. The date is therefore the only thing that can
 * separate them, and if the filter were ignored all three would render. The active ad is its own
 * positive control — it proves the payload arrived and rendering works, in the same assertion pass
 * that shows the other two are absent.
 *
 * No clock advance: sidebar ads have no showDelay, so they render as soon as the payload lands.
 * That also keeps the co-published modal invisible, since its timer never fires.
 *
 * REQUIRES A SANDBOX WITH DEBUG=True — all three ads carry `debug: true`, and showGivenDebugMode()
 * hides such ads unless context.isDebug.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload — i.e. it suppresses exactly what this spec asserts on (see e2e-tests/CLAUDE.md §3).
 *   So it intentionally uses a bare page.goto plus routeFromHAR, keeping Strapi ON.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiHarFixture, expectStrapiServedFromHar } from '../support/strapi-har-fixture.js';
import {
  SCENARIOS,
  prepareStrapiPage,
  useInterfaceLanguage,
  expectInterfaceLanguage,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const scenario = SCENARIOS.sidebarAdDateStates;
const { expired, active, future } = scenario.expected.ads;

const adTitled = (page, title) => page.locator('.sidebarPromo', { hasText: title });

test.describe('Strapi Sidebar Ad — date states', () => {
  let har;
  /** The Strapi payload as the page actually received it. */
  let payload;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);
    await useInterfaceLanguage(page, LANGUAGES.EN);

    payload = null;
    page.on('response', async (response) => {
      if (!response.url().includes('/api/strapi/')) return;
      payload = await response.json().catch(() => null);
    });
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  test('all three are delivered, and only the active one is displayed', async ({ page }) => {
    await page.goto(scenario.pagePath);
    await expectInterfaceLanguage(page, LANGUAGES.EN);

    // The active ad rendering is the positive control: the payload arrived and rendering works.
    await expect(adTitled(page, active.title)).toBeVisible();

    // All three really were delivered — the server's ±14-day filter kept every one of them, so
    // the two absences below are the client's date filter at work, not missing data.
    const delivered = (payload?.data?.en_sidebarAds ?? []).map((ad) => ad.title);
    expect(delivered.sort()).toEqual([active.title, expired.title, future.title].sort());

    // Neither out-of-window ad appears.
    await expect(adTitled(page, expired.title)).toHaveCount(0);
    await expect(adTitled(page, future.title)).toHaveCount(0);

    // And nothing else slipped through: exactly one ad on the page.
    await expect(page.locator('.sidebarPromo')).toHaveCount(1);
  });
});
