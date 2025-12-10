import { expect, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { LANGUAGES } from '../globals';

/**
 * Page object for edit profile page
 * URL: /settings/profile
 */
export class EditProfilePage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // Locators
  get firstNameInput() {
    return this.page.locator('#firstName');
  }

  get lastNameInput() {
    return this.page.locator('#lastName');
  }

  get positionInput() {
    return this.page.locator('#position');
  }

  get organizationInput() {
    return this.page.locator('#organization');
  }

  get websiteInput() {
    return this.page.locator('#website');
  }

  get locationInput() {
    return this.page.locator('#location');
  }

  get bioEditor() {
    return this.page.locator('#bio');
  }

  get publicEmailInput() {
    return this.page.locator('#public_email');
  }

  get slugInput() {
    return this.page.locator('#slug');
  }

  get twitterInput() {
    return this.page.locator('#twitter');
  }

  get linkedinInput() {
    return this.page.locator('#linkedin');
  }

  get facebookInput() {
    return this.page.locator('#facebook');
  }

  get youtubeInput() {
    return this.page.locator('#youtube');
  }

  get saveButton() {
    return this.page.locator('#saveProfile, .saveProfileButton');
  }

  get cancelButton() {
    return this.page.getByRole('link', { name: this.language === LANGUAGES.EN ? 'Cancel' : 'בטל' });
  }

  // Actions
  async editField(fieldName: 'firstName' | 'lastName' | 'position' | 'organization' | 'website' | 'location' | 'publicEmail' | 'twitter' | 'linkedin' | 'facebook' | 'youtube', value: string) {
    const fieldMap = {
      firstName: this.firstNameInput,
      lastName: this.lastNameInput,
      position: this.positionInput,
      organization: this.organizationInput,
      website: this.websiteInput,
      location: this.locationInput,
      publicEmail: this.publicEmailInput,
      twitter: this.twitterInput,
      linkedin: this.linkedinInput,
      facebook: this.facebookInput,
      youtube: this.youtubeInput,
    };

    const field = fieldMap[fieldName];
    await field.clear();
    await field.fill(value);
  }

  async editBio(bioText: string) {
    await this.bioEditor.click();
    await this.bioEditor.clear();
    await this.bioEditor.fill(bioText);
  }

  async saveProfile() {
    await this.saveButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async cancel() {
    await this.cancelButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async verifyPageLoaded() {
    await expect(this.page.locator('#editProfilePage')).toBeVisible();
    await expect(this.saveButton).toBeVisible();
  }

  async editMultipleFields(fields: Partial<{
    firstName: string;
    lastName: string;
    position: string;
    organization: string;
    website: string;
    location: string;
    bio: string;
    publicEmail: string;
    twitter: string;
    linkedin: string;
    facebook: string;
    youtube: string;
  }>) {
    for (const [field, value] of Object.entries(fields)) {
      if (field === 'bio') {
        await this.editBio(value);
      } else {
        await this.editField(field as any, value);
      }
    }
  }
}
