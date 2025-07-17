import { BrowserContext, Cookie, ElementHandle, Locator, Page } from 'playwright-core';
import { expect } from 'playwright/test';
import {isClickable} from "../utils";
import { SaveStates, SaveState } from '../constants';
import { LANGUAGES, testUser } from '../globals';
import { HelperBase } from "./helperBase";
import { LoginPage } from './loginPage';

export class SheetReaderPage extends HelperBase {
    constructor(page: Page, language: string) {
        super(page, language);
    }
    topTitle = () => this.page.locator('.readerControlsTitle h1');
    outsideText = () => this.page.locator('.SheetOutsideText .sourceContentText');
    sourceBox = () => this.page.locator('.SheetSource .sheetItem.segment');
    sourceRefHebrew = () => this.page.locator('.SheetSource .he .ref');
    sourceRefEnglish = () => this.page.locator('.SheetSource .en .ref');
    sourceTextHebrew = () => this.page.locator('.SheetSource .he .sourceContentText');
    sourceTextEnglish = () => this.page.locator('.SheetSource .en .sourceContentText');
    addedImage = () => this.page.locator('img.addedMedia');
    youTubeIframe = () => this.page.locator('.media.fullWidth .youTubeContainer iframe[src*="youtube.com/embed/"]');
    spotifyIframe = () => this.page.locator('iframe[src*="open.spotify.com/embed/"]');
    resourcePanel = () => this.page.locator('.connectionsPanel');
    closeResourcePanel = async () => {
        await this.page.locator('a.readerNavMenuCloseButton.circledX').click();
        await expect(this.resourcePanel()).not.toBeVisible();
    }



}

