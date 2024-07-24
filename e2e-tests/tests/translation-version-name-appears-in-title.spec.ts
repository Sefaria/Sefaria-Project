import {test, expect} from '@playwright/test';
import {goToPageWithLang} from "../utils";
import {LANGUAGES} from '../globals'

[
    {interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, translations: 'תרגומים', currentlySelected: 'נוכחי', secondTranslation: 'חומש רש״י, רבי שרגא זילברשטיין', thirdTranslation: '«Да» project'},
    {interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, translations: 'Translations', currentlySelected: 'Currently Selected', secondTranslation: 'The Rashi chumash by Rabbi Shraga Silverstein', thirdTranslation: '«Да» project'}
].forEach(({interfaceLanguage, interfaceLanguageToggle, translations, currentlySelected, secondTranslation, thirdTranslation}) => {
    test(`${interfaceLanguage} - translation name appears in title`, async ({ context }) => {

        // Navigate to Bereshit in specified Interface Language
        const page = await goToPageWithLang(context,'/Genesis.1', `${interfaceLanguageToggle}`)

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