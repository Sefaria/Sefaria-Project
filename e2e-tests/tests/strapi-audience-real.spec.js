/**
 * Playwright Tests: the audience gate for a REAL logged-in user (synthetic payload)
 *
 * The logged-in half of strapi-audience.spec.js. `ctx.isLoggedIn` comes from `Sefaria._uid`,
 * which the server renders into the page from the Django session — it cannot be faked
 * client-side, so these tests ride a real session, the same way the newsletter suite's
 * *-real.spec.js files do (that suite pioneered the pattern with auth.setup.js; on this branch
 * the equivalent is global-setup.ts, which logs the test user in once before any worker starts
 * and writes e2e-tests/auth_english_user.json).
 *
 * REQUIRES CREDENTIALS: PLAYWRIGHT_USER_EMAIL / PLAYWRIGHT_USER_PASSWORD env vars (plus
 * SANDBOX_URL). Without them global-setup skips the login, the auth file does not exist, and
 * every test here SKIPS with a message rather than failing — so the chrome-strapi project stays
 * green on machines without credentials.
 *
 *   PLAYWRIGHT_USER_EMAIL=<email> PLAYWRIGHT_USER_PASSWORD=<password> \
 *   SANDBOX_URL=http://127.0.0.1:8000 npx playwright test --project=chrome-strapi \
 *     e2e-tests/tests/strapi-audience-real.spec.js --workers=1
 *
 * A LOGGED-IN USER IS ALWAYS A RETURNING VISITOR (ReaderApp.jsx:218 calls
 * markUserAsReturningVisitor unconditionally for any _uid) — so "logged-in new visitor" is
 * unreachable by design, and the visitor-kind tests below pin that: the new-visitors-only
 * document never shows to a logged-in user, even in a brand-new browser context.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   goToPageWithUser would suppress the Strapi content under test (e2e-tests/CLAUDE.md §22), so
 *   this spec applies the session via test.use({ storageState }) — cookies only — and keeps the
 *   bare page.goto plus synthetic-route machinery.
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
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

const AUTH_FILE = path.resolve(__dirname, '../auth_english_user.json');
const hasAuthSession = fs.existsSync(AUTH_FILE);

const PAGE_PATH = '/texts';
const DELAY_SECONDS = 5;

const modalBox = (page) => page.locator('#interruptingMessageBox');

const showToModal = (showTo, text) =>
  modal({ shared: { showDelay: DELAY_SECONDS, showTo }, locales: { en: { modalText: text } } });

// See strapi-audience.spec.js: the factory defaults tick all four kind boxes (no restriction),
// so a one-kind document must zero the rest explicitly.
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

async function open(page, context, payload) {
  const strapi = await routeWithStrapiPayload(context, payload);
  await prepareStrapiPage(page, { pinnedNow: SYNTHETIC_NOW });
  await useInterfaceLanguage(page, LANGUAGES.EN);
  await page.goto(PAGE_PATH);
  await expectInterfaceLanguage(page, LANGUAGES.EN);
  // The absence assertions below prove nothing if the session silently failed to apply, so
  // every test first proves the server really rendered a logged-in page.
  const uid = await page.evaluate(() => window.Sefaria?._uid);
  expect(uid, 'expected a logged-in session (Sefaria._uid) — is the auth file stale?').toBeTruthy();
  return strapi;
}

async function elapseShowDelay(page) {
  await waitForTimerArmed(page, DELAY_SECONDS * 1000);
  await advanceBy(page, DELAY_SECONDS * 1000 + 1000);
}

async function expectNoModal(page) {
  await waitForStrapiResponse(page, strapiResponseCount(page) - 1);
  await advanceBy(page, DELAY_SECONDS * 1000 * 5);
  await expect(modalBox(page)).toHaveCount(0);
}

const LOGGED_OUT_MODAL = 'Synthetic modal for logged-out readers';
const LOGGED_IN_MODAL = 'Synthetic modal for logged-in readers';
const NEW_VISITOR_MODAL = 'Synthetic modal for new visitors';
const RETURNING_VISITOR_MODAL = 'Synthetic modal for returning visitors';

test.describe('Strapi audience — showTo, for a logged-in reader', () => {
  test.skip(!hasAuthSession, 'Needs PLAYWRIGHT_USER_EMAIL/PASSWORD — global-setup then writes e2e-tests/auth_english_user.json');
  test.use({ storageState: AUTH_FILE });

  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('a logged-in-only modal renders', async ({ page, context }) => {
    strapi = await open(page, context, strapiPayload({ modals: [showToModal('logged_in_only', LOGGED_IN_MODAL)] }));

    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(LOGGED_IN_MODAL);
  });

  test('a logged-out-only modal does not render', async ({ page, context }) => {
    strapi = await open(page, context, strapiPayload({ modals: [showToModal('logged_out_only', LOGGED_OUT_MODAL)] }));

    await expectNoModal(page);
  });

  // Selection-time filtering, both orders: the ineligible logged-out-only document is skipped
  // even when listed first — it is never chosen-then-suppressed.
  [
    { label: 'the logged-out-only modal listed first', modals: () => [showToModal('logged_out_only', LOGGED_OUT_MODAL), showToModal('logged_in_only', LOGGED_IN_MODAL)] },
    { label: 'the logged-in-only modal listed first', modals: () => [showToModal('logged_in_only', LOGGED_IN_MODAL), showToModal('logged_out_only', LOGGED_OUT_MODAL)] },
  ].forEach(({ label, modals }) =>
    test(`selection skips the logged-out-only modal, with ${label}`, async ({ page, context }) => {
      strapi = await open(page, context, strapiPayload({ modals: modals() }));

      await elapseShowDelay(page);
      await expect(modalBox(page)).toBeVisible();
      await expect(modalBox(page)).toContainText(LOGGED_IN_MODAL);
      await expect(modalBox(page)).not.toContainText(LOGGED_OUT_MODAL);
    }),
  );
});

test.describe('Strapi audience — a logged-in reader is always a returning visitor', () => {
  test.skip(!hasAuthSession, 'Needs PLAYWRIGHT_USER_EMAIL/PASSWORD — global-setup then writes e2e-tests/auth_english_user.json');
  test.use({ storageState: AUTH_FILE });

  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('a returning-visitors-only modal renders, even in a brand-new browser context', async ({ page, context }) => {
    // The context is fresh (no visit history in storage), but ReaderApp marks any logged-in
    // user as returning before the Strapi data resolves — the account itself is the history.
    strapi = await open(
      page,
      context,
      strapiPayload({ modals: [visitorKindModal({ showToReturningVisitors: true }, RETURNING_VISITOR_MODAL)] }),
    );

    await elapseShowDelay(page);
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(RETURNING_VISITOR_MODAL);
  });

  test('a new-visitors-only modal never renders for a logged-in reader', async ({ page, context }) => {
    strapi = await open(
      page,
      context,
      strapiPayload({ modals: [visitorKindModal({ showToNewVisitors: true }, NEW_VISITOR_MODAL)] }),
    );

    await expectNoModal(page);
  });
});
