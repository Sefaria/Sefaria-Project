import { test, expect } from '@playwright/test';
import {changeLanguage, goToPageWithUser} from './utils';

test('test', async ({ context }) => {
  //const page = await goToPageWithUser(context, '/Mishnat_Eretz_Yisrael_on_Pirkei_Avot,_Introduction?lang=en');
  const page = await goToPageWithUser(context, '/Genesis.1?lang=en');
  await page.getByText('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor i').first().click();
  await page.locator('a').filter({ hasText: 'Add to Sheet' }).click();

  await page.getByText('Mishnat Eretz Yisrael on Pirkei Avot, Introduction 1 has been added to Untitled.').click();

  await page.getByText('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor i').first().click();
  await page.locator('a').filter({ hasText: 'Add to Sheet' }).click();

  await page.getByText('Mishnat Eretz Yisrael on Pirkei Avot, Introduction 1 has been added to Untitled.').click();

  await page.locator('.image-in-text > img').first().click();
  await page.locator('a').filter({ hasText: 'Add to Sheet' }).click();
 
  page.once('dialog', dialog => {
    console.log(`Dialog message: ${dialog.message()}`);
    dialog.dismiss().catch(() => {});
  });

});