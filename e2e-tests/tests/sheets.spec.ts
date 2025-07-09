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
