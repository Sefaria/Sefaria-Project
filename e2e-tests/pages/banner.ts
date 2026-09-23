import { Page, expect } from "@playwright/test"
import { LANGUAGES, testUser } from '../globals'
import { getPathAndParams } from "../utils"
import { LoginPage } from "./loginPage"

export class Banner{
    private page: Page
    private language: string

    constructor(page: Page, language: string){
        this.page = page
        this.language = language
    }

    async toggleLanguage(newLanguage: string){
        this.language = newLanguage
    }

    async textsPageFromLogo(){
        await this.page.getByRole('link', { name: 'Sefaria Logo' }).click();
        
        expect(getPathAndParams(this.page.url())).toEqual("/texts")
    }

    async textsPageFromLink(){
        if(this.language == LANGUAGES.EN){
            await this.page.getByRole('banner').getByRole('link', { name: 'Texts' }).click();
        }
        else{
            await this.page.getByRole('banner').getByRole('link', { name: 'מקורות' }).click();
        }
        
        expect(getPathAndParams(this.page.url())).toEqual("/texts")
    }

    async topicsPage(){
        if(this.language == LANGUAGES.EN){
            await this.page.getByRole('banner').getByRole('link', { name: 'Explore' }).click();
        }
        else{
            await this.page.getByRole('banner').getByRole('link', { name: 'נושאים' }).click();
        }
        
        expect(getPathAndParams(this.page.url())).toBe("/topics")
    }

    async communityPage(){
        if(this.language == LANGUAGES.EN){
            await this.page.getByRole('banner').getByRole('link', { name: 'Community' }).click();
        }
        else{
            await this.page.getByRole('banner').getByRole('link', { name: 'קהילה' }).click();
        }

        expect(getPathAndParams(this.page.url())).toEqual("/community")
    }

    async donatePage(): Promise<Page>{
        const donatePagePromise = this.page.waitForEvent('popup')

        if(this.language == LANGUAGES.EN){
            await this.page.getByRole('banner').getByRole('link', { name: 'Donate' }).click();
        }
        else{
            await this.page.getByRole('banner').getByRole('link', { name: 'תרומה' }).click();
        }

        const donatePage = await donatePagePromise
        
        expect(donatePage.url()).toContain("https://donate.sefaria.org/")

        return donatePage
    }

    async helpPage(){
        if(this.language == LANGUAGES.EN){
            await this.page.getByRole('banner').getByRole('link', { name: 'Help' }).click();
        }
        else{
            await this.page.getByRole('banner').getByRole('link', { name: 'עזרה' }).click();
        }
        
        expect(getPathAndParams(this.page.url())).toContain("/collections/")
    }

    //keeping this here because it can be used across the site
    async loginThroughBanner(){
        if(this.language == LANGUAGES.EN){
            await this.page.getByRole('banner').getByRole('link', { name: 'Log in' }).click();
        }
        else{
            await this.page.getByRole('banner').getByRole('link', { name: 'התחברות' }).click();
        }
        const loginPage = new LoginPage(this.page, this.language);
        await loginPage.loginAs(testUser);
    };

    
}