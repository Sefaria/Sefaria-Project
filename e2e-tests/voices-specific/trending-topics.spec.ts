/*
 * PURPOSE: Test trending topics functionality for the Voices module
 *   - Publish sheets with a random topic from multiple users
 *   - Trigger trending-tags calculation via Django admin API
 *   - Verify topic appears in Trending Topics sidebar section
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS, VALID_TOPICS } from '../constants';

// Get random display name from VALID_TOPICS constant
function getRandomTopic(): string {
  const displayNames = Object.values(VALID_TOPICS);
  return displayNames[Math.floor(Math.random() * displayNames.length)];
}

async function createAndPublishSheetWithTopic(
  page: Page,
  pm: PageManager,
  topicName: string,
  sheetTitle: string
): Promise<void> {
  const createButton = page.getByRole('banner').getByRole('button', { name: /create/i });
  const createLink = page.getByRole('banner').getByRole('link', { name: /create/i });
  const initialUrl = page.url();

  await hideAllModalsAndPopups(page);

  if (await createLink.count() > 0) {
    await createLink.click();
  } else {
    await createButton.click();
  }

  // Navigate to sheet editor
  await page.waitForURL(url => url.toString() !== initialUrl, { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  await hideAllModalsAndPopups(page);
  await pm.onModuleHeader().closeGuideOverlay();

  const currentUrl = page.url();
  const isValidSheet = /\/sheets\/(new|\d+)/.test(currentUrl);
  expect(isValidSheet).toBeTruthy();

  await page.waitForTimeout(2000);

  // Add content to the sheet
  const editorArea = page.locator('[contenteditable="true"]').first();
  await editorArea.click();
  await editorArea.type(`Test sheet about ${topicName}`);

  // Open publish dialog
  const publishButton = page.getByRole('button', { name: /publish/i });
  await expect(publishButton).toBeVisible();
  await publishButton.click();
  await page.waitForTimeout(500);

  // Fill in publish form
  const titleInput = page.locator('input[type="text"]').first();
  await titleInput.clear();
  await titleInput.fill(sheetTitle);

  const summaryTextarea = page.locator('textarea').first();
  await summaryTextarea.clear();
  await summaryTextarea.fill(`Test sheet about ${topicName}`);

  // Add topic by typing and clicking the autocomplete suggestion
  const topicInput = page.locator('.react-tags__search-input').first();
  await topicInput.click();
  await topicInput.fill(topicName);

  // Wait for autocomplete suggestion to appear and click it
  const topicSuggestion = page.locator('.react-tags__suggestions li').filter({ hasText: new RegExp(topicName, 'i') }).first();
  await expect(topicSuggestion).toBeVisible({ timeout: 5000 }).catch(() => {
    throw new Error(`Autocomplete suggestion for "${topicName}" did not appear`);
  });
  await topicSuggestion.click();
  await page.waitForTimeout(500);

  // Verify topic was added as a tag
  const addedTag = page.locator('.react-tags__selected-tag').filter({ hasText: topicName });
  await expect(addedTag).toBeVisible({ timeout: 5000 }).catch(() => {
    throw new Error(`Topic "${topicName}" was not added to the sheet. Ensure the topic is valid.`);
  });

  // Publish sheet
  const publishModalButton = page.locator('button').filter({ hasText: /publish/i }).last();
  await publishModalButton.click();

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await hideAllModalsAndPopups(page);
}

test.describe('Voices Module - Trending Topics', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.VOICES, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  test('Publish sheets with same topic from multiple users and verify in Trending Topics', async () => {
    const topicName = getRandomTopic();
    const sandbox_url = process.env.SANDBOX_URL || 'https://voices.modularization.cauldron.sefaria.org';

    // User 1 logs in and publishes sheet
    await pm.onModuleHeader().loginWithCredentials(MODULE_URLS.VOICES, false);
    await page.goto(MODULE_URLS.VOICES);
    await hideAllModalsAndPopups(page);

    expect(await pm.onModuleHeader().isLoggedIn()).toBe(true);
    await createAndPublishSheetWithTopic(page, pm, topicName, `User 1 - ${topicName} Sheet`);

    // User 1 logs out
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await pm.onModuleHeader().logout();
    expect(await pm.onModuleHeader().isLoggedIn()).toBe(false);

    // User 2 logs in and publishes sheet with same topic
    await page.goto(MODULE_URLS.VOICES);
    await hideAllModalsAndPopups(page);

    await pm.onModuleHeader().loginWithCredentials(MODULE_URLS.VOICES, true);
    await page.goto(MODULE_URLS.VOICES);
    await hideAllModalsAndPopups(page);

    expect(await pm.onModuleHeader().isLoggedIn()).toBe(true);
    await createAndPublishSheetWithTopic(page, pm, topicName, `User 2 - ${topicName} Sheet`);

    // Trigger trending-tags calculation via Django admin API
    // First, navigate to the admin reset URL (may redirect to backstage login if not authenticated)
    const adminResetUrl = `${sandbox_url}/admin/reset/api/sheets/trending-tags`;
    await page.goto(adminResetUrl);
    await page.waitForLoadState('networkidle');

    // Check if we're on the backstage login page
    const emailInput = page.locator('input[name="email"]');
    if (await emailInput.count() > 0) {
      // We need to log in with superuser credentials
      const superUserEmail = process.env.PLAYWRIGHT_SUPERUSER_EMAIL || '';
      const superUserPassword = process.env.PLAYWRIGHT_SUPERUSER_PASSWORD || '';

      if (!superUserEmail || !superUserPassword) {
        throw new Error('Superuser credentials not found in environment variables');
      }

      await emailInput.fill(superUserEmail);
      const passwordInput = page.locator('input[name="password"]');
      await passwordInput.fill(superUserPassword);

      const submitButton = page.locator('input[type="submit"]');
      await submitButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    } else {
      // Already authenticated, just wait for the reset to complete
      await page.waitForTimeout(2000);
    }

    // Navigate to Voices > Topics and verify topic appears in Trending Topics sidebar
    await pm.onModuleHeader().logout();
    await page.goto(`${MODULE_URLS.VOICES}/topics`);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    const trendingTopicsModule = pm.onModuleSidebar().getModuleByHeading('Trending Topics');
    const topicInTrendingSidebar = trendingTopicsModule.locator('a, li, div').filter({ hasText: new RegExp(topicName, 'i') }).first();
    await expect(topicInTrendingSidebar).toBeVisible({ timeout: 10000 }).catch(() => {
      throw new Error(`Topic "${topicName}" did not appear in Trending Topics sidebar after reset`);
    });

    await pm.onModuleHeader().logout();

    // Log the topic name for reference
    console.log(`Random Topic choosen ${topicName}`)
  });
});
