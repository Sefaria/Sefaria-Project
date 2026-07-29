import { Page, expect } from "@playwright/test"
import { LANGUAGES } from "../globals"
import { HelperBase } from "./helperBase"
import { clickContinueWithEmail } from "../utils"

export class SignUpPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    // /register lands on AuthPage's ChooseView before the RegisterView form
    // exists — see clickContinueWithEmail in utils.ts (shared with LoginPage).
    async clickContinueWithEmail() {
        await clickContinueWithEmail(this.page, this.language);
    }

    // This class will be good to validate error messages associated with sign-up.
    // RegisterView (static/js/auth/RegisterView.jsx) has no educator checkbox —
    // that field was dropped when the registration form was rebuilt for SSO.
    async fillNewUser(email: string, password: string, firstName: string, lastName: string){
        const labels = this.language === LANGUAGES.HE
            ? { email: 'דוא״ל', password: 'סיסמה', first: 'שם פרטי', last: 'שם משפחה' }
            : { email: 'Email Address', password: 'Password', first: 'First Name', last: 'Last Name' };
        await this.page.getByLabel(labels.email).fill(email)
        await this.page.getByLabel(labels.password).fill(password)
        await this.page.getByLabel(labels.first).fill(firstName)
        await this.page.getByLabel(labels.last).fill(lastName)
    }
}