import { Page, expect } from "@playwright/test"
import { LANGUAGES } from "../globals"
import { HelperBase } from "./helperBase"

export class UserMenu extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    async clickUserMenu(userInitials: string){
        await this.page.getByRole('link', {name: userInitials}).click()
    }

    async clickProfile(){
        if(this.language == LANGUAGES.HE){
            await this.page.getByRole('link', {name: 'פרופיל'}).click()
        }
        else{
            await this.page.getByRole('link', {name: 'Profile'}).click()
        }
    }

    async clickCreateNewSheet(){
        if(this.language == LANGUAGES.HE){
            await this.page.getByRole('link', {name: 'יצירת דף מקורות'}).click()
        }
        else{
            await this.page.getByRole('link', {name: 'Create a New Sheet'}).click()
        }
    }

    async accountSettings(){
        if(this.language == LANGUAGES.HE){
            await this.page.getByRole('link', {name: 'הגדרות'}).click()
        }
        else{
            await this.page.getByRole('link', {name: 'Account Settings'}).click()
        }
    }

    async clickLanguage(language: string){
        if(language == LANGUAGES.EN){
            await this.page.getByRole('link', {name: 'English'}).click()
        }
        else{
            await this.page.getByRole('link', {name: 'עברית'}).click()
        }
        
    }

    async clickHelp(){
        if(this.language == LANGUAGES.HE){
            await this.page.getByRole('link', {name: 'עזרה'}).click()
        }
        else{
            await this.page.getByRole('link', {name: 'Help'}).click()
        }
    }

    async clickLogout(){
        if(this.language == LANGUAGES.HE){
            await this.page.getByRole('link', {name: 'ניתוק'}).click()
        }
        else{
            await this.page.getByRole('link', {name: 'Logout'}).click()
        }
    }

}