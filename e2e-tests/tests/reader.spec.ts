import { test, expect } from '@playwright/test';
import {goToPageWithLang, goToPageWithUser} from '../utils';

test('Navigate to bereshit', async ({ context }) => {
  const page = await goToPageWithLang(context, '/texts');
  await page.getByRole('link', { name: 'Tanakh' }).click();
  await page.getByRole('link', { name: 'Genesis', exact: true }).click();
  await page.waitForSelector('text=Loading...', { state: 'detached' });
  await page.locator('.sectionLink').first().click();
  await expect(page).toHaveTitle(/Genesis 1/);
  // wait until Bereshit is visible
  await page.getByRole('heading', { name: 'Loading...' }).getByText('Loading...').waitFor({ state: 'detached' });
  await page.waitForSelector('text=Bereshit', { state: 'visible' });
  await page.getByText('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃').isVisible();
});

test('Verify translations', async ({ context }) => {
  const page = await goToPageWithLang(context, '/Berakhot.28b.4?vhe=Wikisource_Talmud_Bavli&lang=bi&with=all&lang2=he');
  await page.getByRole('link', { name: 'Translations (4)' }).click();
  await page.locator('#panel-1').getByText('Loading...').waitFor({ state: 'detached' });
  page.getByText('A. Cohen, Cambridge University Press, 1921', { exact: true })
});

test('Get word description', async ({ context }) => {
  const page = await goToPageWithLang(context, '/Berakhot.28b.4?vhe=Wikisource_Talmud_Bavli&lang=bi&with=all&lang2=he');
  await page.getByRole('link', { name: 'ר\' נחוניא בן הקנה' }).click();
  await page.locator('#panel-1').getByText('Loading...').waitFor({ state: 'detached' });
  await page.getByText('Looking up words...').waitFor({ state: 'detached' });
  await page.getByText('Tannaim - Third Generation').isVisible();
});


test('Open panel window', async ({ context }) => {
  const page = await goToPageWithLang(context, '/Berakhot.28b.4?vhe=Wikisource_Talmud_Bavli&lang=bi&with=all&lang2=he');
  await page.getByText('ולית הלכתא לא כרב הונא ולא כריב"ל כרב הונא הא דאמרן כריב"ל דאריב"ל כיון שהגיע זמ').click();
  await page.locator('#panel-1').getByText('Loading...').waitFor({ state: 'detached' });
  await page.getByRole('link', { name: 'תלמוד (1)' }).click();
  await page.getByRole('link', { name: 'שבת (1) מלאכות האסורות בשבת ודינים הקשורים לקדושת היום.' }).click();
  await page.getByText('טעינה...').waitFor({ state: 'detached' });
  await page.getByRole('link', { name: 'Open' }).click();
  await page.getByRole('heading', { name: 'Loading...' }).getByText('Loading...').waitFor({ state: 'detached' });
  await page.getByRole('link', { name: 'Show Connection Panel contents for Berakhot' }).isVisible();
  await page.getByRole('link', { name: 'Show Connection Panel contents for Shabbat' }).isVisible();
});

// test('Bookmark page', async ({ context }) => {
//   const page = await goToPageWithUser(context, '/Genesis.1.1?lang=he&with=all&lang2=he');
//   await page.getByText('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃').click();
//   // if we reach the page and it is already bookmarked, undo it
//   await page.getByRole('button', { name: 'Remove "Genesis 1:1"' }).isVisible() && await page.getByRole('button', { name: 'Remove "Genesis 1:1"' }).click();
//   await page.getByRole('button', { name: 'Save "Genesis 1:1"' }).click();
//   await page.getByRole('link', { name: 'See My Saved Texts' }).click();
//   await page.waitForSelector('text=Genesis 1:1', { state: 'visible' });
//   await page.locator('.textPassageStory').first().hover();
//   await page.getByRole('button', { name: 'Remove "Genesis 1:1"' }).click();
//   // wait for removal request to complete
//   await Promise.all([
//     page.waitForResponse(resp => resp.url().includes('/api/profile/sync') && resp.status() === 200),
//   ]);
//   await page.reload();
//   await page.waitForSelector('text=Loading...', { state: 'detached' });
//   await page.waitForSelector('text=History', { state: 'visible' });
//   await page.waitForSelector('text=Genesis 1:1', { state: 'detached' });
// });

test('Share link', async ({ context }) => {
  // fill in test
});