import { test, expect } from "@playwright/test";
import { ReaderPage } from "../pages/readerPage.page";
import { LANGUAGES } from "../globals";
import { goToPageWithLang, hideCookiesPopup, hideGenericBanner} from "../utils";

// ||< CONSTANTS >||

// Constants for expected Hebrew and English text for Job1.1 with vowel and cantelation marks(CAN UPDATE IF NEEDED)
const EXPECTED_TEXTS_JOB_1_1_with_VOWEL_with_CANTELATION = {
  he: 'אִ֛ישׁ הָיָ֥ה בְאֶֽרֶץ־ע֖וּץ אִיּ֣וֹב שְׁמ֑וֹ וְהָיָ֣ה ׀ הָאִ֣ישׁ הַה֗וּא תָּ֧ם וְיָשָׁ֛ר וִירֵ֥א אֱלֹהִ֖ים וְסָ֥ר מֵרָֽע׃',
  en: 'There was a man in the land of Uz named Job. That man was blameless and upright; he feared God and shunned evil.'
};

const EXPECTED_TEXTS_JOB_1_1_with_VOWEL_without_CANTELATION = 'אִישׁ הָיָה בְאֶרֶץ־עוּץ אִיּוֹב שְׁמוֹ וְהָיָה  הָאִישׁ הַהוּא תָּם וְיָשָׁר וִירֵא אֱלֹהִים וְסָר מֵרָע׃'

const EXPECTED_TEXTS_JOB_1_1_without_VOWEL_without_CANTELATION = 'איש היה בארץ־עוץ איוב שמו והיה  האיש ההוא תם וישר וירא אלהים וסר מרע'

// Constants for section and chapter names in both Hebrew and English
const JOB_SECTION_NAME = {
  he: 'איוב',
  en: 'Job',
};

const CHAPTER_NUMBER = {
  he: 'א',
  en: '1',
};

// Default our website to either be israel or non-israel version (sefaria.org.il || sefaria.org)
const SELECTED_LANGUAGE = LANGUAGES.EN; 

// Translation version to be used for English website
const TRANSLATION_VERSION = 'JPS, 1985';

// Works for both Hebrew and English Website
test.describe('Reader Page Automatic tests - Language toggle, font sizes, etc', () => {
  let textsPage: ReaderPage;

  test.beforeEach(async ({ context }) => {
    // Use goToPageWithLang to navigate to the texts page with the desired language (Website type)
    const page = await goToPageWithLang(context, '/Job', SELECTED_LANGUAGE);

    // Initialize the ReaderPage object
    textsPage = new ReaderPage(page, SELECTED_LANGUAGE);
    await hideCookiesPopup(page);
    await hideGenericBanner(page);

    // REMOVE FOR NOW BECAUSE WE DO NOT HAVE TO TES THIS, WE ARE TESTING SPECICI FUNCTION
    /*
      // Navigate to Tanakh section
      // await textsPage.clickTanakh();

      // // Navigate to Job section
      // await textsPage.navigateToSection(JOB_SECTION_NAME, true);
    */

    // Navigate to the first chapter of Job
    await textsPage.navigateToChapter(CHAPTER_NUMBER);

    // If working with English website, we ensure that default translation is set 
    // (REFRACTOR LATER SO PAGE MODEL DOES THIS)
    if (SELECTED_LANGUAGE === LANGUAGES.EN)
    {
      await textsPage.ensureTranslationVersion(TRANSLATION_VERSION);
    }

  });

  test('Verify language toggles correctly and text updates accordingly', async () => {
    // Verify default bilingual text if on English website 
    // (REFRACTOR LATER SO PAGE MODEL DOES THIS)
    if (SELECTED_LANGUAGE === LANGUAGES.EN) {
      await textsPage.verifyTextVisibility('Bilingual', EXPECTED_TEXTS_JOB_1_1_with_VOWEL_with_CANTELATION);
    }

    // Toggle to Hebrew-only
    await textsPage.toggleLanguage('Hebrew');
    await textsPage.verifyTextVisibility('Hebrew', EXPECTED_TEXTS_JOB_1_1_with_VOWEL_with_CANTELATION);

    // Toggle to English-only
    await textsPage.toggleLanguage('English');
    await textsPage.verifyTextVisibility('English', EXPECTED_TEXTS_JOB_1_1_with_VOWEL_with_CANTELATION);

    // Toggle back to bilingual
    await textsPage.toggleLanguage('Bilingual');
    await textsPage.verifyTextVisibility('Bilingual', EXPECTED_TEXTS_JOB_1_1_with_VOWEL_with_CANTELATION);
  });

  test('Check font size increases and decreases', async () => {
    // Toggle to bilingual mode to ensure both texts are visible (Should be default on English website)
    await textsPage.toggleLanguage('Bilingual');
    // Define the amount to increase or decrease font size
    // This can be adjusted based on the design requirements or user preferences
    const increaseOrDecreaseAmount = 3

    // Store initial font sizes for both Hebrew and English texts
    const initialFontSizes = await textsPage.getFontSizes();

    // Increase font size
    await textsPage.adjustFontSize('increase', increaseOrDecreaseAmount);
    const increasedFontSizes = await textsPage.getFontSizes();
    await textsPage.verifyFontSizeChange(initialFontSizes, increasedFontSizes, 'increase');
    
    // Reset font size to initial state
    await textsPage.adjustFontSize('decrease', increaseOrDecreaseAmount);

    // Decrease font size
    await textsPage.adjustFontSize('decrease', increaseOrDecreaseAmount);
    const decreasedFontSizes = await textsPage.getFontSizes();
    await textsPage.verifyFontSizeChange(increasedFontSizes, decreasedFontSizes, 'decrease');
  });

  test('Test Hebrew vocalization toggle: none, partial, full', async () => {
    // If Hebrew website toggle to bilingual mode to ensure both texts are visible
    if (SELECTED_LANGUAGE === LANGUAGES.HE) {
      await textsPage.toggleLanguage('Bilingual');
    }

    // Toggle to no vocalization
    await textsPage.toggleHebrewVocalization('none');
    await textsPage.compareHebrewText(EXPECTED_TEXTS_JOB_1_1_without_VOWEL_without_CANTELATION);

    // Toggle to just vowels, but no cantelation
    await textsPage.toggleHebrewVocalization('vowels');
    await textsPage.compareHebrewText(EXPECTED_TEXTS_JOB_1_1_with_VOWEL_without_CANTELATION);

    // Toggle to full vocalization (vowels and cantelation)
    await textsPage.toggleHebrewVocalization('all');
    await textsPage.compareHebrewText(EXPECTED_TEXTS_JOB_1_1_with_VOWEL_with_CANTELATION.he);

  });
  
  // (TODO)
  
  test('Verifies left/right/stacked bilingual layouts', async () => {
     // If Hebrew website toggle to bilingual mode to ensure both texts are visible
    if (SELECTED_LANGUAGE === LANGUAGES.HE) {
      await textsPage.toggleLanguage('Bilingual');
    }

    // Verify left layout
    await textsPage.setBilingualLayout('heLeft');
    await textsPage.verifyBilingualLayout('heLeft');

    // Verify right layout
    await textsPage.setBilingualLayout('heRight');
    await textsPage.verifyBilingualLayout('heRight');

    // Verify stacked layout
    await textsPage.setBilingualLayout('stacked');
    await textsPage.verifyBilingualLayout('stacked');

  });
});