import { Page, Locator } from '@playwright/test';
import { HelperBase } from './helperBase';

export class CommunityBooksPage extends HelperBase {
  readonly titleEnInput: Locator;
  readonly titleHeInput: Locator;
  readonly structureRadioDepth1: Locator;
  readonly structureRadioDepth2: Locator;
  readonly languageSelect: Locator;
  readonly descEnInput: Locator;
  readonly descHeInput: Locator;
  readonly fileInput: Locator;
  readonly fileUploadArea: Locator;
  readonly licenseSelect: Locator;
  readonly guideCheckbox: Locator;
  readonly tosCheckbox: Locator;
  readonly uploadButton: Locator;
  readonly confirmButton: Locator;
  readonly errorBanner: Locator;
  readonly successMessage: Locator;
  readonly structurePreview: Locator;

  constructor(page: Page, language: string) {
    super(page, language);
    // Titles: actual Hebrew text from CommunityUploadPage.jsx is כותרת הספר (not שם הספר)
    this.titleEnInput = page.locator('.formField').filter({ hasText: /Book Title \(English\)|כותרת הספר \(אנגלית\)/ }).locator('input');
    this.titleHeInput = page.locator('.formField').filter({ hasText: /Book Title \(Hebrew\)|כותרת הספר \(עברית\)/ }).locator('input');
    this.structureRadioDepth1 = page.locator('input[type="radio"][value="depth1"]');
    this.structureRadioDepth2 = page.locator('input[type="radio"][value="depth2"]');
    this.languageSelect = page.locator('.formField').filter({ hasText: /Language of Text|שפת הטקסט/ }).locator('select');
    this.descEnInput = page.locator('.formField').filter({ hasText: /Description \(English\)|תיאור \(אנגלית\)/ }).locator('textarea');
    this.descHeInput = page.locator('.formField').filter({ hasText: /Description \(Hebrew\)|תיאור \(עברית\)/ }).locator('textarea');
    this.fileInput = page.locator('input[type="file"]');
    this.fileUploadArea = page.locator('.fileUpload');
    // Actual selector: the <select> itself carries className="licenseSelect" (not a child select inside .licenseSelect)
    this.licenseSelect = page.locator('select.licenseSelect');
    // Actual IDs: guideChecked / tosChecked (not guideCheck / tosCheck)
    this.guideCheckbox = page.locator('#guideChecked');
    this.tosCheckbox = page.locator('#tosChecked');
    this.uploadButton = page.locator('.submitButton').first();
    this.confirmButton = page.locator('.submitButton').filter({ hasText: /Confirm Submission|אישור הגשה/ });
    this.errorBanner = page.locator('.errorBanner');
    this.successMessage = page.locator('.successMessage');
    this.structurePreview = page.locator('.structurePreview');
  }

  async fillForm(options: {
    titleEn?: string;
    titleHe?: string;
    structure?: 'depth1' | 'depth2';
    language?: string;
    descEn?: string;
    descHe?: string;
    license?: string;
    filePath?: string;
    checkGuide?: boolean;
    checkTos?: boolean;
  }) {
    if (options.titleEn) await this.titleEnInput.fill(options.titleEn);
    if (options.titleHe) await this.titleHeInput.fill(options.titleHe);
    if (options.structure === 'depth2') await this.structureRadioDepth2.click();
    if (options.language) await this.languageSelect.selectOption(options.language);
    if (options.descEn) await this.descEnInput.fill(options.descEn);
    if (options.descHe) await this.descHeInput.fill(options.descHe);
    if (options.license) await this.licenseSelect.selectOption(options.license);
    if (options.filePath) await this.fileInput.setInputFiles(options.filePath);
    if (options.checkGuide) await this.guideCheckbox.check();
    if (options.checkTos) await this.tosCheckbox.check();
  }
}
