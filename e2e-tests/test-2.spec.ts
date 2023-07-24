import { test, expect } from '@playwright/test';
import { goToPageWithUser } from './utils';

test('test', async ({ context }) => {

  const page = await goToPageWithUser(context, '/Mishnat_Eretz_Yisrael_on_Pirkei_Avot,_Introduction?lang=bi&aliyot=0');
  await page.getByText('Lorem ipsum dolor sit').click();

  await page.getByRole('heading', { name: 'Loading...' }).getByText('Loading...').waitFor({ state: 'detached' });
  await page.goto('http://localhost:8000/texts');
  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByPlaceholder('Email Address').click();
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByPlaceholder('Password').click();
  

});