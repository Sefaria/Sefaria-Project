/**
 * Playwright Tests: the audience gate — showTo and visitor kind (synthetic payload)
 *
 * matchesAudience (strapiSelection.js:95) runs DURING SELECTION, so a document aimed at the
 * wrong audience is skipped in favor of one aimed at this viewer — not chosen and then
 * suppressed. Every mixed-payload test below asserts exactly that: the ineligible document is
 * listed FIRST, so only selection-time filtering can explain the eligible one winning.
 *
 * This file covers the ANONYMOUS side (logged_out_only, and new vs. returning visitors, which
 * are anonymous-only states — see below). The logged-in side needs a real Django session and
 * lives in strapi-audience-real.spec.js, following the newsletter suite's *-real convention.
 *
 * THE VISITOR-KIND LEVER is plain web storage, set before page scripts run (ReaderApp.jsx:218):
 *   - A logged-in user is ALWAYS marked a returning visitor.
 *   - An anonymous first-timer gets sessionStorage.isNewVisitor="true" AND
 *     localStorage.isReturningVisitor="true" — they stay "new" for this whole session, and
 *     become "returning" once the session ends (sessionStorage clears, localStorage persists).
 *   - So: a FRESH Playwright context is a new visitor with no setup at all, and a returning
 *     visitor is simulated by seeding exactly what markUserAsReturningVisitor writes
 *     (sefaria.js:2904) via addInitScript. ReaderApp's else-if never overwrites seeded values,
 *     because isNewVisitor() is already false when they are present.
 *
 * NOT COVERED HERE: sustainer vs. non-sustainer (needs a sustainer-flagged account — the
 * is_sustainer flag comes from the user profile and cannot be seeded client-side).
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload — i.e. it suppresses exactly what this spec asserts on (see e2e-tests/CLAUDE.md §22).
 *   So it intentionally uses a bare page.goto plus a synthetic route, keeping Strapi ON.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { SYNTHETIC_NOW, modal, strapiPayload } from '../support/strapi-payload-factory.js';
import {
  prepareStrapiPage,
  useInterfaceLanguage,
  expectInterfaceLanguage,
  advanceBy,
  waitForTimerArmed,
  waitForStrapiResponse,
  strapiResponseCount,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const PAGE_PATH = '/texts';
const DELAY_SECONDS = 5;

const modalBox = (page) => page.locator('#interruptingMessageBox');

/** A modal restricted by the showTo dropdown alone (no visitor-kind boxes involved). */
const showToModal = (showTo, text) =>
  modal({ shared: { showDelay: DELAY_SECONDS, showTo }, locales: { en: { modalText: text } } });

/**
 * A modal for one visitor kind only. The factory's defaults tick ALL FOUR boxes (which the
 * audience gate reads as "no restriction"), so the other three must be explicitly false —
 * otherwise these tests would pass for everyone and prove nothing.
 */
const visitorKindModal = (kindOverrides, text) =>
  modal({
    shared: {
      showDelay: DELAY_SECONDS,
      showToNewVisitors: false,
      showToReturningVisitors: false,
      showToSustainers: false,
      showToNonSustainers: false,
      ...kindOverrides,
    },
    locales: { en: { modalText: text } },
  });

const newVisitorsModal = (text) => visitorKindModal({ showToNewVisitors: true }, text);
const returningVisitorsModal = (text) => visitorKindModal({ showToReturningVisitors: true }, text);

/** Simulate an anonymous returning visitor: exactly what markUserAsReturningVisitor writes. */
async function seedReturningVisitor(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('isNewVisitor', 'false');
    localStorage.setItem('isReturningVisitor', 'true');
  });
}

async function open(page, context, payload) {
  const strapi = await routeWithStrapiPayload(context, payload);
  await prepareStrapiPage(page, { pinnedNow: SYNTHETIC_NOW });
  await useInterfaceLanguage(page, LANGUAGES.EN);
  await page.goto(PAGE_PATH);
  await expectInterfaceLanguage(page, LANGUAGES.EN);
  return strapi;
}

/** Wait for the surface's timer to exist, then move past it. */
async function elapseShowDelay(page) {
  await waitForTimerArmed(page, DELAY_SECONDS * 1000);
  await advanceBy(page, DELAY_SECONDS * 1000 + 1000);
}

/**
 * Assert nothing renders: prove the payload arrived, then advance far past the delay WITHOUT
 * requiring a timer — an ineligible document never arms one (see strapi.fixtures.js on why
 * absence assertions must not wait for a timer).
 */
async function expectNoModal(page) {
  await waitForStrapiResponse(page, strapiResponseCount(page) - 1);
  await advanceBy(page, DELAY_SECONDS * 1000 * 5);
  await expect(modalBox(page)).toHaveCount(0);
}

const LOGGED_OUT_MODAL = 'Synthetic modal for logged-out readers';
const LOGGED_IN_MODAL = 'Synthetic modal for logged-in readers';
const NEW_VISITOR_MODAL = 'Synthetic modal for new visitors';
const RETURNING_VISITOR_MODAL = 'Synthetic modal for returning visitors';

test.describe('Strapi audience — showTo, for an anonymous reader', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('a logged-out-only modal renders', async ({ page, context }) => {
    // The positive control: this exact document renders for the audience it names.
    strapi = await open(page, context, strapiPayload({ modals: [showToModal('logged_out_only', LOGGED_OUT_MODAL)] }));

    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(LOGGED_OUT_MODAL);
  });

  test('a logged-in-only modal does not render', async ({ page, context }) => {
    strapi = await open(page, context, strapiPayload({ modals: [showToModal('logged_in_only', LOGGED_IN_MODAL)] }));

    await expectNoModal(page);
  });

  // The filtering proof: the ineligible logged-in-only document is listed FIRST, so if selection
  // did not run the audience gate, it would win the slot and the anonymous reader would see
  // nothing (the pre-fix failure shape). Both orders, so position can never explain the winner.
  [
    { label: 'the logged-in-only modal listed first', modals: () => [showToModal('logged_in_only', LOGGED_IN_MODAL), showToModal('logged_out_only', LOGGED_OUT_MODAL)] },
    { label: 'the logged-out-only modal listed first', modals: () => [showToModal('logged_out_only', LOGGED_OUT_MODAL), showToModal('logged_in_only', LOGGED_IN_MODAL)] },
  ].forEach(({ label, modals }) =>
    test(`selection skips the logged-in-only modal, with ${label}`, async ({ page, context }) => {
      strapi = await open(page, context, strapiPayload({ modals: modals() }));

      await elapseShowDelay(page);
      await expect(modalBox(page)).toBeVisible();
      await expect(modalBox(page)).toContainText(LOGGED_OUT_MODAL);
      await expect(modalBox(page)).not.toContainText(LOGGED_IN_MODAL);
    }),
  );
});

test.describe('Strapi audience — visitor kind, for a NEW visitor (fresh context)', () => {
  // A fresh Playwright context has empty storage, which IS the new-visitor state — no seeding.
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('a new-visitors-only modal renders', async ({ page, context }) => {
    strapi = await open(page, context, strapiPayload({ modals: [newVisitorsModal(NEW_VISITOR_MODAL)] }));

    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(NEW_VISITOR_MODAL);
  });

  test('a returning-visitors-only modal does not render', async ({ page, context }) => {
    strapi = await open(page, context, strapiPayload({ modals: [returningVisitorsModal(RETURNING_VISITOR_MODAL)] }));

    await expectNoModal(page);
  });

  [
    { label: 'the returning-only modal listed first', modals: () => [returningVisitorsModal(RETURNING_VISITOR_MODAL), newVisitorsModal(NEW_VISITOR_MODAL)] },
    { label: 'the new-only modal listed first', modals: () => [newVisitorsModal(NEW_VISITOR_MODAL), returningVisitorsModal(RETURNING_VISITOR_MODAL)] },
  ].forEach(({ label, modals }) =>
    test(`selection picks the new-visitors modal, with ${label}`, async ({ page, context }) => {
      strapi = await open(page, context, strapiPayload({ modals: modals() }));

      await elapseShowDelay(page);
      await expect(modalBox(page)).toBeVisible();
      await expect(modalBox(page)).toContainText(NEW_VISITOR_MODAL);
      await expect(modalBox(page)).not.toContainText(RETURNING_VISITOR_MODAL);
    }),
  );
});

test.describe('Strapi audience — visitor kind, for a RETURNING visitor (seeded storage)', () => {
  let strapi;

  test.beforeEach(async ({ page }) => {
    await seedReturningVisitor(page);
  });

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('a returning-visitors-only modal renders', async ({ page, context }) => {
    // The control that proves the seeding lever works: same document that was invisible to the
    // fresh context above is visible once the storage says "returning".
    strapi = await open(page, context, strapiPayload({ modals: [returningVisitorsModal(RETURNING_VISITOR_MODAL)] }));

    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(RETURNING_VISITOR_MODAL);
  });

  test('a new-visitors-only modal does not render', async ({ page, context }) => {
    strapi = await open(page, context, strapiPayload({ modals: [newVisitorsModal(NEW_VISITOR_MODAL)] }));

    await expectNoModal(page);
  });

  [
    { label: 'the new-only modal listed first', modals: () => [newVisitorsModal(NEW_VISITOR_MODAL), returningVisitorsModal(RETURNING_VISITOR_MODAL)] },
    { label: 'the returning-only modal listed first', modals: () => [returningVisitorsModal(RETURNING_VISITOR_MODAL), newVisitorsModal(NEW_VISITOR_MODAL)] },
  ].forEach(({ label, modals }) =>
    test(`selection picks the returning-visitors modal, with ${label}`, async ({ page, context }) => {
      strapi = await open(page, context, strapiPayload({ modals: modals() }));

      await elapseShowDelay(page);
      await expect(modalBox(page)).toBeVisible();
      await expect(modalBox(page)).toContainText(RETURNING_VISITOR_MODAL);
      await expect(modalBox(page)).not.toContainText(NEW_VISITOR_MODAL);
    }),
  );
});
