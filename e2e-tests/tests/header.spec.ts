/* 
    PURPOSE: Test the header bar for Sefaria
        Is it appearing and functioning as usual?
        TODO: Tests to visualize mobile vs webpage behaviors
*/

import {test, expect} from '@playwright/test';
import {goToPageWithLang} from "../utils";
import {LANGUAGES} from '../globals'

test('Logo header link- English', async ({ context }) => {
    const page = await goToPageWithLang(context,'/texts',LANGUAGES.EN);
    await page.getByRole('link', { name: 'Sefaria Logo' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org/texts")

});

test('Logo header link - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);
    await page.getByRole('link', { name: 'Sefaria Logo' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org.il/texts")

});

test('Texts header link- English', async ({ context }) => {
    const page = await goToPageWithLang(context,'/',LANGUAGES.EN);
    await page.getByRole('banner').getByRole('link', { name: 'Texts' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org/texts")
    
});

test('Texts header link - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context,'/',LANGUAGES.HE);
    await page.getByRole('banner').getByRole('link', { name: 'מקורות' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org.il/texts")
    
});

test('Topics header link- English', async ({ context }) => {
    const page = await goToPageWithLang(context,'/',LANGUAGES.EN);
    await page.getByRole('banner').getByRole('link', { name: 'Topics' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org/topics")
    
});

test('Topics header link - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context,'/',LANGUAGES.HE);
    await page.getByRole('banner').getByRole('link', { name: 'נושאים' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org.il/topics")
    
});

test('Community header link- English', async ({ context }) => {
    const page = await goToPageWithLang(context,'/',LANGUAGES.EN);
    await page.getByRole('banner').getByRole('link', { name: 'Community' }).click();
    expect (await page.url()).toContain("https://www.sefaria.org/community")
    
});

test('Community header link - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);
    await page.getByRole('banner').getByRole('link', { name: 'קהילה' }).click();
    expect (await page.url()).toContain("https://www.sefaria.org.il/community")
    
});

test('Donate header link- English', async ({ context }) => {
    const page = await goToPageWithLang(context,'/',LANGUAGES.EN);
    
    //look for and click Donate, while waiting for the page to pop up
    const page1Promise = page.waitForEvent('popup');
    await page.getByRole('banner').getByRole('link', { name: 'Donate' }).click();
    const page1 = await page1Promise;
    
    //Test redirect to https://donate.sefaria.org/
    expect (await page1.url()).toContain("https://donate.sefaria.org/")
    
});

test('Donate header link - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);
    
    //look for and click Donate, while waiting for the page to pop up
    const page1Promise = page.waitForEvent('popup');
    await page.getByRole('banner').getByRole('link', { name: 'תרומה'}).click();
    const page1 = await page1Promise;
    
    //Test redirect to https://donate.sefaria.org/
    expect (await page1.url()).toContain("https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=Header")
    
});

test('Search icon is clickable from header - English', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);

    //Is not "visible"
    expect(page.locator('#searchBox').getByRole('img')).toBeDefined();

});

test('Search icon is clickable from header - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);
    expect(page.locator('#searchBox').getByRole('img')).toBeDefined();
    
});

test('Hebrew Keyboard for English Only', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.EN);
    await page.getByPlaceholder('Search').click();
    await page.getByRole('img', { name: 'Display virtual keyboard' }).click();
    
    //Valid test - test will time-out with English lettering
    await page.getByRole('cell', { name: 'א', exact: true }).click();

});

// See search.spec.ts for more in-depth testing
test('Search bar is functional in header - English', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.EN);
    await page.getByPlaceholder('Search').click();
    await page.getByPlaceholder('Search').fill('love');
    await page.getByPlaceholder('Search').press('Enter');
    await page.getByRole('heading', { name: 'Results for “Love”' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org/search?q=Love&tab=text&tvar=1&tsort=relevance&svar=1&ssort=relevance")

});

test('Search bar is functional in header - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);

    //await page.getByRole('banner').getByRole('link', { name: 'עברית' }).click();
    await page.getByPlaceholder('חיפוש').click();
    await page.getByPlaceholder('חיפוש').fill('love');
    await page.getByPlaceholder('חיפוש').press('Enter');
    await page.getByText('תוצאות עבור').click();
    await page.getByRole('heading', { name: 'תוצאות עבור ״Love״' }).click();
    expect (await page.url()).toBe('https://www.sefaria.org.il/search?q=Love&tab=text&tvar=1&tsort=relevance&svar=1&ssort=relevance')
});

test('Log in header link- English', async ({ context }) => {
    const page = await goToPageWithLang(context,'/',LANGUAGES.EN);
    await page.getByRole('banner').getByRole('link', { name: 'Log in' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org/login?next=%2Ftexts")
    
});

test('Log in header link - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);
    await page.getByRole('banner').getByRole('link', { name: 'התחברות'}).click();
    expect (await page.url()).toBe("https://www.sefaria.org.il/login?next=%2Ftexts")
    
});

test('Sign up header link- English', async ({ context }) => {
    const page = await goToPageWithLang(context,'/',LANGUAGES.EN);
    await page.getByRole('banner').getByRole('link', { name: 'Sign up' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org/register?next=%2Ftexts")
    
});

test('Sign up header link - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);
    await page.getByRole('banner').getByRole('link', { name: 'להרשמה' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org.il/register?next=%2Ftexts")
    
});

// QUESTION FOR DEVS: Is it ok that this link is quite long? - brandon c
// "https://www.sefaria.org.il/collections/%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%A0%D7%A4%D7%95%D7%A6%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90"
test('Help header link - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);
    await page.getByRole('banner').getByRole('link', { name: 'עזרה' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org.il/collections/%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%A0%D7%A4%D7%95%D7%A6%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90")
    
});

test('Help header link- English', async ({ context }) => {
    const page = await goToPageWithLang(context,'/',LANGUAGES.EN);
    await page.getByRole('banner').getByRole('link', { name: 'Help' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org/collections/sefaria-faqs")

});

test('Language Toggle to Hebrew from Header - English', async ({ context }) => {
    const page = await goToPageWithLang(context,'/',LANGUAGES.EN);
    await page.getByRole('link', { name: 'עברית' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org.il/texts");

});

test('Language Toggle to English from Header - English', async ({ context }) => {
    const page = await goToPageWithLang(context,'/',LANGUAGES.EN);
    await page.getByRole('list').getByRole('link', { name: 'English' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org/translations/en");
    
});

test('Language Toggle to Hebrew from Header - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);
    await page.getByRole('link', { name: 'עברית' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org.il/texts");

});

test('Language Toggle to English from Header - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/', LANGUAGES.HE);
    await page.getByRole('list').getByRole('link', { name: 'English' }).click();
    expect (await page.url()).toBe("https://www.sefaria.org.il/translations/en");
    
});
