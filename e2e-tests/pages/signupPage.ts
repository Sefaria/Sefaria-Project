import { Page, expect } from "@playwright/test"
import { LANGUAGES } from "../globals"
import { HelperBase } from "./helperBase"

export class SignUpPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    // This class will be good to validate error messages associated with sign-up
    async fillNewUser(email: string, password: string, firstName: string, lastName: string, isEducator: boolean){
        await this.page.getByRole('textbox', {name: 'Email'}).fill(email)
        await this.page.getByRole('textbox', {name: 'Password'}).fill(password)
        await this.page.getByRole('textbox', {name: 'First Name'}).fill(firstName)
        await this.page.getByRole('textbox', {name: 'Last Name'}).fill(lastName)

        if(isEducator){
            if(this.language == LANGUAGES.HE){
                await this.page.getByRole('checkbox', {name: 'אני מחנך/ מחנכת'}).check()
            }
            else{
                await this.page.getByRole('checkbox', {name: 'I am an educator'}).check()
            }
        }
    }
}