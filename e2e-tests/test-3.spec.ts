import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:8000/texts');
  await page.getByText('A Living Library of TorahSefaria is home to 3,000 years of Jewish texts. We are ').click();
  await page.goto('http://localhost:8000/texts');
  await page.getByRole('link', { name: 'Mishnah' }).click();
  await page.locator('body').press('Meta+f');
  await page.goto('http://localhost:8000/texts/Mishnah');
  await page.getByRole('link', { name: 'Mishnat Eretz Yisrael' }).click();
  await page.getByRole('link', { name: 'Pirkei Avot' }).click();
  await page.getByRole('link', { name: 'Introduction' }).click();
  await page.getByText('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor i').first().click();
  await page.locator('a').filter({ hasText: 'Add to Sheet' }).click();
});