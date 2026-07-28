import { test, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * The Library Assistant promo (ChatbotExperimentBanner in SiteWideBanner.jsx)
 * is normally hidden from anonymous first-session visitors — it only shows to
 * returning visitors. The `showPromo=la` URL param (used by email campaigns)
 * forces it for first-session visitors too, while still respecting a prior
 * explicit dismissal.
 *
 * Every test here uses a fresh anonymous context, i.e. a first-session
 * visitor, the exact audience the param exists for.
 *
 * NOTE: the banner is also gated server-side by the
 * `feature.client.show_join_chatbot_banner` remote-config flag. If that flag
 * is off on the sandbox, the "visible" assertions here cannot pass — that is
 * an environment configuration gap, not a product regression.
 */

test.describe('Library LA promo — showPromo URL param', () => {
  let page: Page;
  let pm: PageManager;

  test('LAP-001: first-session visitor with showPromo=la sees the LA promo banner', async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts?showPromo=la`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);

    await pm.onSitePromoBanner().expectVisible();
  });

  test('LAP-002: first-session visitor without the param does not see the LA promo banner', async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);

    await pm.onSitePromoBanner().expectHidden();
  });

  test('LAP-003: showPromo=la still respects a prior dismissal', async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts?showPromo=la`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);

    // Dismiss for real through the UI so the test exercises the actual
    // backoff-dismissal storage rather than hand-seeded internals.
    await pm.onSitePromoBanner().dismissWithMaybeLater();

    // Land again from the campaign link — same visitor, same session.
    await page.goto(`${MODULE_URLS.EN.LIBRARY}/texts?showPromo=la`, { waitUntil: 'domcontentloaded' });
    await hideAllModalsAndPopups(page);

    await pm.onSitePromoBanner().expectHidden();
  });

  test('LAP-004: an unknown promo name does not force the banner', async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts?showPromo=notARealPromo`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);

    await pm.onSitePromoBanner().expectHidden();
  });
});
