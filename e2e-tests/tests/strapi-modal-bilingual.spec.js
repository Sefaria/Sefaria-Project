/**
 * Playwright Tests: Strapi Modal — both locales published
 *
 * One modal document with BOTH locales published, completing the surface × locale matrix alongside
 * strapi-banner-bilingual.spec.js. It exercises the same `groupByDocumentId` merge — two per-locale
 * rows folded into one document — on the modal surface.
 *
 * It also covers something the banner scenarios cannot: `modalHeader` is OPTIONAL, and on this
 * document it is authored in Hebrew but not in English. Three different DOM behaviours are in play
 * at once, and conflating them produces assertions that prove nothing:
 *
 *   | Element        | Rendered                                   | How to assert                 |
 *   |----------------|--------------------------------------------|-------------------------------|
 *   | modal text     | <InterfaceText> emits ONE span, active lang | toContainText / not.toContain |
 *   | buttons        | BOTH int-en and int-he anchors, CSS hides   | toBeVisible / toBeHidden      |
 *   | header <h1>    | one per locale, gated on TRUTHINESS only    | toHaveCount(0) vs toBeHidden  |
 *
 * That last row is the subtle one: the header is not gated on the active interface language, so an
 * unauthored header is ABSENT from the DOM while the other locale's header is PRESENT but
 * CSS-hidden. `toHaveCount(0)` and `toBeHidden()` mean different things here and both are used.
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
  useInterfaceLanguage,
  expectInterfaceLanguage,
} from './strapi.fixtures.js';
import { LANGUAGES } from '../globals';

const scenario = SCENARIOS.publishedModalBothLocales;
const { byLocale } = scenario.expected.modal;

const CASES = [
  { lang: LANGUAGES.EN, anchor: 'int-en', otherAnchor: 'int-he', other: LANGUAGES.HE },
  { lang: LANGUAGES.HE, anchor: 'int-he', otherAnchor: 'int-en', other: LANGUAGES.EN },
];

test.describe('Strapi Modal — both locales published', () => {
  let har;

  test.beforeEach(async ({ page, context }) => {
    har = await routeWithStrapiHarFixture(context, scenario.har);
    await prepareStrapiPage(page, scenario);
  });

  test.afterEach(() => {
    expectStrapiServedFromHar(har);
  });

  for (const { lang, anchor, otherAnchor, other } of CASES) {
    test(`${lang} interface shows only its own locale's copy`, async ({ page }) => {
      await useInterfaceLanguage(page, lang);
      await page.goto(scenario.pagePath);
      await expectInterfaceLanguage(page, lang);

      const modal = page.locator('#interruptingMessageBox');
      await advanceUntilVisible(page, modal);

      // Text: InterfaceText emits one span, so the other locale's copy is absent, not just hidden.
      await expect(modal).toContainText(byLocale[lang].bodyText);
      await expect(modal).not.toContainText(byLocale[other].bodyText);

      // Button: both anchors exist; only this locale's is visible, with its own href (the two
      // locales point at different donation URLs).
      const button = modal.locator(`.buttons a.${anchor}`);
      await expect(button).toBeVisible();
      await expect(button).toHaveText(byLocale[lang].buttonText);
      await expect(button).toHaveAttribute('href', byLocale[lang].buttonURL);

      await expect(modal.locator(`.buttons a.${otherAnchor}`)).toBeHidden();
    });
  }

  /**
   * `modalHeader` is optional, so rather than hardcoding which locale happens to have one today,
   * assert the RULE: a header is displayed exactly when the GraphQL response carried one for the
   * active locale. Re-recording with different content changes only the descriptor; these tests
   * follow it.
   *
   * The negative case asserts no *visible* header rather than the absence of a specific element.
   * That is deliberately stronger: it also fails if the other locale's header — which is in the
   * DOM, since the <h1>s are gated on truthiness rather than on the active language — were to leak
   * through the CSS that should be hiding it.
   *
   * Caveat: if a future recording has no header in EITHER locale, both cases collapse to the
   * negative branch and the pair only proves that unauthored headers are not invented.
   */
  for (const { lang, anchor } of CASES) {
    test(`${lang} interface renders a header only when the response provided one`, async ({ page }) => {
      await useInterfaceLanguage(page, lang);
      await page.goto(scenario.pagePath);
      await expectInterfaceLanguage(page, lang);

      const modal = page.locator('#interruptingMessageBox');
      await advanceUntilVisible(page, modal);

      const { header } = byLocale[lang];

      if (header) {
        const shown = modal.locator(`h1.${anchor}`);
        await expect(shown).toBeVisible();
        await expect(shown).toHaveText(header);
      } else {
        await expect(modal.locator('h1:visible')).toHaveCount(0);
      }
    });
  }
});
