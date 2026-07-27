/*
 * PURPOSE: Verify parashah / aliyah headers in the reader (Library module).
 *   - PAR-001: with Aliyot off (default), a plain parasha header shows at the parasha start.
 *   - PAR-002: enabling Aliyot switches the headers to aliyah style, naming the parasha
 *              ("Bereshit: First"), with more than one aliyah header in the chapter.
 *   - PAR-003: the same, in Hebrew, on the .org.il domain ("בראשית: ראשון").
 *
 * Data: Genesis 1 opens Parashat Bereshit (Rishon at 1:1); Bereshit's later aliyot begin
 * mid-chapter (Second at 2:4, Third at 2:19, ...). Verified against /api/texts/Genesis.N.
 *
 * NOTE: The combined "<parasha>: <aliyah>" string is produced by
 * feature/sc-29017; PAR-002/PAR-003's content assertions only pass once that
 * branch is deployed to the sandbox under test. PAR-001 passes today.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { MODULE_URLS } from '../constants';

// Open the "Aa" display-settings dropdown and flip the Aliyot switch on.
// The switch only appears for the five Torah books + Onkelos (ReaderDisplayOptionsMenu.hasAliyot).
const enableAliyot = async (page: Page, switchName: RegExp) => {
  await hideAllModalsAndPopups(page);
  await page.locator('.readerOptions').first().click();
  const aliyotSwitch = page.getByRole('switch', { name: switchName });
  await expect(aliyotSwitch).toBeVisible({ timeout: t(10000) });
  await aliyotSwitch.click();
  // Close the dropdown so it doesn't overlay the text column.
  await page.keyboard.press('Escape');
};

test.describe('Reader — Parashah & Aliyah headers (English)', () => {
  let page: Page;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('PAR-001: parasha header shows at the parasha start (aliyot off)', async () => {
    const header = page.locator('.parashahHeader').first();
    await expect(header).toBeVisible({ timeout: t(15000) });
    await expect(header).toContainText(/Bereshit/i);
    // Aliyot off → no aliyah-styled headers.
    await expect(page.locator('.parashahHeader.aliyah')).toHaveCount(0);
  });

  test('PAR-002: enabling Aliyot renders aliyah headers naming the parasha', async () => {
    await enableAliyot(page, /Aliyot/i);

    const aliyahHeaders = page.locator('.parashahHeader.aliyah');
    await expect(aliyahHeaders.first()).toBeVisible({ timeout: t(15000) });
    // The Rishon now reads "Bereshit: First".
    await expect(aliyahHeaders.first()).toContainText(/Bereshit:\s*First/i);
    // Genesis 1 shows more than one aliyah header once aliyot are on.
    expect(await aliyahHeaders.count()).toBeGreaterThan(1);
  });
});

test.describe('Reader — Parashah & Aliyah headers (Hebrew)', () => {
  let page: Page;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}/Genesis.1`, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
  });

  test('PAR-003: enabling Aliyot renders Hebrew aliyah headers naming the parasha', async () => {
    await enableAliyot(page, /עליות לתורה/);

    const aliyahHeaders = page.locator('.parashahHeader.aliyah');
    await expect(aliyahHeaders.first()).toBeVisible({ timeout: t(15000) });
    // The Rishon now reads "בראשית: ראשון".
    await expect(aliyahHeaders.first()).toContainText(/בראשית:\s*ראשון/);
    expect(await aliyahHeaders.count()).toBeGreaterThan(1);
  });
});
