import { test, expect } from "@playwright/test";
import { TextsPage } from "../pages/textsPage";
import { LANGUAGES } from "../globals";
import { goToPageWithLang } from "../utils";

// Constants for expected Hebrew and English text
const EXPECTED_TEXTS_JOB_1_1 = {
  he: 'אִ֛ישׁ הָיָ֥ה בְאֶֽרֶץ־ע֖וּץ אִיּ֣וֹב שְׁמ֑וֹ וְהָיָ֣ה ׀ הָאִ֣ישׁ הַה֗וּא תָּ֧ם וְיָשָׁ֛ר וִירֵ֥א אֱלֹהִ֖ים וְסָ֥ר מֵרָֽע׃',
  en: 'There was a man in the land of Uz named Job. That man was blameless and upright; he feared God and shunned evil.'
};
const SELECTED_LANGUAGE = LANGUAGES.HE; // Default our website to either be israel or non-israel version (sefaria.org.il || sefaria.org)

test.describe('Test Language Toggle in Reader for Job', () => {
  let textsPage: TextsPage;

  test.beforeEach(async ({ context }) => {
    // Use goToPageWithLang to navigate to the Tanakh page with the desired language
    const page = await goToPageWithLang(context, '/texts', SELECTED_LANGUAGE);

    // Initialize the TextsPage object
    textsPage = new TextsPage(page, SELECTED_LANGUAGE);

    // Navigate to Tanakh section
    await textsPage.clickTanakh();

    // Define the Job section name in both Hebrew and English (CAN UPDATE IF NEEDED)
    const jobNameEnHe = {
      he: 'איוב',
      en: 'Job'
    };

    // Navigate to Job section
    await textsPage.navigateToSection(jobNameEnHe, true);
    // Navigate to the first chapter of Job

    // Define the chapter number in both Hebrew and English (CAN UPDATE IF NEEDED)
    const chapterNumber = {
      he: 'א',
      en: '1'
    }
    await textsPage.navigateToChapter(chapterNumber);

    // If working with English website, we ensure that default translation is set 
    // (REFRACTOR LATER SO PAGE MODEL DOES THIS)
    if (SELECTED_LANGUAGE === LANGUAGES.EN)
      {
      // Define the translation version to be used (CAN UPDATE IF NEEDED)
      const translationVersion = 'JPS, 1985';
      // Ensure the translation version is set correctly
      await textsPage.ensureTranslationVersion(translationVersion)
    }

  });

  test('Verify language toggles correctly and text updates accordingly', async () => {
    // Verify default bilingual text if on English website 
    // (REFRACTOR LATER SO PAGE MODEL DOES THIS)
    if (SELECTED_LANGUAGE === LANGUAGES.EN) {
      await textsPage.verifyTextVisibility('Bilingual', EXPECTED_TEXTS_JOB_1_1);
    }

    // Toggle to Hebrew-only
    await textsPage.toggleLanguage('Hebrew');
    await textsPage.verifyTextVisibility('Hebrew', EXPECTED_TEXTS_JOB_1_1);

    // Toggle to English-only
    await textsPage.toggleLanguage('English');
    await textsPage.verifyTextVisibility('English', EXPECTED_TEXTS_JOB_1_1);

    // Toggle back to bilingual
    await textsPage.toggleLanguage('Bilingual');
    await textsPage.verifyTextVisibility('Bilingual', EXPECTED_TEXTS_JOB_1_1);
  });
});