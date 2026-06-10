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
    
   // youTubeIframe = () => this.page.locator('.media.fullWidth .youTubeContainer iframe[src*="youtube.com/embed/"]');
  //  youTubePlayButton = () => this.page.locator('button.ytp-large-play-button');
   // youTubePauseButton = () => this.page.locator('button.ytp-play-button[title*="Pause"], button.ytp-play-button[aria-label*="Pause"]');
    //spotifyIframe = () => this.page.locator('iframe[src*="open.spotify.com/embed/"]');
   // spotifyPlayButton =  () => this.page.locator('button[data-testid="play-pause-button"]');
   // spotifyPauseButton = () => this.page.locator('svg[role="img"] > title', { hasText: 'Pause' });
    youTubeIframe = () => this.page.frameLocator('.media.fullWidth .youTubeContainer iframe[src*="youtube.com/embed/"]');
    youTubeIframeElement = () => this.page.locator('.media.fullWidth .youTubeContainer iframe[src*="youtube.com/embed/"]');
    youTubePlayerArea = () => this.youTubeIframe().locator('.html5-video-player');
    youTubeLargePlayButton = () => this.youTubeIframe().locator('button.ytp-large-play-button');
    youTubePlayPauseButton = () => this.youTubeIframe().locator('button.ytp-play-button');
    youTubePauseButton = () => this.youTubeIframe().locator('button.ytp-play-button[title*="Pause"], button.ytp-play-button[aria-label*="Pause"]');

    spotifyIframe = () => this.page.frameLocator('iframe[src*="open.spotify.com/embed/"]');
    spotifyIframeElement = () => this.page.locator('iframe[src*="open.spotify.com/embed/"]');
    spotifyPlayPauseButton = () => this.spotifyIframe().locator('button[data-testid="play-pause-button"]');    //spotifyPauseButton = () => this.spotifyIframe().locator('svg[role="img"] > title', { hasText: 'Pause' });
    
    resourcePanel = () => this.page.locator('.connectionsPanel');
    closeResourcePanel = async () => {
        await this.page.locator('a.readerNavMenuCloseButton.circledX').click();
        await expect(this.resourcePanel()).not.toBeVisible();
    }



}

