import { Page, expect } from "@playwright/test"
import { LANGUAGES } from "../globals"
import { HelperBase } from "./helperBase"

export class TopicsPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    async validateTopicsPageLayout(){
        if(this.language == LANGUAGES.HE){
            await expect(this.page.locator('.contentInner')).toContainText('למדו לפי נושא')
            await expect(this.page.locator('.navSidebar')).toContainText('אודות "נושאים')
        }
        else{
            await expect(this.page.locator('.contentInner')).toContainText('Explore By Topic')
            await expect(this.page.locator('.navSidebar')).toContainText('About Topics')
        }

    }

}