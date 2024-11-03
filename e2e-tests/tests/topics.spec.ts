import { test } from '@playwright/test';
import {goToPageWithLang} from '../utils';
import {LANGUAGES} from "../globals";


test('Go to topic page', async ({ context }) => {
  const page = await goToPageWithLang(context, '/topics');
  await page.getByRole('link', { name: 'Jewish Calendar' }).click();
  await page.getByRole('link', { name: 'Rosh Hashanah' }).first().isVisible();
});

test('Check source', async ({ context }) => {
  const page = await goToPageWithLang(context, '/topics');
  await page.getByRole('link', { name: 'Jewish Calendar' }).click();
  await page.getByRole('link', { name: 'Shabbat' }).first().click();
  await page.getByRole('link', { name: 'Notable Sources' }).first().isVisible();
  await page.getByRole('link', { name: 'All Sources' }).first().isVisible();
});

test('Check sources he interface', async ({ context }) => {
  const page = await goToPageWithLang(context, '/topics', LANGUAGES.HE);
  await page.getByRole('link', { name: 'מועדי השנה' }).click();
  await page.getByRole('link', { name: 'שבת' }).first().click();
  await page.getByRole('link', { name: 'מקורות מרכזיים' }).first().isVisible();
  await page.getByRole('link', { name: 'כל המקורות' }).first().isVisible();
});

test('Check author page', async ({ context }) => {
  const page = await goToPageWithLang(context, '/topics/jonathan-sacks');
  await page.getByRole('link', { name: 'Works on Sefaria' }).first().isVisible();
});

test('Check redirection for sourcesless topic', async ({ context }) => {
  const page = await goToPageWithLang(context, '/topics/Monkey');
  await page.waitForURL('https://example.com/target', { timeout: 5000 });
  await page.getByRole('link', { name: 'Works on Sefaria' }).first().isVisible();
});

test('Filter topics', async ({ context }) => {
  const page = await goToPageWithLang(context, '/topics/all/a');
  // wait for getByText('Loading...') to disappear
  await page.waitForSelector('text=Loading...', { state: 'detached' });
  await page.getByPlaceholder('Search Topics').fill('Rosh Hashanah');
  await page.locator('div').filter({ hasText: /^Rosh HashanahRosh Hashanah and Yom Kippur Prayers$/ }).getByRole('link', { name: 'Rosh Hashanah', exact: true }).isVisible();
  await page.getByPlaceholder('Search Topics').fill('Shabbat');
  await page.locator('div').filter({ hasText: /^Rosh HashanahRosh Hashanah and Yom Kippur Prayers$/ }).getByRole('link', { name: 'Rosh Hashanah', exact: true }).isHidden();
  await page.getByRole('link', { name: 'Shabbat', exact: true }).first().click();
  // wait for getByText('Loading...') to disappear
  await page.waitForSelector('text=Loading...', { state: 'detached' });
  await page.getByRole('link', { name: 'Kiddush', exact: true }).isVisible();
});
 
test('Toggle sources and sheets', async ({ context }) => {
  // fill in test
})