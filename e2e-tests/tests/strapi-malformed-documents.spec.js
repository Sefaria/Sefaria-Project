/**
 * Playwright Tests: one malformed document must cost only itself (synthetic payload)
 *
 * strapi-payload-resilience.spec.js covers a bad RESPONSE (500, non-JSON, wrong wrapper): the
 * whole payload is unusable and everything degrades to "no promotions, page intact". This file
 * covers the sharper case: a WELL-FORMED response carrying one bad document among healthy ones.
 * The bad document must be skipped; the healthy banner AND modal must still be selected.
 *
 * Three malformation classes, one per describe, each of which had a different blast radius
 * before the guards (see the class comments):
 *   1. Unusable field values (broken dates)   — always degraded gracefully; pinned here.
 *   2. Unusable ROWS (null / junk in the array) — used to throw in groupByDocumentId and kill
 *      every surface including sidebar ads (guard: isUsableRow, strapiLocalization.js).
 *   3. Unparseable buttonURL on the SELECTED doc — used to throw in isPathExcluded inside
 *      shouldShow's useEffect and crash the whole React tree (guard: pathnameOf,
 *      strapiSelection.js).
 *
 * The factory cannot produce rows Strapi's schema forbids, so class 2 mutates the built payload
 * by hand before routing it — exactly the "responses Strapi will never send" category the
 * synthetic route exists for.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload — i.e. it suppresses exactly what this spec asserts on (see e2e-tests/CLAUDE.md §22).
 *   So it intentionally uses a bare page.goto plus a synthetic route, keeping Strapi ON.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { SYNTHETIC_NOW, banner, modal, strapiPayload } from '../support/strapi-payload-factory.js';
import {
  prepareStrapiPage,
  useInterfaceLanguage,
  expectInterfaceLanguage,
  advanceBy,
  waitForTimerArmed,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const PAGE_PATH = '/texts';
const DELAY_SECONDS = 5;

const modalBox = (page) => page.locator('#interruptingMessageBox');
const bannerBox = (page) => page.locator('#bannerMessage');

const HEALTHY_MODAL = 'Synthetic healthy modal';
const HEALTHY_BANNER = 'Synthetic healthy banner';
const BROKEN_MODAL = 'Synthetic modal with broken data';

const healthyModal = () =>
  modal({ shared: { showDelay: DELAY_SECONDS }, locales: { en: { modalText: HEALTHY_MODAL } } });
const healthyBanner = () =>
  banner({ shared: { showDelay: DELAY_SECONDS }, locales: { en: { bannerText: HEALTHY_BANNER } } });

async function open(page, context, payload) {
  const strapi = await routeWithStrapiPayload(context, payload);
  await prepareStrapiPage(page, { pinnedNow: SYNTHETIC_NOW });
  await useInterfaceLanguage(page, LANGUAGES.EN);
  await page.goto(PAGE_PATH);
  await expectInterfaceLanguage(page, LANGUAGES.EN);
  return strapi;
}

async function elapseShowDelay(page) {
  await waitForTimerArmed(page, DELAY_SECONDS * 1000);
  await advanceBy(page, DELAY_SECONDS * 1000 + 1000);
}

async function expectBothHealthySurfaces(page) {
  await elapseShowDelay(page);
  await expect(modalBox(page)).toBeVisible();
  await expect(modalBox(page)).toContainText(HEALTHY_MODAL);
  await expect(bannerBox(page)).toBeVisible();
  await expect(bannerBox(page)).toContainText(HEALTHY_BANNER);
}

test.describe('Strapi malformed documents — broken field values are skipped', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('a modal with unparseable dates is skipped; the healthy modal and banner still show', async ({
    page,
    context,
  }) => {
    // The broken document is listed FIRST so that surviving it requires skipping, not luck.
    // Invalid dates simply fail the date gate — this class always degraded gracefully; the test
    // pins that it stays that way.
    strapi = await open(
      page,
      context,
      strapiPayload({
        modals: [
          modal({
            window: { start: 'not a date', end: null },
            shared: { showDelay: DELAY_SECONDS },
            locales: { en: { modalText: BROKEN_MODAL } },
          }),
          healthyModal(),
        ],
        banners: [healthyBanner()],
      }),
    );

    await expectBothHealthySurfaces(page);
    await expect(modalBox(page)).not.toContainText(BROKEN_MODAL);
  });
});

test.describe('Strapi malformed documents — unusable rows are dropped, not fatal', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('null and junk rows in the arrays do not take down the healthy surfaces', async ({ page, context }) => {
    // Before the isUsableRow guard, the null row alone threw (`row.documentId` on null) inside
    // context.js's .then(), and the catch swallowed EVERY surface — modal, banner and sidebar
    // ads — for every viewer. The junk goes into BOTH content types to prove neither path is
    // special-cased.
    const payload = strapiPayload({ modals: [healthyModal()], banners: [healthyBanner()] });
    payload.data.en_modals.unshift(null);
    payload.data.en_banners.unshift('garbage, not an object');
    payload.data.he_modals.push(undefined);

    // The drop must be LOUD: a silent drop makes a misbehaving Strapi indistinguishable from
    // "nothing published". The listener attaches before open() so no report can be missed.
    const skipReports = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Skipped unusable Strapi row(s):')) {
        skipReports.push(message.text());
      }
    });

    strapi = await open(page, context, payload);

    await expectBothHealthySurfaces(page);
    // One report per content type that carried junk (modals and banners here, not sidebar ads).
    expect(skipReports.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Strapi malformed documents — a broken buttonURL cannot crash the app', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('a selected modal with a relative buttonURL still renders, with no page errors', async ({
    page,
    context,
  }) => {
    // The realistic editor mistake: a relative URL where an absolute one belongs. new URL()
    // throws on it inside shouldShow's useEffect — before the pathnameOf guard that exception
    // crashed the ENTIRE React tree at display time, well after selection had succeeded.
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    strapi = await open(
      page,
      context,
      strapiPayload({
        modals: [
          modal({
            shared: { showDelay: DELAY_SECONDS, buttonURL: null },
            // A locale block may carry any field, so the broken URL rides the en row alone.
            locales: { en: { modalText: HEALTHY_MODAL, buttonURL: 'give/451346' } },
          }),
        ],
        banners: [healthyBanner()],
      }),
    );

    await expectBothHealthySurfaces(page);
    expect(pageErrors).toEqual([]);
  });
});
