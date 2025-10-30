/*
 * PURPOSE: Test sidebar and footer functionality for the Voices module
 *   - Voices sidebar modules and buttons
 *   - Create button auth behavior
 *   - Learn More navigation
 *   - Subscribe button
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

test.describe('Voices Module Sidebar Tests', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.VOICES, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  test('MOD-S013: Voices - sidebar modules and buttons', async () => {
    // Verify Voices modules and descriptive text
    await pm.onModuleSidebar().verifyModuleHasText('What is Voices on Sefaria?');
    await pm.onModuleSidebar().verifyModuleHasText('Create');
    await pm.onModuleSidebar().verifyModuleHasText('Get Updates');

    // Verify Learn More button exists and links to a sheet or page
    await pm.onModuleSidebar().verifyModuleButton({
      headingText: 'What is Voices on Sefaria?',
      buttonText: 'Learn More',
      href: /\/sheets\//
    });

    // Verify Create button leads to new sheet
    await pm.onModuleSidebar().verifyModuleButton({
      headingText: 'Create',
      buttonText: 'Create',
      href: /\/sheets\/new|\/sheets\//,
      isRoleButton: false
    });

    // Verify Subscribe button points to newsletter
    await pm.onModuleSidebar().verifyModuleButton({
      headingText: 'Get Updates',
      buttonText: 'Subscribe',
      href: /newsletter|sefar/
    });
  });

  test('MOD-S014: Voices - Create button auth behavior', async () => {
    // Ensure logged-out state first
    await pm.onModuleHeader().logout();

    const module = pm.onModuleSidebar().getModuleByHeading('Create');
    const createButton = module.locator('a').filter({ hasText: 'Create' }).first();
    await expect(createButton).toBeVisible();

    // Logged-out: clicking Create should go to login
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
      createButton.click()
    ]);
    expect(page.url()).toMatch(/\/login/);

    // Now login and try again
    await pm.onModuleHeader().loginWithCredentials(MODULE_URLS.VOICES, true);

    // After login, go back to Voices page to ensure stable starting point
    await page.goto(MODULE_URLS.VOICES);

    // Click Create when logged in
    const createBtnModule = pm.onModuleSidebar().getModuleByHeading('Create');
    const createButton2 = createBtnModule.locator('a').filter({ hasText: 'Create' }).first();
    const target = await createButton2.getAttribute('target');
    if (target === '_blank') {
      const [newPage] = await Promise.all([
        page.context().waitForEvent('page'),
        createButton2.click()
      ]);
      await newPage.waitForLoadState('domcontentloaded');
      expect(newPage.url()).toMatch(/\/sheets\//);
      await newPage.close();
    } else {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        createButton2.click()
      ]);
      expect(page.url()).toMatch(/\/sheets\//);
    }

    // Cleanup: logout
    await pm.onModuleHeader().logout();
  });

  test('MOD-S015: Voices - Learn More navigates to sheet', async () => {
    const module = pm.onModuleSidebar().getModuleByHeading('What is Voices on Sefaria?');
    const learn = module.locator('a').filter({ hasText: 'Learn More' }).first();
    await expect(learn).toBeVisible();

    const target = await learn.getAttribute('target');
    if (target === '_blank') {
      const [newPage] = await Promise.all([
        page.context().waitForEvent('page'),
        learn.click()
      ]);
      await newPage.waitForLoadState('domcontentloaded');
      expect(newPage.url()).toMatch(/\/sheets\//);
      await newPage.close();
    } else {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        learn.click()
      ]);
      expect(page.url()).toMatch(/\/sheets\//);
    }
  });

  test('MOD-S016: Voices - Subscribe opens newsletter', async () => {
    const module = pm.onModuleSidebar().getModuleByHeading('Get Updates');
    const subscribe = module.locator('a').filter({ hasText: 'Subscribe' }).first();
    await expect(subscribe).toBeVisible();

    const href = await subscribe.getAttribute('href');
    expect(href).toMatch(/newsletter|sefaria/);
  });
});
