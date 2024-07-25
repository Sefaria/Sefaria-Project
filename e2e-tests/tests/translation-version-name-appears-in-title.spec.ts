import {test, expect} from '@playwright/test';
import {goToPageWithLang, changeLanguageOfText} from "../utils";
import {LANGUAGES, SOURCE_LANGUAGES} from '../globals'

[
    // Hebrew Interface and Hebrew Source
    /*
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, sourceLanguage: SOURCE_LANGUAGES.HE,
        translations: 'תרגומים', currentlySelected: 'נוכחי', 
        secondTranslation: 'חומש רש״י, רבי שרגא זילברשטיין', thirdTranslation: '«Да» project'}, 
    */

    // Hebrew Interface and English Source
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, sourceLanguage: SOURCE_LANGUAGES.EN,
        translations: 'תרגומים', currentlySelected: 'נוכחי', 
        secondTranslation: 'The Schocken Bible, Everett Fox, 1995 ©', thirdTranslation: '«Да» project'}, 

    // English Interface and Hebrew Source
    /*
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, sourceLanguage: SOURCE_LANGUAGES.HE,
        translations: 'תרגומים', currentlySelected: 'נוכחי', 
        secondTranslation: 'The Schocken Bible, Everett Fox, 1995 ©', thirdTranslation: '«Да» project'}, 
    */
   
    // English Interface and English Source
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, sourceLanguage: SOURCE_LANGUAGES.EN,
        translations: 'Translations', currentlySelected: 'Currently Selected', 
        secondTranslation: 'The Schocken Bible, Everett Fox, 1995 ©', thirdTranslation: '«Да» project'}

].forEach(({interfaceLanguage, interfaceLanguageToggle, sourceLanguage, translations, currentlySelected, secondTranslation, thirdTranslation}) => {
    test(`${interfaceLanguage} - translation name appears in title for ${sourceLanguage} source text`, async ({ context }) => {

        // Navigate to Bereshit in specified Interface Language
        const page = await goToPageWithLang(context,'/Genesis.1', `${interfaceLanguageToggle}`)

        // Change the Source Language of the text
        await changeLanguageOfText(page, `${sourceLanguage}`)

        // Retain the translation name locator
        const translationNameInTitle = page.locator('span.readerTextVersion')

        // Click on the text title
        await translationNameInTitle.click()
        
        // Click on Translations
        await page.getByRole('link', {name: `${translations}`}).click()
        
        // Wait for Translations side-bar to load
        await page.waitForSelector('h3')

        // Check if the default translation in the title matches the selected translation
        const defaultTranslation = await translationNameInTitle.textContent()
        await expect(page.locator('div.version-with-preview-title-line', {hasText: defaultTranslation}).getByRole('link')).toHaveText(`${currentlySelected}`)

        // Translation name list
        const translationNames = [`${secondTranslation}`, `${thirdTranslation}`]

        // Utilizing this for-loop, as async issues were noticed with foreach
        for(let i = 0; i < translationNames.length; i++){
        
            // "Select" another translation.  Directly using Select vs בחירה is unnecessary due to DOM structure
            await page.locator('div.version-with-preview-title-line', {hasText: translationNames[i]}).getByRole('link').click()

            // Validate selected translation is reflected in title
            await expect(translationNameInTitle).toHaveText(translationNames[i])

            // Validate selected translation says 'Currently Selected'
            await expect(page.locator('div.version-with-preview-title-line', {hasText: translationNames[i]}).getByRole('link')).toHaveText(`${currentlySelected}`)
        }
    })
})