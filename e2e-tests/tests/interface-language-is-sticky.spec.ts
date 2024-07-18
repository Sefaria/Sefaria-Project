import {test, expect} from '@playwright/test';
import {goToPageWithLang, getPathAndParams} from "../utils";
import {LANGUAGES} from '../globals'

test('Hebrew Interface Language with English Source', async ({ context }) => {
    // Navigating to Bereshit
    const page = await goToPageWithLang(context,'/Genesis.1',LANGUAGES.HE)

    // Clicking on the Source Language toggle
    await page.getByAltText('Toggle Reader Menu Display Settings').click()

    // Selecting English only
    await page.getByRole('radiogroup', {name: 'Language'}).locator('div.toggleOption.english').click()

    // Locating the first segment, then verifying English-only source translation
    await expect(page.locator('div.segmentNumber').first().locator('..').locator('p')).toContainText("When God began to create")

    // Validate Hebrew interface language is still toggled
    await expect(page.locator('a.textLink').first()).toHaveText('מקורות')

});

test('Hebrew Interface Language with Bi-lingual Source', async ({ context }) => {
    // Navigating to Bereshit
    const page = await goToPageWithLang(context,'/Genesis.1',LANGUAGES.HE)

    // Clicking on the Source Language toggle
    await page.getByAltText('Toggle Reader Menu Display Settings').click()

    // Selecting English only
    await page.getByRole('radiogroup', {name: 'Language'}).locator('div.toggleOption.bilingual').click()

    /* Validate existence of Hebrew and English paragraphs with in segments, with Hebrew being first */
    // Locating the first segment, then verifying Hebrew source translation
    await expect(page.locator('div.segmentNumber').first().locator('..').locator('p span').first()).toContainText("רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃")
    
    // Locating English source translation in first segment
    await expect(page.locator('div.segmentNumber').first().locator('..').locator('p span').last()).toContainText("When God began to create")

    // Validate Hebrew interface language is still toggled
    await expect(page.locator('a.textLink').first()).toHaveText('מקורות')


});

test('Hebrew Interface Language with Hebrew Source', async ({ context }) => {
    // Navigating to Bereshit
    const page = await goToPageWithLang(context,'/Genesis.1',LANGUAGES.HE)

    // Clicking on the Source Language toggle
    await page.getByAltText('Toggle Reader Menu Display Settings').click()

    // Selecting English only
    await page.getByRole('radiogroup', {name: 'Language'}).locator('div.toggleOption.hebrew').click()

    // Locating the first segment, then verifying Hebrew-only source translation
    await expect(page.locator('div.segmentNumber').first().locator('..').locator('p span').first()).toContainText("רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃")

    // Validate Hebrew interface language is still toggled
    await expect(page.locator('a.textLink').first()).toHaveText('מקורות')

});

test('English Interface Language with English Source', async ({ context }) => {
    // Navigating to Bereshit
    const page = await goToPageWithLang(context,'/Genesis.1',LANGUAGES.EN)

    // Clicking on the Source Language toggle
    await page.getByAltText('Toggle Reader Menu Display Settings').click()

    // Selecting English only
    await page.getByRole('radiogroup', {name: 'Language'}).locator('div.toggleOption.english').click()

    // Locating the first segment, then verifying English-only source translation
    await expect(page.locator('div.segmentNumber').first().locator('..').locator('p')).toContainText("When God began to create")

    // Validate English interface language is still toggled
    await expect(page.locator('a.textLink').first()).toHaveText('Texts')

});

test('English Interface Language with Bi-lingual Source', async ({ context }) => {
    // Navigating to Bereshit
    const page = await goToPageWithLang(context,'/Genesis.1',LANGUAGES.EN)

    // Clicking on the Source Language toggle
    await page.getByAltText('Toggle Reader Menu Display Settings').click()

    // Selecting English only
    await page.getByRole('radiogroup', {name: 'Language'}).locator('div.toggleOption.bilingual').click()

    /* Validate existence of Hebrew and English paragraphs with in segments, with Hebrew being first */
    // Locating the first segment, then verifying Hebrew source translation
    await expect(page.locator('div.segmentNumber').first().locator('..').locator('p span').first()).toContainText("רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃")
    
    // Locating English source translation in first segment
    await expect(page.locator('div.segmentNumber').first().locator('..').locator('p span').last()).toContainText("When God began to create")

    // Validate English interface language is still toggled
    await expect(page.locator('a.textLink').first()).toHaveText('Texts')


});

test('English Interface Language with Hebrew Source', async ({ context }) => {
    // Navigating to Bereshit
    const page = await goToPageWithLang(context,'/Genesis.1',LANGUAGES.EN)

    // Clicking on the Source Language toggle
    await page.getByAltText('Toggle Reader Menu Display Settings').click()

    // Selecting English only
    await page.getByRole('radiogroup', {name: 'Language'}).locator('div.toggleOption.hebrew').click()

    // Locating the first segment, then verifying Hebrew-only source translation
    await expect(page.locator('div.segmentNumber').first().locator('..').locator('p span').first()).toContainText("רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃")

    // Validate English interface language is still toggled
    await expect(page.locator('a.textLink').first()).toHaveText('Texts')

});
