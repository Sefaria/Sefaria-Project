import { expect, Page } from '@playwright/test';
import { hideAllModalsAndPopups } from '../utils';
import { SELECTORS, SiteConfig, TabOrderItem, SEARCH_DROPDOWN, SearchDropdownSection, SearchDropdownIcon, AUTH_CONSTANTS, AuthUser } from './constantsMDL';


export class UtilTestHelpers {
    constructor(private page: Page) {}

  /**
   * Navigates to a URL and hides all modals/popups to ensure clean test state.
   * @param url - The URL to navigate to
   */
  async navigateAndHideModals(url: string) {
    await this.page.goto(url);
    await hideAllModalsAndPopups(this.page);
  }

  /**
   * Closes the guide overlay if it appears on sheet creation or navigation.
   * This is a wrapper around the hideTipsAndTricks utility function.
   * @returns Promise<void>
   */
  async closeGuideOverlay(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
  }

}