import { test } from '@playwright/test';
import {goToPageWithUser} from '../utils';

test('test', async ({ context }) => {
  const page = await goToPageWithUser(context, '/Mishnat_Eretz_Yisrael_on_Pirkei_Avot,_Introduction?lang=en');

  await page.getByText('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor i').first().click();
  await page.locator('a').filter({ hasText: 'Add to Sheet' }).click();

  await page.locator('.addToSourceSheetBox > .dropdown').first().click();
  await page.getByPlaceholder('Name New Sheet').click();
  await page.getByPlaceholder('Name New Sheet').fill('New Sheet');
  await page.getByText('Createיצירה').click();

  await page.getByText('Add to Sheetהוספה לדף המקורות').click();

  await page.getByText('Mishnat Eretz Yisrael on Pirkei Avot, Introduction 1 has been added to New Sheet.').click();
  
  await page.locator('.image-in-text > img').first().click();
  await page.locator('a').filter({ hasText: 'Add to Sheet' }).click();
 
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button').click();
  page.once('dialog', dialog => {
    console.log(`Dialog message: ${dialog.message()}`);
    dialog.dismiss().catch(() => {});
  });
});