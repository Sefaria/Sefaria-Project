/**
 * Playwright Tests: excludedPaths suppression (synthetic payload)
 *
 * A banner or modal is withheld on the page its own button points at — no sense urging a reader to
 * visit somewhere they already are:
 *
 *     const excludedPaths = ["/donate", "/mobile", "/app", "/ways-to-give"];
 *     if (strapi.modal.buttonURL) {
 *       if (strapi.modal.buttonURL.en) excludedPaths.push(new URL(strapi.modal.buttonURL.en).pathname);
 *       if (strapi.modal.buttonURL.he) excludedPaths.push(new URL(strapi.modal.buttonURL.he).pathname);
 *     }
 *     return excludedPaths.indexOf(window.location.pathname) === -1;          // Misc.jsx:2189-2199
 *
 * WHY THIS COULD NOT BE RECORDED. The gate only fires when a button URL's pathname equals the path
 * under test, and no editor authors a donation button pointing at /texts. It was attempted once
 * against a recording, using the four hardcoded paths, and the premise turned out to be wrong:
 * `GET /` redirects to /texts, so no page in the app ever has pathname `/` and that entry is
 * unreachable. The factory removes the obstacle by making buttonURL an input.
 *
 * NOTE THE CROSS-LOCALE COUPLING, which the second pair of tests pins down: BOTH locales' pathnames
 * are pushed unconditionally, regardless of which interface language is active. So a Hebrew button
 * URL pointing at the current page suppresses the modal for ENGLISH readers too — who would never
 * have seen that URL. Whether that is intended is a product question; the test records what the
 * code does.
 *
 * EVERY SUPPRESSION TEST IS PAIRED WITH ITS OWN CONTROL. "The modal did not render" is a weak
 * observation on its own — it is equally consistent with a broken payload, a stalled clock or a
 * typo in the locator. Each pair changes ONLY the button URL between a suppressed case and a
 * rendered one, so the URL is provably the cause. A banner in the same payload additionally
 * renders throughout, proving the payload arrived and the clock advanced.
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

/** Pathname equals PAGE_PATH, so a modal carrying this URL must be withheld there. */
const COLLIDING_URL = `https://example.org${PAGE_PATH}`;
const SAFE_URL = 'https://example.org/somewhere-else-entirely';

const MODAL_TEXT = 'Synthetic modal under the excluded-paths gate';
const CONTROL_BANNER_TEXT = 'Synthetic control banner';

const modalBox = (page) => page.locator('#interruptingMessageBox');
const bannerBox = (page) => page.locator('#bannerMessage');

/**
 * One modal with the given per-locale button URLs, plus a banner that always renders.
 *
 * The banner is the payload-arrived / clock-advanced control, and it also supplies the timer that
 * elapseShowDelay waits for — which matters because a SUPPRESSED modal never arms one of its own.
 */
const payloadWithButtonURLs = (buttonURLs) =>
  strapiPayload({
    banners: [
      banner({
        shared: { showDelay: DELAY_SECONDS, buttonURL: SAFE_URL },
        locales: { en: { bannerText: CONTROL_BANNER_TEXT }, he: { bannerText: CONTROL_BANNER_TEXT } },
      }),
    ],
    modals: [
      modal({
        shared: { showDelay: DELAY_SECONDS },
        locales: Object.fromEntries(
          Object.entries(buttonURLs).map(([locale, buttonURL]) => [locale, { buttonURL, modalText: MODAL_TEXT }]),
        ),
      }),
    ],
  });

async function open(page, context, buttonURLs, { language = LANGUAGES.EN } = {}) {
  const strapi = await routeWithStrapiPayload(context, payloadWithButtonURLs(buttonURLs));
  await prepareStrapiPage(page, { pinnedNow: SYNTHETIC_NOW });
  await useInterfaceLanguage(page, language);
  await page.goto(PAGE_PATH);
  await expectInterfaceLanguage(page, language);

  await waitForTimerArmed(page, DELAY_SECONDS * 1000);
  await advanceBy(page, DELAY_SECONDS * 1000 + 1000);

  // The control, asserted before anything else: whatever the modal does below, the payload
  // definitely arrived and time definitely moved.
  await expect(bannerBox(page)).toBeVisible();
  await expect(bannerBox(page)).toContainText(CONTROL_BANNER_TEXT);

  return strapi;
}

test.describe('Strapi excludedPaths — a surface is withheld on the page its button points at', () => {
  let strapi;

  test.afterEach(() => {
    expectStrapiServed(strapi);
  });

  test('withholds the modal when its button URL points at the current page', async ({ page, context }) => {
    strapi = await open(page, context, { en: COLLIDING_URL });
    await expect(modalBox(page)).toHaveCount(0);
  });

  test('renders the same modal once its button URL points elsewhere', async ({ page, context }) => {
    // The paired control: identical in every respect but the button URL, so that URL is the only
    // thing the suppression above can be attributed to.
    strapi = await open(page, context, { en: SAFE_URL });
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(MODAL_TEXT);
  });

  test("withholds the modal from English readers when the HEBREW button URL collides", async ({ page, context }) => {
    // Both locales' pathnames go on the excluded list regardless of the active language, so a URL
    // this reader will never see still suppresses their modal.
    strapi = await open(page, context, { en: SAFE_URL, he: COLLIDING_URL }, { language: LANGUAGES.EN });
    await expect(modalBox(page)).toHaveCount(0);
  });

  test('renders for English readers when the Hebrew button URL points elsewhere', async ({ page, context }) => {
    // Control for the cross-locale case: the modal still has two locales and the English reader is
    // unchanged; only the Hebrew URL moves off the current path.
    strapi = await open(page, context, { en: SAFE_URL, he: SAFE_URL }, { language: LANGUAGES.EN });
    await expect(modalBox(page)).toBeVisible();
    await expect(modalBox(page)).toContainText(MODAL_TEXT);
  });
});
