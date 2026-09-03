/**
 * Playwright Test: Strapi Modal — a published modal is displayed
 *
 * Scope: this spec verifies ONLY that a modal published in Strapi reaches the client and renders.
 * It deliberately makes no assertions about banners or sidebar ads — those surfaces have their own
 * specs, so a failure here always points at the modal path.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   The standard entry helpers (goToPageWithLang / goToPageWithUser) call
 *   installOverlaySuppression(), which short-circuits /api/strapi/graphql-cache with an empty
 *   payload and marks every modal_/banner_ localStorage key as already-seen — i.e. it suppresses
 *   exactly what this spec asserts on (see e2e-tests/CLAUDE.md §3). So this spec intentionally uses
 *   a bare page.goto plus a synthetic Strapi route, keeping Strapi ON. Do NOT route it through PageManager.
 *
 * The response is served from the scenario's synthetic payload replica (strapi.scenario-payloads.js),
 * proven equal to its frozen recording by strapi-scenario-payload-fidelity.spec.js. See
 * ./strapi.fixtures.js for the pinned-clock rationale.
 */

import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { SCENARIOS, prepareStrapiPage, advanceUntilVisible } from './strapi.fixtures.js';

const scenario = SCENARIOS.publishedModal;

test.describe('Strapi Modal', () => {
  let served;

  test.beforeEach(async ({ page, context }) => {
    served = await routeWithStrapiPayload(context, scenario.payload);
    await prepareStrapiPage(page, scenario);
  });

  // The synthetic route fulfils every /api/strapi request, so nothing can fall through to a live
  // backend; the remaining hazard is the page never requesting Strapi at all (STRAPI_INSTANCE
  // unset, overlay suppression), which would make absence assertions pass vacuously — this
  // turns that into an explicit, self-diagnosing failure.
  test.afterEach(() => {
    expectStrapiServed(served);
  });

  test('a published modal is displayed', async ({ page }) => {
    await page.goto('/');

    // The modal mounts inside StrapiDataProvider on every ReaderApp page (ReaderApp.jsx), but
    // stays hidden until its showDelay timer elapses. The clock is installed (fake timers), so
    // that only happens when the test advances it.
    const modal = page.locator('#interruptingMessageBox');
    await advanceUntilVisible(page, modal);

    // Assert on the body text rather than a header: this record's modalHeader is null, so the
    // <h1 class="int-en"> branch never renders. The body text also identifies WHICH modal showed.
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(scenario.expected.modal.bodyText);
  });
});
