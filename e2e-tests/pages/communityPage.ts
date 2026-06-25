import { Page, expect } from "@playwright/test"
import { LANGUAGES } from "../globals"
import { HelperBase } from "./helperBase"

export class CommunityPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    async validateCommunityPageLayout(){
        if(this.language == LANGUAGES.HE){
            await expect(this.page.locator('.contentInner')).toContainText('היום בספריא')
            await expect(this.page.locator('.navSidebar')).toContainText('קחו חלק בשיח')
        }
        else{
            await expect(this.page.locator('.contentInner')).toContainText('Today on Sefaria')
            await expect(this.page.locator('.navSidebar')).toContainText('Join the Conversation')
        }
    }

}