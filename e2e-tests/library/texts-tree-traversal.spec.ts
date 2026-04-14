import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
const clickFirstAvailableVersion = async (page: Page) => {
    // Sefaria versions are usually in .versionBlock and the clickable part is .selectButton
    const selectVersionButton = page.locator('.versionBlock .versionBlockHeading .versionTitle a').first();
    await selectVersionButton.waitFor({ state: 'visible' });
    await selectVersionButton.click();
};

test.describe('Library Texts Tree Traversal Tests - Tanach', () => {

    // Test: Tanach > Genesis > Clicking a chapter in Contents tab
    test('Tanach - Genesis Contents Tab', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);


        // Check bilingual interface if possible, or just click through
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Genesis', exact: true }).click();
        // Should default to Contents tab. Click a chapter (e.g., Chapter 1)
        const chapter1 = page.getByRole('link', { name: '1', exact: true }).first();
        await chapter1.click();

        // Verify we reached Genesis 1
        await expect(page).toHaveURL(/Genesis\.1/);
        await expect(page.locator('.readerControlsTitle')).toContainText('Genesis');
    });

    // Test: Tanach > Genesis > Clicking the Versions tab > Clicking a version
    test('Tanach - Genesis Versions Tab', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);

        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Genesis', exact: true }).click();

        // Click Versions tab
        await page.getByRole('tab', { name: 'Versions' }).click();

        // Click any available version
        await clickFirstAvailableVersion(page);

        // Verify we reached a version page, url should contain vhe or ven etc.
        await expect(page).toHaveURL(/vhe=|ven=/);
    });

    // Test: Tanah > Psalms Alt TOC > Chapter
    test('Tanach - Psalms Alt TOC - Chapter', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Psalms', exact: true }).click();

        // Default is usually Chapter
        const chapter1 = page.getByRole('link', { name: '1', exact: true }).first();
        await chapter1.click();
        await expect(page).toHaveURL(/Psalms\.1/);
    });

    // Test: Tanah > Psalms Alt TOC > 30 Day Cycle
    test('Tanach - Psalms Alt TOC - 30 Day Cycle', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Psalms', exact: true }).click();

        // Click 30 Day Cycle
        await page.getByRole('link', { name: '30 Day Cycle' }).click();
        const day1 = page.getByRole('link', { name: '1', exact: true }).first();
        await day1.click();
        await expect(page).toHaveURL(/Psalms/);
    });

    // Test: Tanah > Psalms Alt TOC > Book
    test('Tanach - Psalms Alt TOC - Book', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Psalms', exact: true }).click();

        // Click Book
        await page.getByRole('link', { name: 'Book' }).click();
        const book1 = page.getByRole('link', { name: '1', exact: true }).first();
        await book1.click();
        await expect(page).toHaveURL(/Psalms\.1/);
    });

    // Test: Tanach > Aramaic Targum > Proverbs
    test('Tanach - Aramaic Targum - Proverbs', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Aramaic Targum' }).click();
        await page.getByRole('link', { name: 'Proverbs' }).click();

        const chapter1 = page.getByRole('link', { name: '1', exact: true }).first();
        await chapter1.click();
        await expect(page).toHaveURL(/Aramaic_Targum_to_Proverbs\.1/);
    });

    // Test: Tanach > Rashi
    test('Tanach - Rashi', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Rashi', exact: true }).click();
        await page.getByRole('link', { name: 'Genesis' }).click();

        const chapter1 = page.getByRole('link', { name: '1', exact: true }).first();
        await chapter1.click();
        await expect(page).toHaveURL(/Genesis\.1\.1\?lang=.*&with=Rashi/);
    });

    // Test: Tanach > Chatam Sofer on Torah > Clicking on a parasha
    test('Tanach - Chatam Sofer on Torah - Parasha', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Chatam Sofer on Torah' }).click();

        // Click Bereshit
        await page.getByRole('link', { name: 'Bereshit' }).click();
        await expect(page).toHaveURL(/Chatam_Sofer_on_Torah(%2C|_)+Bereshit/i);
    });

    // Test: Tanach > Chatam Sofer on Torah > Clicking the Versions Tab
    test('Tanach - Chatam Sofer on Torah - Versions Tab', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Chatam Sofer on Torah' }).click();

        await page.getByRole('tab', { name: 'Versions' }).click();
        await clickFirstAvailableVersion(page);
        await expect(page).toHaveURL(/vhe=|ven=/);
    });

    // Test: Tanach > Avraham Remer > Click one of the choices > Click Contents > one of the numbers > Click one of the chapters
    test('Tanach - Avraham Remer - Contents - Chapters', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Avraham Remer' }).click();
        await page.locator('.navBlockTitle').filter({ hasText: 'MeAvur HaAretz; on Joshua' }).click();

        await page.getByRole('tab', { name: 'Contents' }).click();
        const item1 = page.getByRole('link', { name: '1', exact: true }).first();
        await item1.click();
        await expect(page).toHaveURL(/MeAvur_HaAretz/);
    });

    // Test: Tanach > Steinsaltz > Click a book
    test('Tanach - Steinsaltz - Book', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Steinsaltz' }).click();
        await page.getByRole('link', { name: 'Genesis' }).click();

        const chapter1 = page.getByRole('link', { name: '1', exact: true }).first();
        await chapter1.click();
        await expect(page).toHaveURL(/Genesis\.1\?lang=.*&with=Steinsaltz/);
    });

    // Test: Tanach > Jonathan Sacks
    test('Tanach - Jonathan Sacks', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Jonathan Sacks' }).click();
        await page.getByRole('link', { name: 'Genesis; The Book of the Beginnings' }).click();

        await page.getByRole('tab', { name: 'Contents' }).click();
        const item1 = page.getByRole('link', { name: 'Genesis; An Introduction', exact: true }).first();
        await item1.click();
        await expect(page).toHaveURL(/Covenant_and_Conversation%3B_Genesis%3B_The_Book_of_the_Beginnings%2C_Genesis%3B_An_Introduction/);
    });

    // Test: Tanach > Nechama Leibowitz (Sheets)
    test('Tanach - Nechama Leibowitz', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Tanakh' }).first().click();
        await page.getByRole('link', { name: 'Nechama Leibowitz' }).click();

        await page.getByRole('tab', { name: 'Contents' }).click();
        const item1 = page.getByRole('link', { name: 'Bereshit', exact: true }).first();
        await item1.click();
        await expect(page).toHaveURL(/collections\/\%D7\%92\%D7\%99\%D7\%9C\%D7\%99\%D7\%95\%D7\%A0\%D7\%95\%D7\%AA\-%D7\%A0\%D7\%97\%D7\%9E\%D7\%94\?tag\=Bereshit\&tab\=sheets/);
    });

    // ==================== TALMUD tests ====================

    // Test: Talmud > Jerusalem > Berakhot > Alt TOC > Chapter
    test('Talmud - Jerusalem - Berakhot - Chapter', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Talmud' }).first().click();
        await page.locator('.navToggle:has-text("Jerusalem")').click();
        await page.getByRole('link', { name: 'Berakhot' }).click();

        await page.getByRole('link', { name: 'Chapter', exact: true }).click();
        const chapter1 = page.getByRole('link', { name: '1', exact: true }).first();
        await chapter1.click();
        await expect(page).toHaveURL(/Jerusalem_Talmud_Berakhot\.1/);
    });

    // Test: Talmud > Jerusalem > Berakhot > Alt TOC > Venice
    test('Talmud - Jerusalem - Berakhot - Venice', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Talmud' }).first().click();
        await page.locator('.navToggle:has-text("Jerusalem")').click();
        await page.getByRole('link', { name: 'Berakhot' }).click();

        await page.getByRole('link', { name: 'Venice', exact: true }).click();
        const chapter2a = page.getByRole('link', { name: '2a', exact: true }).first();
        await chapter2a.click();
        await expect(page).toHaveURL(/Jerusalem_Talmud_Berakhot\.1\.1\.2/);
    });

    // Test: Talmud > Jerusalem > Berakhot > Alt TOC > Vilna
    test('Talmud - Jerusalem - Berakhot - Vilna', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Talmud' }).first().click();
        await page.locator('.navToggle:has-text("Jerusalem")').click();
        await page.getByRole('link', { name: 'Berakhot' }).click();

        await page.getByRole('link', { name: 'Vilna', exact: true }).click();
        const vilna2a = page.getByRole('link', { name: '2a', exact: true }).first();
        await vilna2a.click();
        await expect(page).toHaveURL(/Jerusalem_Talmud_Berakhot\.1\.1\.7-11/);
    });

    // ==================== KABBALAH tests ====================

    // Test: Kabbalah > Zohar > Daf
    test('Kabbalah - Zohar - Daf', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Kabbalah' }).first().click();
        await page.getByRole('link', { name: 'Zohar', exact: true }).click();

        const daf2a = page.getByRole('link', { name: '2a', exact: true }).first();
        await daf2a.click();
        await expect(page).toHaveURL(/Zohar%2C_Introduction.4.12-5.21/);
    });

    // Test: Kabbalah > Zohar > Essay
    test('Kabbalah - Zohar - Essay', async ({ context }) => {
        // Testing in Hebrew since essays are in Hebrew
        const page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}/texts`, LANGUAGES.HE);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'קבלה' }).first().click();
        await page.getByRole('link', { name: 'ספר הזהר', exact: true }).click();
        await page.getByRole('link', { name: 'מאמר', exact: true }).click();

        const daf2a = page.getByRole('link', { name: 'א', exact: true }).first();
        await daf2a.click();
        await expect(page).toHaveURL(/Zohar/);
    });

    // ==================== REFERENCE tests ====================

    // Test: Reference > Jastrow Dictionary > Search takes straight to word
    test('Reference - Jastrow - Search', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Reference' }).first().click();
        await page.getByRole('link', { name: 'Jastrow', exact: true }).click();

        const searchInput = page.getByPlaceholder('Search dictionary');
        await searchInput.fill('שלום');
        await page.locator('.dictionarySearchButton').click();

        await expect(page).toHaveURL(/Jastrow/);
        await expect(page).toHaveURL(/Jastrow%2C_%D7%A9%D6%B7%D7%81%D7%9C%D6%BC%D7%95%D6%BC%D7%9D/);
    });

    // Test: Reference > Jastrow Dictionary > Clicking letter of Alef-Bais
    test('Reference - Jastrow - Alef-Bais', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Reference' }).first().click();
        await page.getByRole('link', { name: 'Jastrow', exact: true }).click();

        // Click Alef letter
        await page.getByRole('link', { name: 'א' }).first().click();
        await expect(page).toHaveURL(/Jastrow%2C_%D7%90/);
    });

    // Test: Reference > Kovetz Yesodot VaChakirot > Index
    test('Reference - Kovetz Yesodot VaChakirot - Index', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Reference' }).first().click();
        await page.getByRole('link', { name: 'Kovetz Yesodot VaChakirot' }).click();

        const item1 = page.getByRole('link', { name: '1', exact: true }).first();
        await item1.click();
        await expect(page).toHaveURL(/Kovetz_Yesodot_VaChakirot%2C_Index.1/);
    });

    // Test: Reference > Kovetz Yesodot VaChakirot > Browse by Letter
    test('Reference - Kovetz Yesodot VaChakirot - Browse by Letter', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
        await hideAllModalsAndPopups(page);
        await page.locator('.navBlockTitle').filter({ hasText: 'Reference' }).first().click();
        await page.getByRole('link', { name: 'Kovetz Yesodot VaChakirot' }).click();

        const letterAlef = page.getByRole('link', { name: 'א' }).first();
        await letterAlef.click();
        await expect(page).toHaveURL(/Kovetz_Yesodot_VaChakirot%2C_%D7%90/);
    });

    // Test: Reference > Seder Hadorot > Compositions
    test('Reference - Seder Hadorot - Compositions', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}/texts`, LANGUAGES.HE);
        await hideAllModalsAndPopups(page);
        await page.getByRole('link', { name: 'מילונים וספרי יעץ' }).click();
        await page.getByRole('link', { name: 'סדר הדורות' }).click();

        await page.getByRole('link', { name: 'Compositions' }).click();
        const item = page.locator('.schema-node-toc').first();
        await item.click();
        await expect(page).toHaveURL(/Seder_HaDorot%2C_Compositions/);
    });

    // Test: Reference > Seder Hadorot > Authors
    test('Reference - Seder Hadorot - Authors', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}/texts`, LANGUAGES.HE);
        await hideAllModalsAndPopups(page);
        await page.getByRole('link', { name: 'מילונים וספרי יעץ' }).click();
        await page.getByRole('link', { name: 'סדר הדורות' }).click();

        await page.getByRole('link', { name: 'מחברים' }).click();
        const item = page.locator('.schema-node-toc').first();
        await item.click();
        await expect(page).toHaveURL(/Seder_HaDorot%2C_Authors/);
    });

    // Test: Reference > Seder Hadorot > Tanaim and Amoraim
    test('Reference - Seder Hadorot - Tanaim and Amoraim', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}/texts`, LANGUAGES.HE);
        await hideAllModalsAndPopups(page);
        await page.getByRole('link', { name: 'מילונים וספרי יעץ' }).click();
        await page.getByRole('link', { name: 'סדר הדורות' }).click();

        await page.getByRole('link', { name: 'Tanaim and Amoraim' }).click();
        const item = page.locator('.schema-node-toc').first();
        await item.click();
        await expect(page).toHaveURL(/Seder_HaDorot%2C_Tanaim_and_Amoraim/);
    });

    // Test: Reference > Seder Hadorot > Contents
    test('Reference - Seder Hadorot - Contents', async ({ context }) => {
        const page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}/texts`, LANGUAGES.HE);
        await hideAllModalsAndPopups(page);
        await page.getByRole('link', { name: 'מילונים וספרי יעץ' }).click();
        await page.getByRole('link', { name: 'סדר הדורות' }).click();

        await page.locator('.altStructToggle').filter({ hasText: 'תוכן' }).first().click();
        const item = page.locator('.schema-node-toc').first();
        await item.click();
        await expect(page).toHaveURL(/Seder_HaDorot%2C_Introduction/);
    });

});
