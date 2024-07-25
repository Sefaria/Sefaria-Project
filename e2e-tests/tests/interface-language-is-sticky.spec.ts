import {test, expect} from '@playwright/test';
import {goToPageWithLang, getPathAndParams} from "../utils";
import {LANGUAGES} from '../globals'

[
    {interfaceLanguage: 'Hebrew', sourceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.HE, sourceLanguageToggle: 'div.toggleOption.english', expectedSourceText: 'When God began to create', expectedBilingualText: '', expectedInterfaceText: 'מקורות' },
    {interfaceLanguage: 'Hebrew', sourceLanguage: 'Bilingual', interfaceLanguageToggle: LANGUAGES.HE, sourceLanguageToggle: 'div.toggleOption.bilingual', expectedSourceText: 'רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃', expectedBilingualText: 'When God began to create', expectedInterfaceText: 'מקורות' },
    {interfaceLanguage: 'Hebrew', sourceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, sourceLanguageToggle: 'div.toggleOption.hebrew', expectedSourceText: 'רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃', expectedBilingualText: '', expectedInterfaceText: 'מקורות' },
    {interfaceLanguage: 'English', sourceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, sourceLanguageToggle: 'div.toggleOption.english', expectedSourceText: 'When God began to create', expectedBilingualText: '', expectedInterfaceText: 'Texts' },
    {interfaceLanguage: 'English', sourceLanguage: 'Bilingual', interfaceLanguageToggle: LANGUAGES.EN, sourceLanguageToggle: 'div.toggleOption.bilingual', expectedSourceText: 'רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃', expectedBilingualText: 'When God began to create', expectedInterfaceText: 'Texts' },
    {interfaceLanguage: 'English', sourceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.EN, sourceLanguageToggle: 'div.toggleOption.hebrew', expectedSourceText: 'רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃', expectedBilingualText: '', expectedInterfaceText: 'Texts' }

].forEach(({interfaceLanguage, sourceLanguage, interfaceLanguageToggle, sourceLanguageToggle, expectedSourceText, expectedBilingualText, expectedInterfaceText}) => {
    test(`${interfaceLanguage} Interface Language with ${sourceLanguage} Source`, async ({ context }) => {

        // Navigating to Bereshit with selected Interface Language, Hebrew or English
        const page = await goToPageWithLang(context,'/Genesis.1',`${interfaceLanguageToggle}`)
        
        // Clicking on the Source Language toggle
        await page.getByAltText('Toggle Reader Menu Display Settings').click()

        // Selecting Source Language
        await page.getByRole('radiogroup', {name: 'Language'}).locator(`${sourceLanguageToggle}`).click()
    
        // Locating the source text segment, then verifying translation
        await expect(page.locator('div.segmentNumber').first().locator('..').locator('p')).toContainText(`${expectedSourceText}`)

        // Checking out the second part of the text, if 'Bilingual' is selected
        if(`${sourceLanguage}` === 'Bilingual'){
            await expect(page.locator('div.segmentNumber').first().locator('..').locator('p span').last()).toContainText(`${expectedBilingualText}`)
        }
    
        // Validate Hebrew interface language is still toggled
        const textLink = page.locator('a.textLink').first()
        await expect(textLink).toHaveText(`${expectedInterfaceText}`)

    })
})