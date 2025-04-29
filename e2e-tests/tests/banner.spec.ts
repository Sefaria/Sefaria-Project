/* 
    PURPOSE: Test the header bar for Sefaria
        Is it appearing and functioning as usual?
        TODO: Tests to visualize mobile vs webpage behaviors
*/

import {test, expect} from '@playwright/test';
import {goToPageWithLang, getPathAndParams, isIsraelIp} from "../utils";
import {LANGUAGES} from '../globals';
import { PageManager } from '../pages/pageManager';

const testLanguageConfigs = [
    {testLanguage: "English", interfaceLanguage: LANGUAGES.EN},
    {testLanguage: "Hebrew", interfaceLanguage: LANGUAGES.HE}
]

testLanguageConfigs.forEach(({testLanguage, interfaceLanguage}) => {
    test(`Banner links - ${testLanguage}`, async({ context }) =>{
        const page = await goToPageWithLang(context,'/texts', interfaceLanguage)
        
        const pm = new PageManager(page, interfaceLanguage)

        await pm.navigateFromBannerTo().textsPageFromLogo()

        await pm.navigateFromBannerTo().textsPageFromLink()

        await pm.navigateFromBannerTo().topicsPage()

        await pm.navigateFromBannerTo().communityPage()

        const donatePage = await pm.navigateFromBannerTo().donatePage()
        await donatePage.close()

    })
})

testLanguageConfigs.forEach(({testLanguage, interfaceLanguage}) => {
    test(`Search Functionality from Banner - ${testLanguage}`, async({ context }) => {
        const page = await goToPageWithLang(context,'/texts', interfaceLanguage)
        
        const pm = new PageManager(page, interfaceLanguage)

        if(interfaceLanguage == LANGUAGES.HE){
            await pm.onSearchPage().searchFor('אהבה')
        }
        else{
            await pm.onSearchPage().searchFor('Love')
            await pm.onSearchPage().validateVirtualKeyboardForEnglish('א')
        }
    })
})

test('Toggle Language Based on Locale', async({ context }) => {
    const page = await goToPageWithLang(context,'/texts', LANGUAGES.HE)
    const pm = new PageManager(page, LANGUAGES.HE)
    
    const inIsrael = await isIsraelIp(page)

    if(inIsrael){
        await pm.toggleLanguage(LANGUAGES.EN)
    }
})
