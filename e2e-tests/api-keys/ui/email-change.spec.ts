import { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { readPassword } from '../env';
import {
  askForLink, checkYourEmail, expectLinkPage, fixtures, openAs, mailedLinkPath, openDeveloperTab, sessionReady, sinceNow,
  visibleMessages,
} from './onboardingFixtures';
import { DeveloperSettingsPage } from '../../pages/developerSettingsPage';
import { t } from '../../globals';

/**
 * Changing the account email in the Account tab, and what the developer tab and emailed links do
 * after it. Uses onboarding.ssoUnverified as a plain password account: its fixture states here
 * carry no Google login, because the Account tab offers no email change to SSO accounts.
 */

const ROLE = 'ssoUnverified' as const;

function newAddress(): string {
  return `apikeys-e2e-onboarding-ssounverified-moved${Date.now().toString(36)}@example.com`;
}

/** Account tab → Change Email → Update Email, through the in-app tab link (no reload). */
async function changeEmailInAccountTab(dev: DeveloperSettingsPage, email: string) {
  const page: Page = dev.page;
  await dev.accountTabLink().click();
  await expect(page).toHaveURL(/\/settings\/account$/);
  await page.locator('#change-email').click();
  await page.locator('#username-change-edit #email').fill(email);
  await page.locator('#username-change-edit #confirmEmail').fill(email);
  await page.locator('#username-change-edit #confirmPassword').fill(readPassword());
  const saved = page.waitForResponse(r => new URL(r.url()).pathname === '/settings/account/user' && r.request().method() === 'POST');
  await page.locator('#update-email').click();
  const body = await (await saved).json();
  expect(body, 'email change accepted').toEqual({ status: 'ok' });
  await expect(page.locator('#email-edit-ok')).toHaveText('Email was successfully changed!');
}

test.describe('onboarding.ssoUnverified: email changes', () => {
  test.describe.configure({ mode: 'default' });

  test.beforeEach(async ({ target }) => {
    test.skip(target.name !== 'local' || !target.hasMailbox, 'needs the local stack: Mailpit and direct fixture resets');
    test.skip(target.mocks, 'mocks are on, so no mail is sent');
    test.setTimeout(t(180000));
    await sessionReady(ROLE);
  });

  test.afterEach(async () => {
    await fixtures.reset(ROLE, 'F5');
  });

  test('C1: a link sent to a former address shows "This link is no longer valid" and confirms nothing', async ({ account, target }) => {
    const seeded = await fixtures.reset(ROLE, 'F1');
    expect(seeded.sso).toEqual([]);
    const { page, context } = await openAs(account, ROLE);
    const dev = await openDeveloperTab(page);
    const since = sinceNow();
    expect((await askForLink(dev)).status()).toBe(200);
    await expect(checkYourEmail(page)).toBeVisible();
    const oldLink = await mailedLinkPath(target.name, seeded.email, since);

    const moved = newAddress();
    await changeEmailInAccountTab(dev, moved);

    const tab = await context.newPage();
    const landed = await tab.goto(oldLink, { waitUntil: 'domcontentloaded' });
    expect(landed?.status()).toBe(200);
    await expectLinkPage(tab, 'This link is no longer valid');
    await expect(tab.getByText('It was sent to an address that is no longer your account email.')).toBeVisible();

    const facts = await fixtures.show(ROLE);
    expect(facts.email).toBe(moved);
    expect(facts.emailVerified).toBe(false);
    expect(facts.developerEnabled).toBe(false);
  });

  test('N-C8: after an email change in the Account tab, the Developer tab asks to confirm the new address without a reload @known-gap S5', async ({ account }) => {
    await fixtures.reset(ROLE, 'F7');
    const { page } = await openAs(account, ROLE);
    const dev = await openDeveloperTab(page);
    await expect(dev.newProjectButton()).toBeVisible();

    const moved = newAddress();
    await changeEmailInAccountTab(dev, moved);
    await dev.developerTabLink().click();
    await expect(page).toHaveURL(/\/settings\/developer$/);

    const reconfirm = page.getByRole('region', { name: 'Confirm your new email' });
    await expect.soft(reconfirm, `shown: ${await visibleMessages(page)}`).toBeVisible();
    await expect.soft(reconfirm.locator('bdi[dir="ltr"] strong')).toHaveText(moved);
    await expect.soft(dev.newProjectButton(), 'no "New project" until the new address is confirmed').toHaveCount(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(reconfirm, 'after a reload the server state shows the reconfirm region').toBeVisible();
    await expect(dev.newProjectButton()).toHaveCount(0);
  });
});
