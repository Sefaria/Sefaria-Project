import { test, expect } from '@playwright/test';
import { PageManager } from '../pages/pageManager';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, SOURCE_LANGUAGES } from '../globals';

test.describe('Content Language affects Table of Contents display', () => {
  
    test('ToC displays in English when contentLanguage is set to "Translation"', async ({ context }) => {
        const page = await goToPageWithLang(context, '/Genesis.1', LANGUAGES.EN); // English UI
        const pm = new PageManager(page, LANGUAGES.EN);
        const sourceTextPage = pm.onSourceTextPage();
  await hideAllModalsAndPopups(page);
        await sourceTextPage.setContentLanguage(SOURCE_LANGUAGES.EN); 
  await hideAllModalsAndPopups(page); 
        await page.locator('p.segmentText span.contentSpan.translation').first().click(); // Trigger sidebar
        await sourceTextPage.openTableOfContents();
        await expect(page.locator('.specialNavSectionHeader span.contentSpan').first()).toHaveText(/Chapters|פרקים/);
        await expect(page.locator('a.sectionLink.current span.contentSpan').first()).toHaveText(/1|א/);
      });
      
  test('ToC displays in Hebrew when contentLanguage is set to "source"', async ({ context }) => {
    const page = await goToPageWithLang(context, '/Genesis.1', LANGUAGES.EN); // English UI
        const pm = new PageManager(page, LANGUAGES.EN);
        const sourceTextPage = pm.onSourceTextPage();
  await hideAllModalsAndPopups(page);
        await sourceTextPage.setContentLanguage(SOURCE_LANGUAGES.HE);
  await hideAllModalsAndPopups(page); 
        await page.locator('span.contentSpan.he.primary[lang="he"]').first().click(); // Trigger sidebar
        await sourceTextPage.openTableOfContents();
        await expect(page.locator('.specialNavSectionHeader span.contentSpan').first()).toHaveText(/Chapters|פרקים/);
        await expect(page.locator('a.sectionLink.current span.contentSpan').first()).toHaveText(/1|א/);
  });

});
