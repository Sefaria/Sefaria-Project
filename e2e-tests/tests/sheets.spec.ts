import { test, expect } from '@playwright/test';
import { goToPageWithUser } from '../utils';


let url: any;



const addSource = async ({ context }) => {
  const page = await goToPageWithUser(context, '/Genesis.1?lang=bi&aliyot=0');
  await page.getByRole('heading', { name: 'Loading...' }).getByText('Loading...').waitFor({ state: 'detached' });
  await page.getByText('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃').click();
  await page.locator('#panel-1').getByText('Loading...').waitFor({ state: 'detached' });
  await page.locator('a').filter({ hasText: 'Add to Sheet' }).first().click();
  await page.locator('#panel-1').getByText('Loading...').waitFor({ state: 'detached' });
  await page.getByText('Add to Sheet').click();
  await page.waitForSelector('text=Genesis 1:1 has been added to Test.', { state: 'visible' });
  url = await page.locator('a').filter({ hasText: 'Test' }).first().getAttribute('href');
};

test('Add source to sheet', async ({ context }) => {
  await addSource({ context });
});

// test depends on previous test
test('Delete source from sheet', async ({ context }) => {
  if (!url) {
    await addSource({ context });
  }
  const page = await goToPageWithUser(context, url);
  
  page.on('dialog', dialog => dialog.accept());
  
  await page.locator('.sheetItem').first().click();
  await page.locator('#panel-1').getByText('Loading...').waitFor({ state: 'detached' });
  await page.getByText('Edit').click();
  // wait for new page to load
  await page.waitForSelector('text=Genesis 1:1', { state: 'visible' });
  
  const sheetItems = await page.locator('.sheetItem').all();
  await sheetItems[0].hover();
  await page.locator('.removeSource').first().click();
  const remainingSheetItems = await page.locator('.sheetItem').count();
  expect(sheetItems.length - remainingSheetItems).toBe(1);
});


test('Add comment to sheet', async ({ context }) => {
  // fill in test
});


test('Create sheet from sidebar', async ({ context }) => {
  const page = await goToPageWithUser(context, '/Mishnat_Eretz_Yisrael_on_Pirkei_Avot,_Introduction?lang=en');

  await page.getByText('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor i').first().click();
  await page.locator('a').filter({ hasText: 'Add to Sheet' }).click();

  await page.locator('.addToSourceSheetBox > .dropdown').first().click();
  await page.getByPlaceholder('Name New Sheet').click();
  await page.getByPlaceholder('Name New Sheet').fill('New Sheet From Sidebar');
  await page.getByText('Createיצירה').click();
});

// test depends on previous test
test('Add image to sheet', async ({ context }) => {
  const page = await goToPageWithUser(context, '/Mishnat_Eretz_Yisrael_on_Pirkei_Avot,_Introduction?lang=en');

  await page.getByText('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor i').first().click();
  await page.locator('a').filter({ hasText: 'Add to Sheet' }).click();
  await page.locator('.addToSourceSheetBox > .dropdown').first().click();
  await page.getByPlaceholder('New Sheet From Sidebar').click();

  await page.getByText('Add to Sheetהוספה לדף המקורות').click();

  await page.getByText('Mishnat Eretz Yisrael on Pirkei Avot, Introduction 1 has been added to New Sheet From Sidebar.').click();
  
  await page.locator('#panel-1').getByText('Loading...').waitFor({ state: 'detached' });

  await page.locator('.image-in-text > img').first().click();
  await page.locator('a').filter({ hasText: 'Add to Sheet' }).click();
  await page.getByText('Add to Sheetהוספה לדף המקורות').click();
 
  // page.on('dialog', dialog => dialog.accept());
  // await page.getByRole('button').click();
  page.on('dialog', dialog => {
    expect(dialog.type()).toContain('alert');   
    dialog.accept()
    console.log(`Dialog message: ${dialog.message()}`);
    dialog.dismiss().catch(() => {});
  });
});