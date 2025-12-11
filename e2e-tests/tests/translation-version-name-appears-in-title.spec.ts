import {test, expect} from '@playwright/test';
import {goToPageWithLang} from "../utils";
import {LANGUAGES, SOURCE_LANGUAGES} from '../globals'
import { PageManager } from '../pages/pageManager';

[
    // Hebrew Interface and Hebrew Source
    {
        interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'Hebrew', sourceLanguageToggle: SOURCE_LANGUAGES.HE,
    }, 

    // Hebrew Interface and Bilingual Source
    {
        interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'Bilingual', sourceLanguageToggle: SOURCE_LANGUAGES.BI,
    },  
    
    // Hebrew Interface and English Source
    {
        interfaceLanguage: 'Hebrew', interfaceLanguageToggle: LANGUAGES.HE, 
        sourceLanguage: 'English', sourceLanguageToggle: SOURCE_LANGUAGES.EN,
    }, 

    // English Interface and English Source
    {
        interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'English', sourceLanguageToggle: SOURCE_LANGUAGES.EN,
    },

    // English Interface and Bilingual Source
    {
        interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN,        
        sourceLanguage: 'Bilingual', sourceLanguageToggle: SOURCE_LANGUAGES.BI,
    },
    
    // English Interface and Hebrew Source
    {
        interfaceLanguage: 'English', interfaceLanguageToggle: LANGUAGES.EN, 
        sourceLanguage: 'Hebrew', sourceLanguageToggle: SOURCE_LANGUAGES.HE,
    }

].forEach(({interfaceLanguage, interfaceLanguageToggle, sourceLanguage, sourceLanguageToggle}) => {
    test(`${interfaceLanguage} - translation name appears in title for ${sourceLanguage} source text`, async ({ context }) => {
        // Navigate to Bereshit in specified Interface Language
        const page = await goToPageWithLang(context,'/Genesis.1', interfaceLanguageToggle)

        const pm = new PageManager(page, interfaceLanguageToggle)

        await pm.onSourceTextPage().changeTextLanguage(sourceLanguageToggle)

        await pm.onSourceTextPage().goToTranslations()
        
        const translationNames = ['The Schocken Bible, Everett Fox, 1995 ©', '«Да» project']
        
        // Utilizing the traditional for-loop as there are async issues with foreach
        for(let i = 0; i < translationNames.length; i++){
            await pm.onSourceTextPage().selectTranslation(translationNames[i])
        }
    })
})

