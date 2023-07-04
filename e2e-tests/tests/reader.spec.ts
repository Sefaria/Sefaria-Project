import { test, expect } from '@playwright/test';
import {goToPageWithLang} from '../utils';

test('Navigate to bereshit', async ({ context }) => {
  const page = await goToPageWithLang(context, '/texts');
  await page.getByRole('link', { name: 'Tanakh' }).click();
  await page.getByRole('link', { name: 'Genesis' }).click();
  await page.waitForSelector('text=Loading...', { state: 'detached' });
  await page.locator('.sectionLink').first().click();
  await expect(page).toHaveTitle(/Genesis 1/);
  // wait until Bereshit is visible
  await page.waitForSelector('text=Bereshit', { state: 'visible' });
  await page.getByText('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃').isVisible();
});

test('verify translations', async ({ page }) => {
  await page.goto('/Berakhot.28b.4?vhe=Wikisource_Talmud_Bavli&lang=bi&with=all&lang2=he');

  // Click second .contentSpan
  await page.click('.contentSpan:nth-child(2)');

  // click second .connectionsCount
  await page.click('.connectionsCount:nth-child(2)');

  // execute document.getElementsByClassName("versionSelect").length > 1 in the browser and return the result to the test
  const versionSelectLength = await page.evaluate(() => document.getElementsByClassName("versionSelect").length > 1);
  expect(versionSelectLength).toBeTruthy();

});

test('go to sources page', async ({ page }) => {
  await page.goto('/Berakhot.28b.4?vhe=Wikisource_Talmud_Bavli&lang=bi&with=all&lang2=he');

  await page.getByRole('link', { name: 'מקורות' }).click();

  await page.getByRole('link', { name: 'תנ"ך' }).isVisible();

});

