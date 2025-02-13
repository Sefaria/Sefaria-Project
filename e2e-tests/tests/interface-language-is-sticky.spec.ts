import {test, expect} from '@playwright/test';
import {changeLanguageOfText, goToPageWithLang, isIsraelIp} from "../utils";
import {LANGUAGES, SOURCE_LANGUAGES} from '../globals'

const interfaceTextHE = 'מקורות';
const interfaceTextEN = 'Texts';

[
    // Hebrew Interface and English Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'English', sourceLanguageToggle: SOURCE_LANGUAGES.EN, 
        expectedSourceText: 'When God began to create', expectedBilingualText: '', expectedInterfaceText: interfaceTextHE },
    
    // Hebrew Interface and Bilingual Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'Bilingual', sourceLanguageToggle: SOURCE_LANGUAGES.BI, 
        expectedSourceText: 'רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃', expectedBilingualText: 'When God began to create', expectedInterfaceText: interfaceTextHE },
    
    // Hebrew Interface and Hebrew Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'Hebrew', sourceLanguageToggle: SOURCE_LANGUAGES.HE, 
        expectedSourceText: 'רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃', expectedBilingualText: '', expectedInterfaceText: interfaceTextHE },
    
    // English Interface and English Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'English', sourceLanguageToggle: SOURCE_LANGUAGES.EN, 
        expectedSourceText: 'When God began to create', expectedBilingualText: '', expectedInterfaceText: interfaceTextEN },

    // English Interface and Bilingual Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN,
        sourceLanguage: 'Bilingual', sourceLanguageToggle: SOURCE_LANGUAGES.BI, 
        expectedSourceText: 'רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃', expectedBilingualText: 'When God began to create',
        expectedInterfaceText: interfaceTextEN },
        
    // English Interface and Hebrew Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'Hebrew', sourceLanguageToggle: SOURCE_LANGUAGES.HE, 
        expectedSourceText: 'רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃', expectedBilingualText: '', expectedInterfaceText: interfaceTextEN }

].forEach(({interfaceLanguage, interfaceLanguageToggle, sourceLanguage, sourceLanguageToggle, expectedSourceText, expectedBilingualText, expectedInterfaceText}) => {
    test(`${interfaceLanguage} Interface Language with ${sourceLanguage} Source`, async ({ context }) => {

        // Navigating to Bereshit with selected Interface Language, Hebrew or English
        const page = await goToPageWithLang(context,'/Genesis.1',`${interfaceLanguageToggle}`)
        
        // Selecting Source Language
        await changeLanguageOfText(page, sourceLanguageToggle)
    
        // Locating the source text segment, then verifying translation
        await expect(page.locator('div.segmentNumber').first().locator('..').locator('p')).toContainText(`${expectedSourceText}`)

        // Validate Hebrew interface language is still toggled
        const textLink = page.locator('a.textLink').first()
        await expect(textLink).toHaveText(`${expectedInterfaceText}`)

    })
})