import { expect, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { t } from '../globals';

/**
 * Page object for the SiteWideBanner promo (SiteWideBanner.jsx) — the
 * Library Assistant / signup promo bar rendered above the reader panels on
 * the Library module. Not to be confused with the header `Banner` page
 * object (site navigation) or the Strapi `#bannerMessage` banner.
 *
 * The backoff-dismissal variant of this banner renders a "Maybe later"
 * button (`.siteWideBannerMaybeLater`) instead of the `.siteWideBannerClose`
 * X, so `hideAllModalsAndPopups` does NOT auto-dismiss it — visibility
 * assertions here are safe after the standard entry-point helpers.
 */
export class SitePromoBannerPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  private get banner() {
    return this.page.locator('.siteWideBanner:not(.hidden) .siteWideBannerContent');
  }

  private get maybeLaterButton() {
    return this.banner.locator('.siteWideBannerMaybeLater');
  }

  async expectVisible() {
    await expect(this.banner).toBeVisible({ timeout: t(15000) });
  }

  async expectHidden() {
    // The banner renders synchronously with hydration (no async fetch), so an
    // absent banner after the entry helper's hydration wait is a stable state.
    await expect(this.banner).toBeHidden({ timeout: t(10000) });
  }

  async dismissWithMaybeLater() {
    await expect(this.maybeLaterButton).toBeVisible({ timeout: t(10000) });
    await this.maybeLaterButton.click();
    await expect(this.banner).toBeHidden({ timeout: t(5000) });
  }
}
