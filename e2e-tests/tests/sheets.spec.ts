import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/Berakhot.28b.4?vhe=Wikisource_Talmud_Bavli&lang=bi&with=all&lang2=he');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/ברכות/);
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

