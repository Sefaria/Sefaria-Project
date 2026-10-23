/**
 * Playwright Tests: the donor audience gate — showToDonor / showToNonDonor (synthetic payload)
 *
 * matchesDonorAudience (strapiSelection.js) is an independent AND-ed filter on top of the
 * audience gate. Every test checks BOTH surfaces, modal and banner, because each is selected
 * separately.
 *
 * THE DONOR LEVER: donor_status reaches the page in DJANGO_VARS.props (templates/base.html
 * defines `var DJANGO_VARS = {...}` inline). A plain addInitScript assignment would be
 * overwritten by that inline script, so the init script installs a property SETTER on
 * window.DJANGO_VARS: when the page assigns the object, the setter flips props.donor_status
 * to "donor" before client.jsx unpacks the props. Nothing persistent changes, so the shared
 * logged-in user stays a non-donor for every other spec.
 *
 * STAGGERED DELAYS: every document gets its own showDelay, so waitForTimerArmed can tell WHICH
 * document selection chose (see below). The modal's full-page overlay sits on top of the
 * banner, so within each pair the banner gets the shorter delay.
 *
 * THE UNRESTRICTED CONTROL: an "is it hidden?" test that only advances the clock can pass
 * BEFORE selection has run (nothing on screen yet, for any reason). So each hidden test also
 * lists an unrestricted control document AFTER the gated one, with a delay of its own. If the
 * gate works the control is all that is eligible, its timer arms, and it is what appears. If
 * the gate is broken the gated document wins instead (see CONTROL_DOES_NOT_OUTRANK below), the
 * control's timer never arms, and waitForTimerArmed fails loudly instead of the test passing.
 *
 * Logged-in tests need e2e-tests/auth_english_user.json (global-setup writes it when
 * PLAYWRIGHT_USER_EMAIL / PLAYWRIGHT_USER_PASSWORD are set) and SKIP without it. That account
 * must NOT be a donor or sustainer; the "non-donor" tests below assume it.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload — i.e. it suppresses exactly what this spec asserts on (see e2e-tests/CLAUDE.md §22).
 *   So it intentionally uses a bare page.goto plus a synthetic route, keeping Strapi ON.
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { SYNTHETIC_NOW, banner, modal, strapiPayload } from '../support/strapi-payload-factory.js';
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
const BANNER_DELAY_SECONDS = 5;
const MODAL_DELAY_SECONDS = 9;
// Distinct from each other and from the gated documents' delays above.
const CONTROL_BANNER_DELAY_SECONDS = 6;
const CONTROL_MODAL_DELAY_SECONDS = 7;

const modalBox = (page) => page.locator('#interruptingMessageBox');
const bannerBox = (page) => page.locator('#bannerMessage');

const DONOR_ONLY = { showToDonor: true, showToNonDonor: false };
const NON_DONOR_ONLY = { showToDonor: false, showToNonDonor: true };

const donorModal = (flags, text) =>
  modal({ shared: { showDelay: MODAL_DELAY_SECONDS, ...flags }, locales: { en: { modalText: text } } });
const donorBanner = (flags, text) =>
  banner({ shared: { showDelay: BANNER_DELAY_SECONDS, ...flags }, locales: { en: { bannerText: text } } });

// CONTROL_DOES_NOT_OUTRANK: with the donor gate broken, the control must lose to the gated
// document so the failure is visible. Ranking (strapiSelection.js selectionPriorityKey) is
// audience specificity, then locale, then window length, then window start, then payload order.
// The control is unrestricted (specificity 0) and shares the gated document's default window and
// locale, so it ties a non-donor-only document (also 0) and loses to it on payload order
// (control is listed second), and loses outright to a donor-only document (1).
const CONTROL_MODAL = 'Synthetic unrestricted control modal';
const CONTROL_BANNER = 'Synthetic unrestricted control banner';

const controlModal = () =>
  modal({
    shared: { showDelay: CONTROL_MODAL_DELAY_SECONDS, internalModalName: 'donor-audience-control-modal' },
    locales: { en: { modalText: CONTROL_MODAL } },
  });
const controlBanner = () =>
  banner({
    shared: { showDelay: CONTROL_BANNER_DELAY_SECONDS, internalBannerName: 'donor-audience-control-banner' },
    locales: { en: { bannerText: CONTROL_BANNER } },
  });

/** One gated document per surface, then the unrestricted control (listed AFTER, see above). */
const gatedPlusControlPayload = (flags, { modalText, bannerText }) => strapiPayload({
  modals: [donorModal(flags, modalText), controlModal()],
  banners: [donorBanner(flags, bannerText), controlBanner()],
});

const ASK_MODAL = 'Synthetic non-donor ask modal';
const ASK_BANNER = 'Synthetic non-donor ask banner';
const THANKS_MODAL = 'Synthetic donor thank-you modal';
const THANKS_BANNER = 'Synthetic donor thank-you banner';

/** One ask and one thank-you per surface; `listedFirst` ('ask' | 'thanks') picks the order. */
const bothAudiencesPayload = (listedFirst) => strapiPayload({
  modals: listedFirst === 'ask'
    ? [donorModal(NON_DONOR_ONLY, ASK_MODAL), donorModal(DONOR_ONLY, THANKS_MODAL)]
    : [donorModal(DONOR_ONLY, THANKS_MODAL), donorModal(NON_DONOR_ONLY, ASK_MODAL)],
  banners: listedFirst === 'ask'
    ? [donorBanner(NON_DONOR_ONLY, ASK_BANNER), donorBanner(DONOR_ONLY, THANKS_BANNER)]
    : [donorBanner(DONOR_ONLY, THANKS_BANNER), donorBanner(NON_DONOR_ONLY, ASK_BANNER)],
});

/** Flip props.donor_status to "donor" as the inline script assigns DJANGO_VARS. */
async function presentAsConfirmedDonor(page) {
  await page.addInitScript(() => {
    let djangoVars;
    Object.defineProperty(window, 'DJANGO_VARS', {
      configurable: true,
      get: () => djangoVars,
      set: (value) => {
        if (value?.props) value.props.donor_status = 'donor';
        djangoVars = value;
      },
    });
  });
}

async function open(page, context, payload, { expectLoggedIn = false } = {}) {
  const strapi = await routeWithStrapiPayload(context, payload);
  await prepareStrapiPage(page, { pinnedNow: SYNTHETIC_NOW });
  await useInterfaceLanguage(page, LANGUAGES.EN);
  const responsesBeforeNavigation = strapiResponseCount(page);
  await page.goto(PAGE_PATH);
  await expectInterfaceLanguage(page, LANGUAGES.EN);
  await waitForStrapiResponse(page, responsesBeforeNavigation);
  if (expectLoggedIn) {
    // An anonymous reader is also a non-donor, so without this a stale auth file would let the
    // logged-in tests pass while testing the anonymous path.
    const uid = await page.evaluate(() => window.Sefaria?._uid);
    expect(uid, 'expected a logged-in session (Sefaria._uid) — is the auth file stale?').toBeTruthy();
  }
  return strapi;
}

/** Both timers must be armed before the clock moves, or the advance passes over nothing. */
async function elapseBothDelays(page) {
  await waitForTimerArmed(page, BANNER_DELAY_SECONDS * 1000);
  await waitForTimerArmed(page, MODAL_DELAY_SECONDS * 1000);
  await advanceBy(page, MODAL_DELAY_SECONDS * 1000 + 1000);
}

async function expectSurfacesShow(page, { modalText, notModalText, bannerText, notBannerText }) {
  await expect(modalBox(page)).toBeVisible();
  await expect(modalBox(page)).toContainText(modalText);
  await expect(modalBox(page)).not.toContainText(notModalText);
  await expect(bannerBox(page)).toBeVisible();
  await expect(bannerBox(page)).toContainText(bannerText);
  await expect(bannerBox(page)).not.toContainText(notBannerText);
}

/**
 * Assert the gated document is hidden AND that selection really ran: the unrestricted control
 * must have armed its timer and be the one on screen. If the gate were broken the gated document
 * would be selected instead and the control's timer would never arm, so this fails at the
 * waitForTimerArmed calls rather than passing on an empty page.
 */
async function expectOnlyTheControlRenders(page, { gatedModalText, gatedBannerText }) {
  await waitForTimerArmed(page, CONTROL_BANNER_DELAY_SECONDS * 1000);
  await waitForTimerArmed(page, CONTROL_MODAL_DELAY_SECONDS * 1000);
  await advanceBy(page, CONTROL_MODAL_DELAY_SECONDS * 1000 + 1000);
  await expectSurfacesShow(page, {
    modalText: CONTROL_MODAL, notModalText: gatedModalText,
    bannerText: CONTROL_BANNER, notBannerText: gatedBannerText,
  });
}

test.describe('Strapi donor audience — anonymous reader (a non-donor)', () => {
  let strapi;
  test.afterEach(() => expectStrapiServed(strapi));

  // bothAudiencesPayload's argument names the document listed FIRST; running both orders proves
  // the winner comes from filtering, not from position.
  ['thanks', 'ask'].forEach((listedFirst) =>
    test(`gets the non-donor ask on both surfaces (${listedFirst} listed first)`, async ({ page, context }) => {
      strapi = await open(page, context, bothAudiencesPayload(listedFirst));
      await elapseBothDelays(page);
      await expectSurfacesShow(page, { modalText: ASK_MODAL, notModalText: THANKS_MODAL, bannerText: ASK_BANNER, notBannerText: THANKS_BANNER });
    }));

  test('never sees donor-only content on either surface', async ({ page, context }) => {
    strapi = await open(page, context, gatedPlusControlPayload(DONOR_ONLY, { modalText: THANKS_MODAL, bannerText: THANKS_BANNER }));
    await expectOnlyTheControlRenders(page, { gatedModalText: THANKS_MODAL, gatedBannerText: THANKS_BANNER });
  });
});

test.describe('Strapi donor audience — logged-in reader', () => {
  test.skip(!hasAuthSession, `No auth session at ${AUTH_FILE}; set PLAYWRIGHT_USER_EMAIL/PASSWORD so global-setup logs in.`);
  test.use({ storageState: AUTH_FILE });

  let strapi;
  test.afterEach(() => expectStrapiServed(strapi));

  test('a logged-in non-donor gets the ask on both surfaces', async ({ page, context }) => {
    strapi = await open(page, context, bothAudiencesPayload('thanks'), { expectLoggedIn: true }); // wrong audience first
    await elapseBothDelays(page);
    await expectSurfacesShow(page, { modalText: ASK_MODAL, notModalText: THANKS_MODAL, bannerText: ASK_BANNER, notBannerText: THANKS_BANNER });
  });

  ['ask', 'thanks'].forEach((listedFirst) =>
    test(`a confirmed donor gets the thank-you on both surfaces (${listedFirst} listed first)`, async ({ page, context }) => {
      await presentAsConfirmedDonor(page);
      strapi = await open(page, context, bothAudiencesPayload(listedFirst), { expectLoggedIn: true });
      expect(await page.evaluate(() => window.Sefaria.donor_status)).toBe('donor'); // the lever worked
      await elapseBothDelays(page);
      await expectSurfacesShow(page, { modalText: THANKS_MODAL, notModalText: ASK_MODAL, bannerText: THANKS_BANNER, notBannerText: ASK_BANNER });
    }));

  test('a confirmed donor never sees non-donor-only content on either surface', async ({ page, context }) => {
    await presentAsConfirmedDonor(page);
    strapi = await open(page, context, gatedPlusControlPayload(NON_DONOR_ONLY, { modalText: ASK_MODAL, bannerText: ASK_BANNER }),
      { expectLoggedIn: true });
    expect(await page.evaluate(() => window.Sefaria.donor_status)).toBe('donor'); // else the control proves nothing
    await expectOnlyTheControlRenders(page, { gatedModalText: ASK_MODAL, gatedBannerText: ASK_BANNER });
  });
});
