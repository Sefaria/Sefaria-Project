// Keys on the main page (DS-KEY-*).
import { Then, expect } from '../fixtures';
import { dev, notes } from './devSettings.common.steps';

Then(/^the key reads its first 10 characters \("sfr_" and 6 more\) followed by four dots$/, async ({ visitor }) => {
  const { ds } = await dev(visitor);
  const n = notes(visitor);
  const value = n.keyValues![n.currentKey!];
  const code = ds.keyRow(n.currentProject!, n.currentKey!).locator('code');
  await expect(code).toHaveText(value.slice(0, 10) + '••••');
  expect(value.slice(0, 4)).toBe('sfr_');
});

Then("the full key is not in the page or in the page's data", async ({ visitor }) => {
  const { page } = await dev(visitor);
  const n = notes(visitor);
  const value = n.keyValues![n.currentKey!];
  expect(await page.content()).not.toContain(value);
});
