import {test, expect} from '@playwright/test';
import {goToPageWithLang, changeLanguageOfText} from "../utils";
import {LANGUAGES, SOURCE_LANGUAGES} from '../globals'

[
    // Hebrew Interface and Hebrew Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'Hebrew', sourceLanguageToggle: SOURCE_LANGUAGES.HE,
        translationsText: 'תרגומים', selectText: 'בחירה', currentlySelectedText: 'נוכחי'}, 

    // Hebrew Interface and Bilingual Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'Bilingual', sourceLanguageToggle: SOURCE_LANGUAGES.BI,
        translationsText: 'תרגומים', selectText: 'בחירה', currentlySelectedText: 'נוכחי'}, 
    
    // Hebrew Interface and English Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'English', sourceLanguageToggle: SOURCE_LANGUAGES.EN,
        translationsText: 'תרגומים', selectText: 'בחירה', currentlySelectedText: 'נוכחי'}, 

    // English Interface and English Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'English', sourceLanguageToggle: SOURCE_LANGUAGES.EN,
        translationsText: 'Translations', selectText: 'Select', currentlySelectedText: 'Currently Selected'},

    // English Interface and English Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'Bilingual', sourceLanguageToggle: SOURCE_LANGUAGES.BI,
        translationsText: 'Translations', selectText: 'Select', currentlySelectedText: 'Currently Selected'},
    
    // English Interface and Hebrew Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'Hebrew', sourceLanguageToggle: SOURCE_LANGUAGES.HE,
        translationsText: 'Translations', selectText: 'Select', currentlySelectedText: 'Currently Selected'}

].forEach(({interfaceLanguage, interfaceLanguageToggle, sourceLanguage, sourceLanguageToggle, translationsText, currentlySelectedText, selectText}) => {
    test(`${interfaceLanguage} - translation name appears in title for ${sourceLanguage} source text`, async ({ context }) => {
        // Navigate to Bereshit in specified Interface Language
        const page = await goToPageWithLang(context,'/Genesis.1', interfaceLanguageToggle)

        // Change the Source Language of the text
        await changeLanguageOfText(page, sourceLanguageToggle)

        // Navigate to the Translations sidebar by clicking on the text title
        //Clicks on בראשית א׳ / Genesis I
        await page.getByRole('heading').first().click()
        
        // Click on Translations
        await page.getByRole('link', {name: translationsText}).click()
        
        // Wait for Translations side-bar to load by waiting for 'Translations' header
        await page.waitForSelector('h3')

         // Retain the translation name locator
        const selectedTranslationName = page.locator('span.readerTextVersion')

        // Check if the default translation in the title matches the selected translation
        // NOTE: We are skipping checking for the default translation here, due to the Hebrew text not displaying a version title
        if(sourceLanguage !== 'Hebrew'){
            const defaultTranslation = await selectedTranslationName.textContent()
            
            // Check that "Currently Selected / נוכחי" has the default translation next to it by pointing to the version title div
            await expect(page.locator('div.version-with-preview-title-line').filter({ hasText: currentlySelectedText })).toContainText(defaultTranslation!)
            
        }
        
        const translationNames = ['The Schocken Bible, Everett Fox, 1995 ©', '«Да» project']
        
        for(let translationName of translationNames){
            // "Select" another translation.
            // The "Select" link is the sibling of the translation in the DOM
            await page.getByText(translationName).locator('..').getByText(selectText).click()
 
            // Validate selected translation is reflected in title
            await expect(selectedTranslationName).toContainText(translationName)
 
            // Validate that the currently selected translation is the one we want by pointing to the version title div 
            await expect(page.locator('div.version-with-preview-title-line').filter({ hasText: currentlySelectedText })).toContainText(translationName!)
         }
    })
});