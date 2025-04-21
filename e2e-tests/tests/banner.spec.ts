/* 
    PURPOSE: Test the header bar for Sefaria
        Is it appearing and functioning as usual?
        TODO: Tests to visualize mobile vs webpage behaviors
*/

import {test, expect} from '@playwright/test';
import {goToPageWithLang, getPathAndParams} from "../utils";
import {LANGUAGES} from '../globals'

test('Banner links exist - English', async ({ context }) => {
    
    const page = await goToPageWithLang(context,'/texts',LANGUAGES.EN);

    // Testing Sefaria logo
    await page.getByRole('link', { name: 'Sefaria Logo' }).click();
    expect(getPathAndParams(page.url())).toBe("/texts")

    // Testing Texts link
    await page.getByRole('banner').getByRole('link', { name: 'Texts' }).click();
    expect(getPathAndParams(page.url())).toBe("/texts")

    // Testing Topics link
    await page.getByRole('banner').getByRole('link', { name: 'Explore' }).click();
    expect(getPathAndParams(page.url())).toBe("/topics")

    // Testing Community link
    await page.getByRole('banner').getByRole('link', { name: 'Community' }).click();
    expect(getPathAndParams(page.url())).toContain("/community")

    // Testing Sign-up
    // This will end up on the page referenced by the previous "test", which is Community
    await page.getByRole('banner').getByRole('link', { name: 'Sign up' }).click();
    expect(getPathAndParams(page.url())).toBe("/register?next=%2Fcommunity")

    // Testing log in link
    const page2 = await goToPageWithLang(context,'/texts',LANGUAGES.EN);
    await page2.getByRole('banner').getByRole('link', { name: 'Log in' }).click();
    expect(getPathAndParams(page2.url())).toBe("/login?next=%2Ftexts")
    await page2.close();
    
    // Testing Help link
    await page.getByRole('banner').getByRole('link', { name: 'Help' }).click();
    expect(getPathAndParams(page.url())).toContain("/collections/sefaria-faqs")

    const page1Promise = page.waitForEvent('popup');
    await page.getByRole('banner').getByRole('link', { name: 'Donate' }).click();
    const page1 = await page1Promise;
    //Test redirect to https://donate.sefaria.org/
    expect(page1.url()).toContain("https://donate.sefaria.org/")

});

test('Banner links exist - Hebrew', async ({ context }) => {
    
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);
    await page.getByRole('link', { name: 'Sefaria Logo' }).click();
    expect(getPathAndParams(page.url())).toBe("/texts")

    await page.getByRole('banner').getByRole('link', { name: 'מקורות' }).click();
    expect(getPathAndParams(page.url())).toBe("/texts")

    await page.getByRole('banner').getByRole('link', { name: 'נושאים' }).click();
    expect(getPathAndParams(page.url())).toBe("/topics")

    await page.getByRole('banner').getByRole('link', { name: 'קהילה' }).click();
    expect(page.url()).toContain("/community")

    //look for and click Donate, while waiting for the page to pop up
    const page1Promise = page.waitForEvent('popup');
    await page.getByRole('banner').getByRole('link', { name: 'תרומה'}).click();
    const page1 = await page1Promise;
    
    //Test redirect to https://donate.sefaria.org/
    expect(page1.url()).toContain("https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=Header")
    
    // Testing for search box existence
    expect(page.locator('#searchBox').getByRole('img')).toBeDefined();

    // Testing search functionality
    //await page.getByRole('banner').getByRole('link', { name: 'עברית' }).click();
    await page.getByPlaceholder('חיפוש').click();
    await page.getByPlaceholder('חיפוש').fill('love');
    await page.getByPlaceholder('חיפוש').press('Enter');
    await page.getByText('תוצאות עבור').click();
    await page.getByRole('heading', { name: 'תוצאות עבור ״Love״' }).click();
    expect(getPathAndParams(page.url())).toBe('/search?q=Love&tab=text&tvar=1&tsort=relevance&svar=1&ssort=relevance')
    
    // Testing Login
    const page2 = await goToPageWithLang(context, '/', LANGUAGES.HE);
    await page2.getByRole('banner').getByRole('link', { name: 'התחברות'}).click();
    expect(getPathAndParams(page2.url())).toBe("/login?next=%2Ftexts")
    page2.close()

    // Testing Sign-up
    await page.getByRole('banner').getByRole('link', { name: /הרשמה/ }).click();
    expect(getPathAndParams(page.url())).toBe("/register?next=%2Fsearch%3Fq%3DLove%26tab%3Dtext%26tvar%3D1%26tsort%3Drelevance%26svar%3D1%26ssort%3Drelevance");
    
    // Testing Help link
    await page.getByRole('banner').getByRole('link', { name: 'עזרה' }).click();
    expect(getPathAndParams(page.url())).toContain("/collections/%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%A0%D7%A4%D7%95%D7%A6%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90");

});

//This test is separated out due to requiring consistency on some level 
test('Banner - Search, Keyboard, and Language toggle works for English site', async ({ context }) => {
    
    const page = await goToPageWithLang(context, '/', LANGUAGES.EN);
    //Testing language toggle from Hebrew to English
    
    /*
    // Testing language toggle to English from Hebrew
    // This will end up on the page referenced by the previous "test", which is FAQs
    // REQUIRES MANUAL TESTING
    */

    // Testing search box existence
    expect(page.locator('#searchBox').getByRole('img')).toBeDefined();
 
    // Testing Hebrew Keyboard
    await page.getByPlaceholder('Search').click();
    await page.getByRole('img', { name: 'Display virtual keyboard' }).click();    
    // Valid test - test will time-out with English lettering
    await page.getByRole('cell', { name: 'א', exact: true }).click();
    
    await page.locator('#panel-0').getByRole('link', { name: 'עברית' }).click()
    expect(getPathAndParams(page.url())).toBe("/texts");

    await page.getByRole('list').getByRole('link', { name: 'English' }).click();
    expect(getPathAndParams(page.url())).toBe("/translations/en");

    
});