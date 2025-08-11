import { test, expect } from "@playwright/test";
import { SourceTextPage } from "../pages/sourceTextPage";
import { LANGUAGES, testUser } from "../globals";
import { goToPageWithLang , hideAllModalsAndPopups, goToPageWithUser} from "../utils";
import { LoginPage } from "../pages/loginPage";
import { SheetEditorPage } from "../pages/sheetEditorPage";
import { SaveStates } from "../constants";


test.describe("Pages Load", () => {

  test('TC001 Pages Load, User Not Logged In', async ({ context }) => {      
      // 1. Load TOC and navigate to Midrash > Ein Yaakov
      const page = await goToPageWithLang(context, '/texts', LANGUAGES.EN);      
      await page.getByRole('link', { name: 'Midrash' }).click();
      await page.getByRole('link', { name: 'Ein Yaakov', exact: true }).click();
      await expect(page).toHaveURL(/Ein_Yaakov/);
      // 2. Load "Tosefta Peah 2"
      await page.goto('/Tosefta_Peah.2');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.readerControlsTitle')).toContainText(/תוספתא פאה|Tosefta Peah/);
      // 3. Load "Sifra, Tzav, Chapter 1"
      await page.goto('/Sifra%2C_Tzav%2C_Chapter_1?');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.titleBox')).toContainText(/Tzav|צַו/);
      // 4. Load Topics page
      await page.goto('/topics');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveTitle(/Topics/);
      //5. Search for "Passover"
      await page.goto('/search?q=passover')
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1.englishQuery')).toContainText(/passover/);
      // 6. Load Gardens page ("/garden/jerusalem")
      await page.goto('/garden/jerusalem');
      await page.waitForSelector('#filter-1 g.row'); // Wait for SVG rows to load
      await page.waitForSelector('.dc-grid-item .result-text .en', { state: 'visible' });
      await expect(page).toHaveURL(/garden\/jerusalem/);
      // 7. Load People index and a specific person page
      await page.goto('/people');
      await page.waitForSelector('.gridBoxItem');
      await page.goto('/person/Meir%20Abulafia');
      await page.waitForSelector('.topicDescription');
      await expect(page.locator('.topicDescription')).toBeVisible();
    });

    test('TC002 Pages Load, User Logged In', async ({ context }) => {
      // Navigate to /Job.3.4 with the resource panel open (with=all opens the resource panel)
      const page = await goToPageWithLang(context, '/Job.3.4?with=all');
      await page.locator('div.categoryFilter[data-name="Commentary"]').click();
      await page.getByText(/^(Rashi|רש"י)$/).click(); 
      await expect(page).toHaveURL(/with=Rashi/);
      await expect(page.locator('div.recentFilterSet a[href*="with=Rashi"] div.textFilter.on')).toBeVisible();      
    });
});

  test('TC009: Sidebar buttons load correctly', async ({ context }) => {
    const page = await goToPageWithLang(context, '/Ecclesiastes.1', LANGUAGES.EN);
    const segment = page.locator('p.segmentText').first();
    await segment.click();
    const connectionsPanel = page.locator('.readerPanelBox.sidebar');
    const backToResources = page.locator('a.connectionsHeaderTitle', { hasText:/Resources|קישורים וכלים/ });
    await expect(connectionsPanel).toBeVisible();
    const commentaryTab = page.locator('.categoryFilter[data-name="Commentary"]');
    if (await commentaryTab.isVisible()) {
      await commentaryTab.click();
      await expect(page.locator('.categoryFilterGroup.withBooks').first()).toBeVisible();
    }
    const sheetsTab = page.locator('a.toolsButton.sheets');
    if (await sheetsTab.isVisible()) {
      await sheetsTab.click();
      await expect(page.locator('.sheetList')).toBeVisible();
      await backToResources.click();
    }
    // Test About this text tab
    const aboutTab = page.locator('a.toolsButton.aboutThisText');
    if (await aboutTab.isVisible()) {
      await aboutTab.click();
      await expect(page.locator('h2.aboutHeader')).toBeVisible();
      await backToResources.click();
    }
    // Login for Notes tab test
    if (!await page.getByRole('link', { name: /see my saved texts|צפה בטקסטים שמורים/i }).isVisible()) {
      const loginPage = new LoginPage(page, LANGUAGES.EN);
      await page.goto('/login');
      await loginPage.loginAs(testUser);
      await page.goto('/Ecclesiastes.1');
      await segment.click();
    }
    const notesTab = page.locator('.connectionsHeaderTitle', { hasText: /Notes|הערות/ });
    if (await notesTab.isVisible()) {
      await notesTab.click();
      await expect(page.locator('.notesBox, .emptyMessage')).toBeVisible();
    }
  });

  test('TC010: Interface language toggle', async ({ context }) => {
    const page = await goToPageWithLang(context, '/texts', LANGUAGES.EN);
    // Verify initial English interface, switch to Hebrew
    await expect(page.getByRole('banner').getByRole('link', { name: 'Texts' })).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/interface-english/);
    await page.locator('.interfaceLinks-button').click();
    await page.getByRole('banner').getByRole('link', { name: /עברית/i }).click();
    // Verify Hebrew interface, switch back to English
    await expect(page.getByRole('banner').getByRole('link', { name: 'מקורות' })).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/interface-hebrew/);
    await page.locator('.interfaceLinks-button').click();
    await page.getByRole('banner').getByRole('link', { name: /English/i }).click();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Texts' })).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/interface-english/);
  });

  test('TC011: Reading history panel functionality', async ({ context }) => {
    const page = await goToPageWithUser(context, '/texts', LANGUAGES.EN);
    // Search for "Tosefta Peah 3"
    const searchInput = page.getByPlaceholder(/Search|חיפוש/);
    await searchInput.click();
    await searchInput.fill('Tosefta Peah');
    await page.keyboard.press('Enter');
    await page.locator('a.sectionLink[data-ref="Tosefta Peah 3"]').click();
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    await page.waitForURL(/Tosefta_Peah/);
    // Navigate to Tosefta Berakhot 4
    await page.goto('/Tosefta_Berakhot.4');
    await page.waitForLoadState('networkidle');
    // Return to TOC and check history panel; click on Tosefta Peah 3 from history
    await page.goto('/texts/history');
    await page.waitForLoadState('networkidle');
    const peahHistoryItem = page.locator('.savedHistoryList .storyTitle a', { hasText: /Tosefta Peah 3/ }).first();
    const berakhotHistoryItem = page.locator('.savedHistoryList .storyTitle a', { hasText: /Tosefta Berakhot/ }).first();
    await expect(peahHistoryItem).toBeVisible();
    await expect(berakhotHistoryItem).toBeVisible();
    await peahHistoryItem.click();
    await expect(page).toHaveURL(/Tosefta_Peah/);
    await expect(page.locator('.readerControlsTitle')).toContainText(/תוספתא פאה|Tosefta Peah/);
  });

test.describe("Reader - Commentary Filters", () => {

    test('TC012 Load Ibn Ezra for Job 3.4', async ({ context }) => {      
        // Navigate to /Job.3
        const page = await goToPageWithLang(context, '/Job.3');      
        const job34Text = "הַיּ֥וֹם הַה֗וּא יְֽהִ֫י־חֹ֥שֶׁךְ אַֽל־יִדְרְשֵׁ֣הוּ אֱל֣וֹהַּ מִמַּ֑עַל וְאַל־תּוֹפַ֖ע עָלָ֣יו נְהָרָֽה׃";
        await page.getByText(job34Text).click();
        await page.locator('div.categoryFilter[data-name="Commentary"]').click();
        await page.getByText(/^(Ibn Ezra|אבן עזרא)$/).click(); 
        await expect(page).toHaveURL(/Job[.\s]3[.\s]4.*with=Ibn(?:%20| )Ezra/);
        await expect(page.locator('div.recentFilterSet a[href*="with=Ibn Ezra"] div.textFilter.on')).toBeVisible();
      });

      test('TC013 Load Rashi for Job 3.4 with=all', async ({ context }) => {
        // Navigate to /Job.3.4 with the resource panel open (with=all opens the resource panel)
        const page = await goToPageWithLang(context, '/Job.3.4?with=all');
        await page.locator('div.categoryFilter[data-name="Commentary"]').click();
        await page.getByText(/^(Rashi|רש"י)$/).click();       
        await expect(page).toHaveURL(/with=Rashi/);
        await expect(page.locator('div.recentFilterSet a[href*="with=Rashi"] div.textFilter.on')).toBeVisible();      
      });
});

test.describe("Navigating To/Loading Book Pages", () => {

  test('TC014 Navigate to different books through categories and titles', async ({ context }) => {
    const page = await goToPageWithLang(context, '/texts');      
    await page.locator('.interfaceLinks-button').click();
    await page.getByRole('banner').getByRole('link', { name: 'English' }).click();
    //Test Bereshit
    await page.getByRole('link', { name: 'Tanakh' }).click();
    await page.getByRole('link', { name: 'Genesis', exact: true }).click();
    await page.locator('.sectionLink').first().click();
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);
    await page.locator('header').getByRole('link', { name: 'Close' })
    const genesisHebrew = page.getByText('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃');
    const genesisEnglish = page.getByText('When God');
    await (await genesisHebrew.isVisible() ? genesisHebrew : genesisEnglish).click();
   //Test Mishneh Torah
    await page.getByRole('link', { name: 'Texts' }).click();
    await page.getByRole('link', { name: 'Halakhah' }).click();
    await page.getByRole('link', { name: 'Mishneh Torah' }).click();
    await page.getByRole('link', { name: 'Repentance' }).click();
    await page.getByRole('link', { name: '1', exact: true }).click();
    const rambamHebrew = page.getByText('כָּל מִצְוֹת שֶׁבַּתּוֹרָה בֵּין עֲשֵׂה');
    const rambamEnglish = page.getByText('If a person transgresses');
    await (await rambamHebrew.isVisible() ? rambamHebrew : rambamEnglish).click();
    //Test Kedushat Levi
    await page.getByRole('link', { name: 'Texts' }).click();
    await page.getByRole('link', { name: 'Chasidut' }).click();
    await page.getByRole('link', { name: 'Kedushat Levi' }).click();
    await page.getByRole('link', { name: 'Bereshit' }).click();
    await page.getByText('Genesis, Bereshit', { exact: true }).click();
    const kedushatLeviHebrew = page.getByText('הכלל שהבורא ברוך הוא ברא הכל');
    const kedushatLeviEnglish = page.getByText('The first thing Gd embarked on');
    await (await kedushatLeviHebrew.isVisible() ? kedushatLeviHebrew : kedushatLeviEnglish).click();
  });

  test('TC015 Navigate to different books through titles', async ({ context }) => {
    const page = await goToPageWithLang(context, '/Genesis.1.1?lang=he&with=all&lang2=he'); 
    //Test Bereshit
    await expect(page.getByText(/When God began to create|בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃/)).toBeVisible({ timeout: 5000 });
   //Test Mishneh Torah
    await page.goto('/Mishneh_Torah%2C_Repentance.1.1?');
    await expect(page.getByText(/כָּל מִצְוֹת שֶׁבַּתּוֹרָה בֵּין עֲשֵׂה|If a person transgresses/)).toBeVisible({ timeout: 5000 });
    await page.goto('/Kedushat_Levi%2C_Genesis%2C_Bereshit?');
    await expect(page.getByText(/הכלל שהבורא ברוך הוא ברא הכל|The first thing Gd embarked on/)).toBeVisible({ timeout: 5000 });
  });

});

test.describe('Navigating to/loading spanning references and opening connections', () => {
  test('TC016: Load spanning reference and open connections', async ({ context }) => {
    const page = goToPageWithLang(context, '/Shabbat.2a-2b');
    // Click the segment
    const englishText = (await page).getByText('MISHNA: The acts of carrying out from a public domain', { exact: false });
    const hebrewText = (await page).getByText('מַתְנִי׳ יְצִיאוֹת הַשַּׁבָּת, שְׁתַּיִם שֶׁהֵן אַרְבַּע בִּפְנִים', { exact: false });
    if (await hebrewText.isVisible({timeout: 1000})) {
      await hebrewText.click();
    } else {
      await englishText.click();
    }
    const connectionsPanel = (await page).locator('.readerPanelBox.sidebar');
    await expect(connectionsPanel).toBeVisible();
    await expect(connectionsPanel).toContainText(/הקדמה למסכת שבת|Introduction to Shabbat/);
  });

  test('TC017: Search for spanning ref and open connections', async ({ context }) => {
    const page = goToPageWithLang(context, '/texts');
    const searchInput = (await page).getByPlaceholder(/Search|חיפוש/);
    await searchInput.click();
    await searchInput.fill('Shabbat 2a-2b');
    await (await page).keyboard.press('Enter');
    await (await page).waitForLoadState('domcontentloaded', { timeout: 10000 });
    const selectedText = (await page).getByText(/MISHNA: The acts of carrying out from a public domain into a private domain|מַתְנִי׳ יְצִיאוֹת הַשַּׁבָּת, שְׁתַּיִם שֶׁהֵן אַרְבַּע בִּפְנִים, וּשְׁתַּיִם/).first()
    await expect(selectedText).toBeVisible({ timeout: 10000 });
    await selectedText.click();
    const connectionsPanel = (await page).locator('.readerPanelBox.sidebar');
    await expect(connectionsPanel).toBeVisible();
    await expect(connectionsPanel).toContainText(/הקדמה למסכת שבת|Introduction to Shabbat/);
  });

  test('TC018: Filters persist across ranged references', async ({ context }) => {
    const page = await goToPageWithLang(context, '/Shabbat.2a');      
    const englishText1 = (await page).getByText('MISHNA: The acts of carrying out from a public domain', { exact: false });
    const hebrewText1 = (await page).getByText('מַתְנִי׳ יְצִיאוֹת הַשַּׁבָּת, שְׁתַּיִם שֶׁהֵן אַרְבַּע בִּפְנִים', { exact: false });
    if (await hebrewText1.isVisible({timeout: 1000})) {
      await hebrewText1.click();
    } else {
      await englishText1.click();
    }
    await hideAllModalsAndPopups(page)
    const connectionsPanel = (await page).locator('.readerPanelBox.sidebar');
    await expect(connectionsPanel).toBeVisible();
    let mishnahFilter = page.locator('.filterText', { hasText: /משנה|Mishnah/ }).first();
    if (!(await mishnahFilter.isVisible())) {
        const moreButton = page.locator('a.toolsButton.more', { hasText: /More|עוד/ });
        if (await moreButton.isVisible()) {
        await moreButton.click();
        let mishnahFilter = page.locator('.filterText', { hasText: /משנה|Mishnah/ }).first();
        await expect(mishnahFilter).toBeVisible();
      }
    }
    //Click the Mishnah filter
    await mishnahFilter.click();
    const mishnahShabbatFilter = page.getByRole('link', { name: /משנה שבת|Mishnah Shabbat/ });
    await mishnahShabbatFilter.click();
    await expect(page.locator('.title .titleBox .contentSpan').last()).toContainText(/משנה שבת|Mishnah Shabbat/);    
    const hebrewSegment2 = page.locator('div.segment[data-ref="Shabbat 2a:2"] >> p.segmentText >> span.contentSpan.he.primary');
    const englishSegment2 = page.locator('div.segment[data-ref="Shabbat 2a:2"] >> span.contentSpan.en.translation');
    if (await hebrewSegment2.isVisible()) {
      await hebrewSegment2.click();
    } else {
      await englishSegment2.click();
    }
    await expect(page.locator('.title .titleBox .contentSpan').last()).toContainText(/משנה שבת|Mishnah Shabbat/);    
  });
  
});

  test('TC019- Clicks on a versioned search result on desktop and navigates correctly', async ({ context }) => {
    const page = await goToPageWithLang(context, '/texts');      
    const searchInput = page.locator('input[placeholder="Search"], input[placeholder="חיפוש"]');
    await searchInput.fill('they howl like dogs');
    await searchInput.press('Enter');
    const versionedResult = page.locator( '.result.textResult:has(.version):has(.result-title span)').first();
    await versionedResult.click();
    await expect(versionedResult).toBeVisible({ timeout: 3000 });
    await versionedResult.locator('a').click();
    await expect(page).toHaveURL(/Psalms\.59\.7.*The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein.*lang=(en|he|bi)/);    
  });

  test('TC021: Collections pages load and user collection creation', async ({ context }) => {
    // 1. Load '/collections'
    const page = await goToPageWithLang(context, '/collections', LANGUAGES.EN);
    await expect(page).toHaveURL(/\/collections/);
    await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible();
    // 2. Load '/collections/bimbam'
    await page.goto('/collections/bimbam');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/collections\/bimbam/);
    await expect(page.locator('div').filter({ hasText: /^BimBam$/ }).first()).toBeVisible();
    // 3. Login user and load '/collections/new'
    if (!await page.getByRole('link', { name: /see my saved texts|צפה בטקסטים שמורים/i }).isVisible()) {
      const loginPage = new LoginPage(page, LANGUAGES.EN);
      await page.goto('/login');
      await loginPage.loginAs(testUser);
    }
    await page.goto('/collections/new');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/collections\/new/);
    await expect(page.getByRole('heading', { name:'Create a Collection' })).toBeVisible();
  });

  test('TC022: Browser back and forward navigation', async ({ context }) => {
    const page = await goToPageWithLang(context, '/texts', LANGUAGES.EN);
    await page.goto('/Amos.3');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/Amos\.3/);
    await hideAllModalsAndPopups(page);
    const amosSegment = page.locator('[data-ref="Amos 3:1"]').first();
    await amosSegment.click();
    const connectionsPanel = page.locator('.readerPanelBox.sidebar');
    await expect(connectionsPanel).toBeVisible();
    await expect(page).toHaveURL(/\/Amos\.3\.1/);
    await hideAllModalsAndPopups(page);
    const commentaryFilter = page.locator('.categoryFilter[data-name="Commentary"]');
    if (await commentaryFilter.isVisible()) {
      await commentaryFilter.click();
      await expect(page).toHaveURL(/with=Commentary/);
    }
    //Use back button
    await page.goBack();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/Amos\.3\.1(?!.*with=Commentary)/);
    await page.goBack();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/Amos\.3(?!\.1)/);
    // Use forward button
    await page.goForward();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/Amos\.3\.1/);
    // Use forward button again
    await page.goForward();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/with=Commentary/);
  });

  test('TC023: Creates and saves a new source sheet', async ({ context }) => {
    const page = await goToPageWithUser(context, '/texts', LANGUAGES.EN);
    const sheetEditorPage = new SheetEditorPage(page, LANGUAGES.EN);
    await page.locator('.myProfileBox .profile-pic').click();
    await page.locator('#new-sheet-link').click();
    await page.waitForURL(/\/sheets\/\d+/);
    await expect(sheetEditorPage.sourceSheetBody()).toBeVisible();
    await hideAllModalsAndPopups(page);
    await sheetEditorPage.clickAddSource();
    await page.getByRole('textbox', { name: 'Search for a Text or' }).fill('Genesis 1:9');
    await page.getByRole('button', { name: 'Add Source' }).click();
    await expect(sheetEditorPage.addedSource()).toBeVisible();
    await expect(sheetEditorPage.addedSource()).toContainText(/God said|אֱלֹהִים/);
    await sheetEditorPage.assertSaveState(SaveStates.saved);
    // Verify sheet persistence
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/sheets\/\d+/);
    await page.goto('/texts');
    await page.goto(currentUrl);
    await expect(sheetEditorPage.addedSource()).toBeVisible();
    await expect(sheetEditorPage.addedSource()).toContainText(/God said|אֱלֹהִים/);
  });

  test('TC024a: Search navigation behavior - English', async ({ context }) => {
    const page = await goToPageWithLang(context, '/texts', LANGUAGES.EN);
    const searchInput = page.getByPlaceholder(/Search|חיפוש/);
    // 1. Type 'Shabbat' and wait for TOC
    await searchInput.click();
    await searchInput.fill('Shabbat');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/Shabbat\?tab=contents/);
    await expect(page.locator('.readerNavCategoryMenu, .tocLevel')).toBeVisible();
    // 2. Type 'Shabbat 12b' and wait for segment
    await page.goto('/texts');
    await searchInput.click();
    await searchInput.fill('Shabbat 12b');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/Shabbat\.12b/);
    await expect(page.locator('div.segment[data-ref="Shabbat 12b:1"]')).toBeVisible();
    // 3. Type '#Yosef Giqatillah' and wait for title
    await page.goto('/texts');
    await searchInput.click();
    await searchInput.fill('#Yosef Giqatillah');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.navTitle h1')).toContainText(/Joseph/);
    // 4. Type 'Midrash' and wait for category menu
    await page.goto('/texts');
    await searchInput.click();
    await searchInput.fill('Midrash');
    const midrashMenuItem =   page.locator('a[href="/texts/Midrash"]');
    await midrashMenuItem.waitFor({ state: 'visible' });
    await midrashMenuItem.click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/texts\/Midrash/);
    await expect(page.locator('.readerNavCategoryMenu')).toBeVisible();
  });

  test('TC024b: Search navigation behavior - Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/texts', LANGUAGES.HE);
    const searchInput = page.getByPlaceholder(/Search|חיפוש/);
    // 1. Type 'שבת' and wait for TOC
    await searchInput.click();
    await searchInput.fill('שבת');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/Shabbat\?tab=contents/);
    await expect(page.locator('.readerNavCategoryMenu, .tocLevel')).toBeVisible();
    // 2. Type 'שבת יב ב' and wait for segment
    await page.goto('/texts');
    await searchInput.click();
    await searchInput.fill('שבת יב ב');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/Shabbat\.12b/);
    await expect(page.locator('div.segment[data-ref="Shabbat 12b:1"]')).toBeVisible();
    // 3. Type '#יוסף גיקטילא' and wait for title
    await page.goto('/texts');
    await searchInput.click();
    await searchInput.fill("#יוסף בן אברהם אבן ג'קטילה");
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.navTitle h1')).toContainText(/יוסף/);
    // 4. Type 'מדרש' and wait for category menu
    await page.goto('/texts');
    await searchInput.click();
    await searchInput.fill('מדרש');
    const midrashMenuItem = page.locator('a[href="/texts/Midrash"]');
    await midrashMenuItem.waitFor({ state: 'visible' });
    await midrashMenuItem.click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/texts\/Midrash/);
    await expect(page.locator('.readerNavCategoryMenu')).toBeVisible();
  });

  /**
   * NOTE: These tests are currently commented out due to issues with infinite scroll behavior.
   * They will need to be re-evaluated or fixed in the future.
   */
  // test('TC027: InfiniteScrollUp - Tests infinite scroll up behavior and URL stability', async ({ context }) => {
  //   const page = await goToPageWithLang(context, '/texts', LANGUAGES.EN);
  //   // Navigate to a text with multiple segments, scroll down to load more segments
  //   await page.goto('/Genesis.1');
  //   await page.waitForLoadState('networkidle');
  //   const initialUrl = page.url();
  //   await page.evaluate(() => {
  //     window.scrollTo(0, document.body.scrollHeight * 0.8);
  //   });    
  //   // Scroll back up to trigger infinite scroll up behavior
  //   await page.evaluate(() => {
  //     window.scrollTo(0, 0);
  //   });    
  //   const firstSegment = page.locator('[data-ref="Genesis 1:1"]');
  //   await expect(firstSegment).toBeVisible();
  //   await expect(page).toHaveURL(initialUrl);
  // });

  // test('TC028: InfiniteScrollDown - Tests infinite scroll down behavior and loading next segments', async ({ context }) => {
  //   const page = await goToPageWithLang(context, '/texts', LANGUAGES.EN);
  //   // Browse to start ref (single chapter, not spanning)
  //   await page.goto('/Genesis.1');
  //   await page.waitForLoadState('networkidle');
  //   // Ensure Genesis 2 is NOT initially loaded
  //   const genesis2Segment = page.locator('[data-ref="Genesis 2:1"]');
  //   const initialGenesis2Visible = await genesis2Segment.isVisible();
  //   expect(initialGenesis2Visible).toBe(false); // Confirm it starts without Genesis 2
  //   // Scroll to bottom and wait for next segment to load
  //   const initialSegmentCount = await page.locator('.segment').count();
  //   let genesis2LoadedByScroll = false;
  //   let segmentCountIncreased = false;
  //   for (let i = 0; i < 10; i++) {
  //     // Scroll down
  //     await page.mouse.wheel(0, 1000);
  //     await page.waitForTimeout(1500);
  //     // Check if scrolling triggered loading of new content
  //     const currentGenesis2Visible = await genesis2Segment.isVisible();
  //     const currentSegmentCount = await page.locator('.segment').count();
  //     if (currentGenesis2Visible || currentSegmentCount > initialSegmentCount) {
  //       genesis2LoadedByScroll = currentGenesis2Visible;
  //       segmentCountIncreased = currentSegmentCount > initialSegmentCount;
  //       break;
  //     }
  //   }
  //   if (genesis2LoadedByScroll) {
  //     await expect(genesis2Segment).toBeVisible();
  //   } else if (segmentCountIncreased) {
  //     const finalSegmentCount = await page.locator('.segment').count();
  //     expect(finalSegmentCount).toBeGreaterThan(initialSegmentCount);
  //   } else {
  //     throw new Error('Infinite scroll did not load additional content after scrolling to bottom');
  //   }
  // });

  // test('TC032: BackRestoresScrollPosition - Tests browser back button restores scroll position', async ({ context }) => {
  //   const page = await goToPageWithLang(context, '/texts', LANGUAGES.EN);
  //   await page.waitForLoadState('networkidle');
  //   await page.click('body');
  //   const scrollResult = await page.evaluate(() => {
  //     const scrollTargets = [
  //       document.documentElement,
  //       document.body,
  //       document.querySelector('main'),
  //       document.querySelector('.content'),
  //       window
  //     ];
  //     let scrolled = false;
  //     const maxHeight = Math.max(
  //       document.body.scrollHeight,
  //       document.documentElement.scrollHeight
  //     );
  //     for (const target of scrollTargets) {
  //       try {
  //         if (target === window) {
  //           window.scrollTo(0, maxHeight);
  //         } else if (target && target.scrollTo) {
  //           target.scrollTo(0, maxHeight);
  //         } else if (target) {
  //           if (target instanceof Element) {
  //             target.scrollTop = maxHeight;
  //           }
  //         }
  //         // Check if any scroll method worked
  //         const currentScroll = Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);
  //         if (currentScroll > 50) {
  //           scrolled = true;
  //           break;
  //         }
  //       } catch (e) {
  //         console.log('Scroll method failed:', e.message);
  //       }
  //     }
  //     return {
  //       scrolled,
  //       finalPosition: Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop),
  //       maxHeight,
  //       bodyHeight: document.body.scrollHeight,
  //       docHeight: document.documentElement.scrollHeight
  //     };
  //   });
  //   console.log('Scroll result:', scrollResult);
  //   if (!scrollResult.scrolled) {
  //     test.skip(true, `Unable to scroll page. Heights: body=${scrollResult.bodyHeight}, doc=${scrollResult.docHeight}`);
  //   }
  //   const bottomScrollPosition = scrollResult.finalPosition;
  //   expect(bottomScrollPosition).toBeGreaterThan(0);
  //   //Click on "Explore" in the header to navigate to topics page
  //   const exploreLink = page.locator('a[href="/topics"].textLink', { hasText: /Explore/i });
  //   await exploreLink.click();
  //   await page.waitForLoadState('networkidle');
  //   await expect(page).toHaveURL(/\/topics/);
  //   //Go back using browser back button
  //   await page.goBack();
  //   await page.waitForLoadState('networkidle');    
  //   await expect(page).toHaveURL(/\/texts/);
  //   const restoredScrollPosition = await page.evaluate(() => window.scrollY);
  //   // Allow some tolerance but should be close to the bottom position
  //   expect(restoredScrollPosition).toBeGreaterThanOrEqual(bottomScrollPosition - 50);
  //   expect(restoredScrollPosition).toBeLessThanOrEqual(bottomScrollPosition + 50);
  // });