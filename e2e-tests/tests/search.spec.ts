import { test, expect } from '@playwright/test';
import {goToPageWithLang} from '../utils';

test('Search auto complete', async ({ context }) => {
  const page = await goToPageWithLang(context, '/');
  await page.getByPlaceholder('Search').fill('אהבה');
  await page.waitForSelector('text=אהבה', { state: 'visible' });
  await page.getByRole('option', { name: 'אהבה', exact: true }).click();
  await expect(page).toHaveTitle(/Love/);
});

test('Search for Deuteronomy book', async ({ context }) => {
  const page = await goToPageWithLang(context, '/');
  await page.getByPlaceholder('Search').fill('Deuteronomy');
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle(/Deuteronomy/);
});

// test('Search for a common phrase', async ({ context }) => {
//   const page = await goToPageWithLang(context, '/');
//   await page.getByPlaceholder('Search').fill('ויאמר משה');
//   await page.keyboard.press('Enter');
//   // get text from the first result in class="searchResultCount"
//   const firstResult: any = await page.locator('.searchResultCount').first().innerText();
//   // extract the number of results from the text and convert 13,000 to 13000
//   const numberOfResults = firstResult.replace(/,/g, '').replace(/[^0-9]/g, '');
//   expect(parseInt(numberOfResults)).toBeGreaterThan(5000);
// });

test('Search in this text', async ({ context }) => {
  // fill in test
});