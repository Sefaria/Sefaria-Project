import { test, expect, pageFetch } from '../fixtures';
import {
  anonymousContext, askForLink, checkYourEmail, expectLinkPage, expectThankYouPage, finishAboutYou, fixtures, openAs,
  mailedLinkPath, OnboardingRole, openDeveloperTab, sessionReady, sinceNow, visibleMessages,
} from './onboardingFixtures';
import { DeveloperSettingsPage } from '../../pages/developerSettingsPage';
import { t } from '../../globals';

/**
 * Developer onboarding by emailed link, with real mail captured by the local stack's Mailpit
 * (mocks off). Each describe owns one onboarding account and runs its tests in order, because
 * every test resets that account first.
 */

const COOLDOWN_MESSAGE = 'Wait a minute before asking for another email.';
const DAILY_LIMIT_MESSAGE = /You've asked for 5 links today/;

function localMailOnly(role: OnboardingRole) {
  test.beforeEach(async ({ target }) => {
    test.skip(target.name !== 'local' || !target.hasMailbox, 'needs the local stack: Mailpit and direct fixture resets');
    test.skip(target.mocks, 'mocks are on, so no mail is sent; N-C1 covers that journey');
    test.setTimeout(t(180000));
    await sessionReady(role);
  });
}

function activePanel(dev: DeveloperSettingsPage) {
  return dev.page.locator('.settingsPanel:not([hidden])');
}

test.describe('onboarding.unverified', () => {
  test.describe.configure({ mode: 'default' });
  localMailOnly('unverified');

  test('C1: the emailed link, opened in a second tab, confirms and the waiting tab continues to About you', async ({ account, target }) => {
    await fixtures.reset('unverified', 'F1');
    const { page, context, account: seeded } = await openAs(account, 'unverified');
    const dev = await openDeveloperTab(page);

    await dev.clickGetStarted();
    const ask = page.getByRole('region', { name: 'Confirm your email', exact: true });
    await expect(ask).toBeVisible();
    await expect(ask.locator('bdi[dir="ltr"] strong')).toHaveText(seeded.email);

    const since = sinceNow();
    const sent = await dev.sendConfirmation();
    expect(sent.status()).toBe(200);
    expect((await sent.json()).confirmationSentAt).toBeTruthy();
    await expect(checkYourEmail(page)).toBeVisible();
    await expect(checkYourEmail(page)).toContainText('The link works for 3 days.');

    const linkPath = await mailedLinkPath(target.name, seeded.email, since);
    const second = await context.newPage();
    await second.goto(linkPath, { waitUntil: 'domcontentloaded' });
    await expectThankYouPage(second);

    await expect(dev.onboardingCard().getByRole('heading', { name: 'About you' })).toBeVisible({ timeout: t(15000) });
    await expect(activePanel(dev).getByRole('status').filter({ hasText: 'Your email is confirmed.' })).toBeVisible();
    await finishAboutYou(dev);

    const facts = await fixtures.show('unverified');
    expect(facts).toMatchObject({ emailVerified: true, developerEnabled: true, hasProfile: true, confirmationSentAt: null });
  });

  test('C1: a link opened a second time shows "Already confirmed"', async ({ account, target }) => {
    await fixtures.reset('unverified', 'F1');
    const { page, context, account: seeded } = await openAs(account, 'unverified');
    await openDeveloperTab(page);
    const since = sinceNow();
    const sent = await pageFetch(page, '/api/developer/confirmation', { method: 'POST' });
    expect(sent.status, sent.text).toBe(200);
    const linkPath = await mailedLinkPath(target.name, seeded.email, since);

    const tab = await context.newPage();
    await tab.goto(linkPath, { waitUntil: 'domcontentloaded' });
    await expectThankYouPage(tab);

    const again = await tab.goto(linkPath, { waitUntil: 'domcontentloaded' });
    expect(again?.status()).toBe(200);
    await expectLinkPage(tab, 'Already confirmed');
    await expect(tab.getByText('This email address is already confirmed.')).toBeVisible();
    await expect(tab.locator('[data-agent-action="continue-to-developer-settings"]')).toHaveAttribute('href', '/settings/developer');
  });

  test('C1: a link opened logged out confirms the account, and the waiting tab continues by polling', async ({ account, browser, target }) => {
    await fixtures.reset('unverified', 'F1');
    const { page, account: seeded } = await openAs(account, 'unverified');
    const dev = await openDeveloperTab(page);
    const since = sinceNow();
    expect((await askForLink(dev)).status()).toBe(200);
    await expect(checkYourEmail(page)).toBeVisible();
    const linkPath = await mailedLinkPath(target.name, seeded.email, since);

    const elsewhere = await anonymousContext(browser, target.name);
    try {
      const other = await elsewhere.newPage();
      await other.goto(linkPath, { waitUntil: 'domcontentloaded' });
      await expectThankYouPage(other);
      expect(await other.evaluate(() => (window as any).Sefaria?._uid)).toBeNull();
    } finally {
      await elsewhere.close();
    }

    await expect(dev.onboardingCard().getByRole('heading', { name: 'About you' })).toBeVisible({ timeout: t(15000) });
    expect(await fixtures.show('unverified')).toMatchObject({ emailVerified: true, developerEnabled: true });
  });
});

test.describe('onboarding.expiredLink', () => {
  test.describe.configure({ mode: 'default' });
  localMailOnly('expiredLink');

  test('C1: an expired link offers "Send a new link", and the new link confirms without logging in', async ({ browser, target }) => {
    const seeded = await fixtures.reset('expiredLink', 'F2');
    const expired = await fixtures.expiredLink('expiredLink');
    expect(expired.email).toBe(seeded.email);

    const elsewhere = await anonymousContext(browser, target.name);
    try {
      const page = await elsewhere.newPage();
      const landed = await page.goto(expired.path, { waitUntil: 'domcontentloaded' });
      expect(landed?.status()).toBe(200);
      await expectLinkPage(page, 'This link has expired');
      await expect(page.getByText('Confirmation links work for 3 days.')).toBeVisible();

      const since = sinceNow();
      const renewed = page.waitForResponse(r => r.url().endsWith('/api/developer/confirmation/new-link') && r.request().method() === 'POST');
      await page.locator('[data-agent-action="send-new-link"]').click();
      expect((await renewed).status()).toBe(200);
      await expect(page.getByRole('status').filter({ hasText: 'We sent a new link. Check your email.' })).toBeVisible();
      await expect(page.locator('[data-agent-action="send-new-link"]')).toHaveCount(0);

      const fresh = await mailedLinkPath(target.name, seeded.email, since);
      expect(fresh).not.toBe(expired.path);
      await page.goto(fresh, { waitUntil: 'domcontentloaded' });
      await expectThankYouPage(page);
    } finally {
      await elsewhere.close();
    }
    expect(await fixtures.show('expiredLink')).toMatchObject({ emailVerified: true, developerEnabled: true, confirmationSentAt: null });
  });

  test('C1: "Send a new link" past the daily limit shows the server message as an alert', async ({ browser, target }) => {
    await fixtures.reset('expiredLink', 'F2', { sends: 5, sendsAgeMinutes: 30 });
    const expired = await fixtures.expiredLink('expiredLink');
    const elsewhere = await anonymousContext(browser, target.name);
    try {
      const page = await elsewhere.newPage();
      await page.goto(expired.path, { waitUntil: 'domcontentloaded' });
      await expectLinkPage(page, 'This link has expired');
      const renewed = page.waitForResponse(r => r.url().endsWith('/api/developer/confirmation/new-link') && r.request().method() === 'POST');
      await page.locator('[data-agent-action="send-new-link"]').click();
      const response = await renewed;
      expect(response.status()).toBe(429);
      expect(Number(response.headers()['retry-after'])).toBeGreaterThan(60);
      await expect(page.getByRole('alert')).toContainText(DAILY_LIMIT_MESSAGE);
      await expect(page.getByText('We sent a new link. Check your email.')).toHaveCount(0);
    } finally {
      await elsewhere.close();
    }
    expect(await fixtures.show('expiredLink')).toMatchObject({ emailVerified: false, sends: 5 });
  });
});

test.describe('onboarding.unverifiedResend', () => {
  test.describe.configure({ mode: 'default' });
  localMailOnly('unverifiedResend');

  test('C2: asking again within 60 s after Cancel is 429 with Retry-After, and the UI shows why @known-gap S1', async ({ account }) => {
    await fixtures.reset('unverifiedResend', 'F1');
    const { page } = await openAs(account, 'unverifiedResend');
    const dev = await openDeveloperTab(page);
    expect((await askForLink(dev)).status()).toBe(200);

    const cancelled = dev.waitForApi('confirmation', 'DELETE');
    await checkYourEmail(page).getByRole('button', { name: 'Cancel' }).click();
    expect((await cancelled).status()).toBe(200);

    const again = await askForLink(dev);
    expect(again.status()).toBe(429);
    expect(Number(again.headers()['retry-after'])).toBeGreaterThan(0);
    expect(Number(again.headers()['retry-after'])).toBeLessThanOrEqual(60);
    expect((await again.json()).error).toBe(COOLDOWN_MESSAGE);

    await expect(activePanel(dev).getByText(COOLDOWN_MESSAGE), `shown: ${await visibleMessages(page)}`).toBeVisible();
  });

  test('C2: "Resend the link" within 60 s does not claim "Sent again." and shows the server message @known-gap S1', async ({ account }) => {
    await fixtures.reset('unverifiedResend', 'F1');
    const { page } = await openAs(account, 'unverifiedResend');
    const dev = await openDeveloperTab(page);
    expect((await askForLink(dev)).status()).toBe(200);
    await expect(checkYourEmail(page)).toBeVisible();

    const resent = await dev.resendConfirmation();
    expect(resent.status()).toBe(429);
    expect(Number(resent.headers()['retry-after'])).toBeGreaterThan(0);

    await expect.soft(checkYourEmail(page).getByText('Sent again.'), 'a refused resend must not say it was sent').toHaveCount(0);
    await expect(activePanel(dev).getByText(COOLDOWN_MESSAGE), `shown: ${await visibleMessages(page)}`).toBeVisible();
  });

  test('C2: the 6th link in 24 h is 429 with the daily-limit message, and the UI shows it @known-gap S1', async ({ account }) => {
    const seeded = await fixtures.reset('unverifiedResend', 'F1', { sends: 5, sendsAgeMinutes: 30 });
    expect(seeded.sends).toBe(5);
    const { page } = await openAs(account, 'unverifiedResend');
    const dev = await openDeveloperTab(page);

    const sixth = await askForLink(dev);
    expect(sixth.status()).toBe(429);
    expect(Number(sixth.headers()['retry-after'])).toBeGreaterThan(60);
    expect((await sixth.json()).error).toMatch(DAILY_LIMIT_MESSAGE);
    expect((await fixtures.show('unverifiedResend')).sends).toBe(5);

    await expect(activePanel(dev).getByText(DAILY_LIMIT_MESSAGE), `shown: ${await visibleMessages(page)}`).toBeVisible();
  });

  test('N-C3: "Email me a confirmation link" after the address was confirmed elsewhere shows why it failed @known-gap S1', async ({ account }) => {
    await fixtures.reset('unverifiedResend', 'F1');
    const { page } = await openAs(account, 'unverifiedResend');
    const dev = await openDeveloperTab(page);
    await dev.clickGetStarted();
    await expect(page.getByRole('region', { name: 'Confirm your email', exact: true })).toBeVisible();

    await fixtures.verify('unverifiedResend');
    const sent = await dev.sendConfirmation();
    expect(sent.status()).toBe(400);
    expect((await sent.json()).error).toBe('Your email is already confirmed.');

    await expect(activePanel(dev).getByText('Your email is already confirmed.'), `shown: ${await visibleMessages(page)}`).toBeVisible();
  });

  test('N-C3: a refused double send is not carried over as a stale notice after onboarding @known-gap S1', async ({ account, target }) => {
    await fixtures.reset('unverifiedResend', 'F1');
    const { page, context, account: seeded } = await openAs(account, 'unverifiedResend');
    const dev = await openDeveloperTab(page);
    await dev.clickGetStarted();
    await expect(page.getByRole('region', { name: 'Confirm your email', exact: true })).toBeVisible();

    const since = sinceNow();
    const statuses: number[] = [];
    page.on('response', r => {
      if (r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/developer/confirmation') statuses.push(r.status());
    });
    await dev.action('send-confirmation').dblclick();
    await expect.poll(() => statuses.length, { timeout: t(15000) }).toBe(2);
    expect(statuses.sort()).toEqual([200, 429]);

    const linkPath = await mailedLinkPath(target.name, seeded.email, since);
    const tab = await context.newPage();
    await tab.goto(linkPath, { waitUntil: 'domcontentloaded' });
    await expectThankYouPage(tab);
    await finishAboutYou(dev);

    await expect(activePanel(dev).getByText(COOLDOWN_MESSAGE), `shown after onboarding: ${await visibleMessages(page)}`).toHaveCount(0);
  });
});

test.describe('onboarding.ssoVerified', () => {
  test.describe.configure({ mode: 'default' });
  localMailOnly('ssoVerified');

  test('N-C3: a refused Get started is shown before setup, and not carried over after onboarding @known-gap S1', async ({ account }) => {
    await fixtures.reset('ssoVerified', 'F4');
    const { page } = await openAs(account, 'ssoVerified');
    const dev = await openDeveloperTab(page);
    await expect(dev.action('get-started')).toBeVisible();

    await fixtures.dropSso('ssoVerified');
    const refused = dev.waitForApi('enable');
    await dev.clickGetStarted();
    const enable = await refused;
    expect(enable.status()).toBe(400);
    const refusal = (await enable.json()).error;
    expect(refusal).toBe('Confirm your email before turning on developer settings.');
    await expect.soft(activePanel(dev).getByText(refusal), `shown before setup: ${await visibleMessages(page)}`).toBeVisible();

    await fixtures.restoreSso('ssoVerified');
    const enabled = dev.waitForApi('enable');
    await dev.clickGetStarted();
    expect((await enabled).status()).toBe(200);
    await finishAboutYou(dev);
    await expect(activePanel(dev).getByText(refusal), `shown after onboarding: ${await visibleMessages(page)}`).toHaveCount(0);
  });
});

test.describe('onboarding with mocks on (cauldron)', () => {
  test('N-C1: the test-panel confirmation email confirms, and the waiting tab continues to About you', async ({ account, target }) => {
    test.skip(!target.mocks, 'needs DEVELOPER_SETTINGS_MOCKS on (the cauldron)');
    const { page, context } = await openAs(account, 'unverified');
    const dev = await openDeveloperTab(page);
    const sent = await askForLink(dev);
    expect(sent.status()).toBe(200);
    await expect(checkYourEmail(page)).toBeVisible();

    const pill = page.getByRole('button', { name: /Test controls/ });
    if (await pill.getAttribute('aria-expanded') === 'false') await pill.click();
    await dev.action('mock-open-email').click();
    const mail = page.getByRole('dialog', { name: 'Confirmation email' });
    await expect(mail).toBeVisible();
    const [confirmTab] = await Promise.all([
      context.waitForEvent('page'),
      mail.locator('[data-agent-action="mock-confirm-email"]').click(),
    ]);
    await confirmTab.waitForLoadState('domcontentloaded');
    await expectThankYouPage(confirmTab);

    await expect(dev.onboardingCard().getByRole('heading', { name: 'About you' })).toBeVisible({ timeout: t(15000) });
    await expect(activePanel(dev).getByRole('status').filter({ hasText: 'Your email is confirmed.' })).toBeVisible();
  });
});
