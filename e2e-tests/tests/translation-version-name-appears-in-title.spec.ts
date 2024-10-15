import {test, expect} from '@playwright/test';
import {goToPageWithLang, changeLanguageOfText} from "../utils";
import {LANGUAGES, SOURCE_LANGUAGES} from '../globals'

[
    // Hebrew Interface and Hebrew Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'Hebrew', sourceLanguageToggle: SOURCE_LANGUAGES.HE,
        translations: 'תרגומים', select: 'בחירה', currentlySelected: 'נוכחי'}, 

    // Hebrew Interface and Bilingual Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'Bilingual', sourceLanguageToggle: SOURCE_LANGUAGES.BI,
        translations: 'תרגומים', select: 'בחירה', currentlySelected: 'נוכחי'}, 
    
    // Hebrew Interface and English Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'English', sourceLanguageToggle: SOURCE_LANGUAGES.EN,
        translations: 'תרגומים', select: 'בחירה', currentlySelected: 'נוכחי'}, 

    // English Interface and English Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'English', sourceLanguageToggle: SOURCE_LANGUAGES.EN,
        translations: 'Translations', select: 'Select', currentlySelected: 'Currently Selected'},

    // English Interface and English Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'Bilingual', sourceLanguageToggle: SOURCE_LANGUAGES.BI,
        translations: 'Translations', select: 'Select', currentlySelected: 'Currently Selected'},
    
    // English Interface and Hebrew Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'Hebrew', sourceLanguageToggle: SOURCE_LANGUAGES.HE,
        translations: 'Translations', select: 'Select', currentlySelected: 'Currently Selected'}

].forEach(({interfaceLanguage, interfaceLanguageToggle, sourceLanguage, sourceLanguageToggle, translations, currentlySelected, select}) => {
    test(`${interfaceLanguage} - translation name appears in title for ${sourceLanguage} source text`, async ({ context }) => {
         // Navigate to Bereshit in specified Interface Language
         const page = await goToPageWithLang(context,'/Genesis.1', `${interfaceLanguageToggle}`)

         // Change the Source Language of the text
         await changeLanguageOfText(page, sourceLanguageToggle)
 
         // Retain the translation name locator
         const translationNameInTitle = page.locator('span.readerTextVersion')
 
         // Navigate to the Translations sidebar by clicking on the text title
         //Clicks on בראשית א׳ / Genesis I
         await page.locator('h1').click()
         
         // Click on Translations
         await page.getByRole('link', {name: `${translations}`}).click()
         
         // Wait for Translations side-bar to load by waiting for 'Translations' header
         await page.waitForSelector('h3')

        // Check if the default translation in the title matches the selected translation
        // NOTE: We are skipping checking for the default translation here, due to the Hebrew text being default Masoretic
        if(sourceLanguage !== 'Hebrew'){
            const defaultTranslation = await translationNameInTitle.textContent()
            await expect(page.locator('div.version-with-preview-title-line', {hasText: defaultTranslation!}).getByRole('link')).toHaveText(`${currentlySelected}`)
        }
        
        // TODO: 4th translation, handling Hebrew Interface translations in Hebrew.  For example: 'חומש רש״י, רבי שרגא זילברשטיין' should appear in the translation title as written.
        const translationNames = ['The Schocken Bible, Everett Fox, 1995 ©', '«Да» project']
        
        // Utilizing the traditional for-loop as there are async issues with foreach
        for(let i = 0; i < translationNames.length; i++){
         
            // "Select" another translation.
            await page.locator('div.version-with-preview-title-line', {hasText: translationNames[i]}).getByText(`${select}`).click()
 
            // Validate selected translation is reflected in title
            await expect(translationNameInTitle).toHaveText(translationNames[i])
 
            // Validate selected translation says 'Currently Selected'
            await expect(page.locator('div.version-with-preview-title-line', {hasText: translationNames[i]}).getByRole('link')).toHaveText(`${currentlySelected}`)
         }
    })
});