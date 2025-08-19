import { Page } from "@playwright/test"


export class HelperBase{
    readonly page : Page
    language: string

    constructor(page : Page, language: string){
        this.page = page
        this.language = language
    }

    toggleLanguage(newLanguage: string){
        this.language = newLanguage
    }

    getPathAndParams(){
        const urlObj = new URL(this.page.url());
        console.log(urlObj.pathname)
        console.log(urlObj.search)
        return urlObj.pathname + urlObj.search;
    }
}