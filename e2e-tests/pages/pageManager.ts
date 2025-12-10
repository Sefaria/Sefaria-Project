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
import { SheetEditorPage } from "./sheetEditorPage"
import { ModuleHeaderPage } from "./moduleHeaderPage"
import { ModuleSidebarPage } from "./moduleSidebarPage"
import { ProfilePage } from "./profilePage"
import { EditProfilePage } from "./editProfilePage"
import { AccountSettingsPage } from "./accountSettingsPage"

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
    private readonly sheetEditorPage: SheetEditorPage
    private readonly moduleHeaderPage: ModuleHeaderPage
    private readonly moduleSidebarPage: ModuleSidebarPage
    private readonly profilePage: ProfilePage
    private readonly editProfilePage: EditProfilePage
    private readonly accountSettingsPage: AccountSettingsPage


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
        this.sheetEditorPage = new SheetEditorPage(page, language)
        this.moduleHeaderPage = new ModuleHeaderPage(page, language)
        this.moduleSidebarPage = new ModuleSidebarPage(page, language)
        this.profilePage = new ProfilePage(page, language)
        this.editProfilePage = new EditProfilePage(page, language)
        this.accountSettingsPage = new AccountSettingsPage(page, language)
    }

    navigateFromBannerTo(){
        // This method is used to navigate to different pages using the banner
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

    onSourceSheetEditorPage(){
        return this.sheetEditorPage
    }

    onModuleHeader(){
        return this.moduleHeaderPage
    }

    onModuleSidebar(){
        return this.moduleSidebarPage
    }

    onProfilePage(){
        return this.profilePage
    }

    onEditProfilePage(){
        return this.editProfilePage
    }

    onAccountSettingsPage(){
        return this.accountSettingsPage
    }
}