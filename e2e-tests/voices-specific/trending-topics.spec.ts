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
import { MODULE_URLS } from '../constants';

// List of valid topics for testing trending topics
const VALID_TOPICS = [
  'Abraham', 'Afterlife', 'Angels', 'Animals', 'Apocrypha', 'Aramaic',
  'Astronomy', 'Bible', 'Blessings', 'Charity', 'Commandments', 'Community',
  'Customs', 'Demons', 'Ethics', 'Fasting', 'Festivals', 'Food',
  'Forgiveness', 'Gematria', 'God', 'Halakha', 'Healing', 'Heaven',
  'Hell', 'Holiness', 'Holy Days', 'Hospitality', 'Houses', 'Humanity'
];

function getRandomTopic(): string {
  return VALID_TOPICS[Math.floor(Math.random() * VALID_TOPICS.length)];
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

  // Add topic via autocomplete
  const topicInput = page.locator('.react-tags__search-input').first();
  await topicInput.click();
  await topicInput.fill(topicName);
  await page.waitForTimeout(800);

  const suggestion = page.locator('.react-tags__suggestions li').first();
  await suggestion.click();
  await page.waitForTimeout(500);

  // Verify topic was added
  const addedTag = page.locator('.react-tags__selected-tag').filter({ hasText: topicName });
  await expect(addedTag).toBeVisible();

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
    const adminResetUrl = `${sandbox_url}/admin/reset/api/sheets/trending-tags`;
    await page.goto(adminResetUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Navigate to Voices > Topics and verify topic appears in Trending Topics sidebar
    await pm.onModuleHeader().logout();
    await page.goto(`${MODULE_URLS.VOICES}/topics`);
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    const trendingTopicsModule = pm.onModuleSidebar().getModuleByHeading('Trending Topics');
    const topicInTrendingSidebar = trendingTopicsModule.locator(`text=${topicName}`);
    await expect(topicInTrendingSidebar).toBeVisible();

    await pm.onModuleHeader().logout();
  });
});
