import { test } from '@playwright/test';
import {goToPageWithLang} from '../utils';


test('Go to topic page', async ({ context }) => {
  const page = await goToPageWithLang(context, '/topics');
  await page.getByRole('link', { name: 'Holidays' }).click();
  await page.getByRole('link', { name: 'Rosh Hashanah' }).isVisible();
});


test('Filter topics', async ({ context }) => {
  const page = await goToPageWithLang(context, '/topics/all/a');
  // wait for getByText('Loading...') to disappear
  await page.waitForSelector('text=Loading...', { state: 'detached' });
  await page.getByPlaceholder('Search Topics').fill('Rosh Hashanah');
  await page.locator('div').filter({ hasText: /^Rosh HashanahRosh Hashanah and Yom Kippur Prayers$/ }).getByRole('link', { name: 'Rosh Hashanah', exact: true }).isVisible();
  await page.getByPlaceholder('Search Topics').fill('Shabbat');
  await page.locator('div').filter({ hasText: /^Rosh HashanahRosh Hashanah and Yom Kippur Prayers$/ }).getByRole('link', { name: 'Rosh Hashanah', exact: true }).isHidden();
  await page.locator('div').filter({ hasText: /^ShabbatThe Prohibitions of Shabbat$/ }).getByRole('link', { name: 'Shabbat', exact: true }).click();
  // wait for getByText('Loading...') to disappear
  await page.waitForSelector('text=Loading...', { state: 'detached' });
  await page.getByRole('link', { name: 'Kiddush', exact: true }).isVisible();
});
 
test('Toggle sources and sheets', async ({ context }) => {
  // fill in test
  const page = await goToPageWithLang(context, '/topics');
  await page.getByRole('link', { name: 'Holidays' }).click();
  await page.getByRole('link', { name: 'Rosh Hashanah' }).click();
  await page.waitForSelector('text=Loading...', { state: 'detached' });
  await page.getByRole('link').filter({ hasText: /^Day of Atonement$/ }).isVisible();
})