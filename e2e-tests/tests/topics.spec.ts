import { test, expect } from '@playwright/test';
import {goToPageWithLang} from '../utils';



test('go to topic page', async ({ context }) => {
  const page = await goToPageWithLang(context, '/topics');
  await page.getByRole('link', { name: 'Holidays' }).click();
  await page.getByRole('link', { name: 'Rosh Hashanah' }).isVisible();
});

