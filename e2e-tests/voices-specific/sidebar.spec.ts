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
    // Logged-out: clicking Create should go to login
    await pm.onModuleHeader().logout();
    await pm.onModuleSidebar().clickAndVerifyModuleButton({
      headingText: 'Create',
      buttonText: 'Create'
    });
    expect(page.url()).toMatch(/\/login/);

    // Logged-in: clicking Create should navigate to sheet creation
    await pm.onModuleHeader().loginWithCredentials(MODULE_URLS.VOICES, true);
    await page.goto(MODULE_URLS.VOICES);

    const resultPage = await pm.onModuleSidebar().clickAndVerifyModuleButton({
      headingText: 'Create',
      buttonText: 'Create'
    });
    expect(resultPage?.url()).toMatch(/\/sheets\//);
    if (resultPage && resultPage !== page) {
      await resultPage.close();
    }

    await pm.onModuleHeader().logout();
  });

  test('MOD-S015: Voices - Learn More navigates to sheet', async () => {
    const resultPage = await pm.onModuleSidebar().clickAndVerifyModuleButton({
      headingText: 'What is Voices on Sefaria?',
      buttonText: 'Learn More'
    });
    expect(resultPage?.url()).toMatch(/\/sheets\//);
    if (resultPage && resultPage !== page) {
      await resultPage.close();
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
