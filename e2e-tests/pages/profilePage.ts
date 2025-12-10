import { expect, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { LANGUAGES } from '../globals';

/**
 * Page object for user profile page
 * URL: /profile/{username}
 */
export class ProfilePage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // Locators
  get profileImage() {
    return this.page.locator('.profilePicAndButtonContainer .profile-pic');
  }

  get profileName() {
    return this.page.locator('.title.pageTitle');
  }

  get profileTagline() {
    return this.page.locator('.title.sub-title');
  }

  get position() {
    return this.page.locator('#position');
  }

  get organization() {
    return this.page.locator('#organization');
  }

  get profileWebsite() {
    return this.page.locator('.title.sub-sub-title');
  }

  get profileLocation() {
    return this.page.locator('#profileLocation');
  }

  get profileEmail() {
    return this.page.locator('#profileEmail');
  }

  get editProfileButton() {
    return this.page.locator('.profile-actions');
  }

  get bio() {
    return this.page.locator('#bio');
  }

  get profileSheets() {
    return this.page.locator('#profileSheets');
  }

  // Actions
  async clickEditProfile() {
    await this.editProfileButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async verifyProfileArtifacts(expectedData: {
    name?: string;
    position?: string;
    organization?: string;
    website?: string;
    location?: string;
    email?: string;
    hasBio?: boolean;
  }) {
    // Verify profile image exists
    await expect(this.profileImage).toBeVisible();

    // Verify name
    if (expectedData.name) {
      await expect(this.profileName).toContainText(expectedData.name);
    }

    // Verify position and organization
    if (expectedData.position || expectedData.organization) {
      await expect(this.profileTagline).toBeVisible();
      if (expectedData.position) {
        await expect(this.position).toContainText(expectedData.position);
      }
      if (expectedData.organization) {
        await expect(this.organization).toContainText(expectedData.organization);
      }
    }

    // Verify website if exists
    if (expectedData.website) {
      await expect(this.profileWebsite).toBeVisible();
    }

    // Verify location if exists
    if (expectedData.location) {
      await expect(this.profileLocation).toBeVisible();
    }

    // Verify email if exists
    if (expectedData.email) {
      await expect(this.profileEmail).toBeVisible();
    }

    // Verify bio if expected
    if (expectedData.hasBio) {
      await expect(this.bio).toBeVisible();
    }
  }

  async verifyEditButtonVisible() {
    await expect(this.editProfileButton).toBeVisible();
  }
}
