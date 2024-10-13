import {test, expect} from '@playwright/test';
import {goToPageWithLang, isIsraelIp, changeLanguageOfText} from "../utils";
import {LANGUAGES, SOURCE_LANGUAGES} from '../globals'

const interfaceTextHE = 'מקורות';
const interfaceTextEN = 'Texts';
const sourceTextHE = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';
const sourceTextEN = 'When God began to create';

[
    // Hebrew Interface and English Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'English', sourceLanguageToggle: SOURCE_LANGUAGES.EN, 
        expectedSourceText: sourceTextEN, expectedBilingualText: '', expectedInterfaceText: interfaceTextHE },
    
    // Hebrew Interface and Bilingual Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'Bilingual', sourceLanguageToggle: SOURCE_LANGUAGES.BI,
        expectedSourceText: sourceTextHE, expectedBilingualText: sourceTextEN, expectedInterfaceText: interfaceTextHE },
    
    // Hebrew Interface and Hebrew Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'Hebrew', sourceLanguageToggle: SOURCE_LANGUAGES.HE, 
        expectedSourceText: sourceTextHE, expectedBilingualText: '', expectedInterfaceText: interfaceTextHE },
    
    // English Interface and English Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'English', sourceLanguageToggle: SOURCE_LANGUAGES.EN, 
        expectedSourceText: sourceTextEN, expectedBilingualText: '', expectedInterfaceText: interfaceTextEN },

    // English Interface and Bilingual Source
    {interfaceLanguage: 'English', sinterfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'Bilingual', sourceLanguageToggle: SOURCE_LANGUAGES.BI, 
        expectedSourceText: sourceTextHE, expectedBilingualText: sourceTextEN, expectedInterfaceText: interfaceTextEN },
        
    // English Interface and Hebrew Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'Hebrew', sourceLanguageToggle: SOURCE_LANGUAGES.HE, 
        expectedSourceText: sourceTextHE, expectedBilingualText: '', expectedInterfaceText: interfaceTextEN }

].forEach(({interfaceLanguage, interfaceLanguageToggle, sourceLanguage, sourceLanguageToggle, expectedSourceText, expectedBilingualText, expectedInterfaceText}) => {
    test(`${interfaceLanguage} Interface Language with ${sourceLanguage} Source`, async ({ context }) => {

        // Navigating to Bereshit with selected Interface Language, Hebrew or English
        const page = await goToPageWithLang(context,'/Genesis.1', interfaceLanguageToggle)
        
        // Change the source language of the text
        await changeLanguageOfText(page, sourceLanguageToggle)
    
        // Locating the source text segment, then verifying translation
        await expect(page.locator('.segmentText span').first()).toContainText(expectedSourceText)

        // Checking out the second part of the text, if 'Bilingual' is selected
        if(sourceLanguage === 'Bilingual'){
            await expect(page.locator('.segmentText .contentSpan.en').first()).toContainText(expectedBilingualText)
            const isIL = await isIsraelIp(page);
            if (isIL) {
                expectedInterfaceText = interfaceTextHE;
            }
        }
    
        // Validate the Hebrew interface language is still toggled
        const interfaceTextLink = page.locator('a.textLink').first()
        await expect(interfaceTextLink).toHaveText(expectedInterfaceText)

    })
})