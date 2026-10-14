// Steps for features/assistant/cookie-banner.feature (general-scope part: wide windows).
import { expect } from '@playwright/test';
import { Given, Then } from '../support/fixtures';
import { t } from '../../globals';
import { near } from './_helpers';

Given('the visitor has not accepted cookies, so the cookie banner is shown', async ({ visitor }) => {
  visitor.cookiesAccepted = false;
  if (visitor.isOpen) {
    await visitor.context.clearCookies({ name: 'cookiesNotificationAccepted' });
    await (await visitor.page()).reload({ waitUntil: 'domcontentloaded' });
  }
  await expect((await visitor.la()).cookieBanner).toBeVisible({ timeout: t(10000) });
});

Then('the cookie banner is a card in the corner', async ({ visitor }) => {
  const la = await visitor.la();
  await expect(la.cookieBanner).toBeVisible();
  const box = await la.box(la.cookieBanner);
  const vp = la.page.viewportSize()!;
  expect(box.width, 'a card, not a full-width bar').toBeLessThan(vp.width / 2);
  expect(vp.height - (box.y + box.height), 'at the bottom').toBeLessThanOrEqual(32);
  expect(Math.min(box.x, vp.width - (box.x + box.width)), 'in a corner').toBeLessThanOrEqual(32);
});

Then('the Ask button stays 24px above the bottom of the screen', async ({ visitor }) => {
  const la = await visitor.la();
  await la.ensureClosed();
  await expect(la.askButton).toBeVisible({ timeout: t(10000) });
  const box = await la.box(la.askButton);
  near(la.page.viewportSize()!.height - (box.y + box.height), 24);
});
