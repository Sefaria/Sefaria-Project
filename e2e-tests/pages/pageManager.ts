import { Page } from "@playwright/test"
import {changeLanguage} from "../utils"
import {LANGUAGES} from '../globals'
import { Banner } from "./banner"
import { TextsPage } from "./textsPage"
import { TopicsPage } from "./topicsPage"
import { CommunityPage } from "./communityPage"
import { DonatePage } from "./donatePage"
import { LoginPage } from "./loginPage"
import { SignUpPage } from "./signupPage"
import { SearchPage } from "./searchPage"
import { UserMenu } from "./userMenu"
import { SourceTextPage } from "./sourceTextPage"

export class PageManager{
    private readonly page: Page
    private readonly banner: Banner
    private readonly textsPage: TextsPage
    private readonly topicsPage: TopicsPage
    private readonly communityPage: CommunityPage
    private readonly donatePage: DonatePage
    private readonly loginPage: LoginPage
    private readonly signupPage: SignUpPage
    private readonly searchPage: SearchPage
    private readonly userMenu: UserMenu
    private readonly sourceTextPage: SourceTextPage
    

    constructor(page: Page, language: string){
        this.page = page
        this.banner = new Banner(page, language)
        this.textsPage = new TextsPage(page, language)
        this.topicsPage = new TopicsPage(page, language)
        this.communityPage = new CommunityPage(page, language)
        this.donatePage = new DonatePage(page, language)
        this.loginPage = new LoginPage(page, language)
        this.signupPage = new SignUpPage(page, language)
        this.searchPage = new SearchPage(page, language)
        this.userMenu = new UserMenu(page, language)
        this.sourceTextPage = new SourceTextPage(page, language)
    }

    async toggleLanguage(newLanguage: any){
        await changeLanguage(this.page, newLanguage)
        this.banner.toggleLanguage(newLanguage)
        this.textsPage.toggleLanguage(newLanguage)
    }

    navigateTo(){
        return this.banner
    }

    onTextsPage(){
        return this.textsPage
    }

    onTopicsPage(){
        return this.topicsPage
    }

    onCommunityPage(){
        return this.communityPage
    }

    onDonatePage(){
        return this.donatePage
    }

    onLoginPage(){
        return this.loginPage
    }

    onSignUpPage(){
        return this.signupPage
    }

    onSearchPage(){
        return this.searchPage
    }

    onUserMenu(){
        return this.userMenu
    }

    onSourceTextPage(){
        return this.sourceTextPage
    }
}