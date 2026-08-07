/**
 * Playwright Tests: Strapi Modal — Hebrew-only locale separation
 *
 * The modal document has ONLY its Hebrew locale published — the modal counterpart to
 * strapi-banner-hebrew.spec.js. Both directions come from one recording: the GraphQL query always
 * requests every locale, so the request is identical under either interface language and only the
 * client-side gate (`modal.locales.includes(...)` in Misc.jsx) differs.
 *
 * WHY scenario.pagePath RATHER THAN '/':
 *   '/' 302-redirects to /texts, so the two are the same page; using the destination directly
 *   skips a redirect hop. It is also checked against shouldShow()'s excluded-paths list, which
 *   refuses to render a modal on the page its own button links to: this modal's buttonURL
 *   contributes pathname '/give/451346', which does not collide with '/texts'. Re-check that
 *   whenever the buttonURL changes — a collision silently suppresses the modal, which would make
 *   the English-interface negative below pass for a reason unrelated to locale.
 *
 * Kept in its own file so it can be re-recorded in isolation: RECORD_HAR=1 rewrites the HAR of
 * every spec in the run, and the other scenarios' content is not currently published.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload and marks every modal_/banner_ localStorage key as already-seen — i.e. it suppresses
 *   exactly what these specs assert on (see e2e-tests/CLAUDE.md §3). So they intentionally use a
 *   bare page.goto plus routeFromHAR, keeping Strapi ON. Do NOT route them through PageManager.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiHarFixture, expectStrapiServedFromHar } from '../support/strapi-har-fixture.js';
import {
  SCENARIOS,
  prepareStrapiPage,
  advanceUntilVisible,
  advanceBy,
  strapiResponseCount,
  waitForStrapiResponse,
  useInterfaceLanguage,
  expectInterfaceLanguage,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const scenario = SCENARIOS.publishedModalHebrewOnly;
const expected = scenario.expected.modal;

test.describe('Strapi Modal — Hebrew-only', () => {
  let har;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  test('renders under Hebrew interface', async ({ page }) => {
    await useInterfaceLanguage(page, LANGUAGES.HE);
    await page.goto(scenario.pagePath);
    await expectInterfaceLanguage(page, LANGUAGES.HE);

    const modal = page.locator('#interruptingMessageBox');
    await advanceUntilVisible(page, modal);

    // Unlike the English row of this document (modalHeader: null), the Hebrew row has a header,
    // so the int-he <h1> branch renders.
    await expect(modal.locator('h1.int-he')).toHaveText(expected.header);
    await expect(modal).toContainText(expected.bodyText);

    // Both an int-en and an int-he anchor are always rendered; CSS shows one. Target int-he —
    // the int-en anchor exists but is empty and hrefless, since that locale is unpublished.
    const button = modal.locator('.buttons a.int-he');
    await expect(button).toBeVisible();
    await expect(button).toHaveText(expected.buttonText);
    await expect(button).toHaveAttribute('href', expected.buttonURL);
  });

  test('does not render under English interface', async ({ page }) => {
    await useInterfaceLanguage(page, LANGUAGES.EN);
    await page.goto(scenario.pagePath);
    // Assert the interface really is English — otherwise the absence below proves nothing.
    await expectInterfaceLanguage(page, LANGUAGES.EN);

    // Prove the Hebrew-only payload was delivered, so "no modal" means the locale gate rejected it
    // rather than that no data arrived.
    await waitForStrapiResponse(page, strapiResponseCount(page) - 1);

    // The positive control for this assertion is the test above: the same recording DOES render
    // this modal, on this same path, under Hebrew.
    await advanceBy(page, expected.showDelaySeconds * 1000 * 5);
    await expect(page.locator('#interruptingMessageBox')).toHaveCount(0);
  });
});
