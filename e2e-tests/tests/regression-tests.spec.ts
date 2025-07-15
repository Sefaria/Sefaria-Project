import { test, expect } from "@playwright/test";
import { SourceTextPage } from "../pages/sourceTextPage";
import { LANGUAGES } from "../globals";
import { goToPageWithLang , hideAllModalsAndPopups} from "../utils";


test.describe("Pages Load", () => {

  test('TC001 Pages Load, User Not Logged In', async ({ context }) => {      
      // 1. Load TOC and navigate to Midrash > Ein Yaakov
      const page = await goToPageWithLang(context, '/texts');      
      await page.getByRole('link', { name: 'Midrash' }).click();
      await page.goto('https://www.sefaria.org/texts/Midrash');
      await page.getByRole('link', { name: 'Ein Yaakov', exact: true }).click();
      await page.goto('https://www.sefaria.org/Ein_Yaakov?tab=contents');
      await expect(page).toHaveURL(/Ein_Yaakov/);
      // 2. Load "Tosefta Peah 2"
      await page.goto('/Tosefta_Peah.2');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.readerControlsTitle .contentSpan')).toContainText(/תוספתא פאה|Tosefta Peah/);
      // 3. Load "Sifra, Tzav, Chapter 1"
      await page.goto('/Sifra%2C_Tzav%2C_Chapter_1?');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.section')).toContainText(/צַו/);
      // 4. Load Topics page
      await page.goto('/topics');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveTitle(/Topics/);
      //5. Search for "Passover"
      await page.goto('/search?q=passover')
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.searchResult')).toContainText(/Passover|פסח/);
      // 6. Load Gardens page ("/garden/jerusalem")
      await page.goto('/garden/jerusalem');
      await page.waitForSelector('#filter-1 g.row'); // Wait for SVG rows to load
      await page.waitForSelector('.dc-grid-item .result-text .en', { state: 'visible' });
      await expect(page).toHaveURL(/garden\/jerusalem/);
      // 7. Load People index and a specific person page
      await page.goto('/people');
      await page.waitForSelector('.gridBoxItem'); // Wait for grid items to show
      await page.goto('/person/Meir%20Abulafia');
      await page.waitForSelector('.topicDescription'); // Wait for description
      await expect(page.locator('.topicDescription')).toBeVisible();
    });

    test('TC002 Pages Load, User Logged In', async ({ context }) => {
      // Navigate to /Job.3.4 with the resource panel open (with=all opens the resource panel)
      const page = await goToPageWithLang(context, '/Job.3.4?with=all');
    
      // Click Commentary category filter by role or text
      await page.locator('div.categoryFilter[data-name="Commentary"]').click();
    
      // Select Rashi filter under Commentary
      await page.getByText(/^(Rashi|רש"י)$/).click();       // await page.waitForSelector('text=Loading...', { state: 'detached' });
    
      //Assert URL and UI change indicating correct commentary loaded
      await expect(page).toHaveURL(/with=Rashi/);
      await expect(page.locator('div.recentFilterSet a[href*="with=Rashi"] div.textFilter.on')).toBeVisible();      
    });
});

   

test.describe("Reader - Commentary Filters", () => {

    test('TC012 Load Ibn Ezra for Job 3.4', async ({ context }) => {      
        // Navigate to /Job.3
        const page = await goToPageWithLang(context, '/Job.3');      
      
        // Click the Hebrew text of segment Job 3:4
        const job34Text = "הַיּ֥וֹם הַה֗וּא יְֽהִ֫י־חֹ֥שֶׁךְ אַֽל־יִדְרְשֵׁ֣הוּ אֱל֣וֹהַּ מִמַּ֑עַל וְאַל־תּוֹפַ֖ע עָלָ֣יו נְהָרָֽה׃";
        await page.getByText(job34Text).click();
      
        // Click Commentary category filter by role or text
        await page.locator('div.categoryFilter[data-name="Commentary"]').click();
      
        // Select Ibn Ezra filter under Commentary
        await page.getByText(/^(Ibn Ezra|אבן עזרא)$/).click();       // await page.waitForSelector('text=Loading...', { state: 'detached' });
      
        // Assert URL and UI change indicating correct commentary loaded
        await expect(page).toHaveURL(/Job[.\s]3[.\s]4.*with=Ibn(?:%20| )Ezra/);
        await expect(page.locator('div.recentFilterSet a[href*="with=Ibn Ezra"] div.textFilter.on')).toBeVisible();
        //await page.getByText('Ibn Ezra').isVisible();
      });

      test('TC013 Load Rashi for Job 3.4 with=all', async ({ context }) => {
        // Navigate to /Job.3.4 with the resource panel open (with=all opens the resource panel)
        const page = await goToPageWithLang(context, '/Job.3.4?with=all');
      
        // Click Commentary category filter by role or text
        await page.locator('div.categoryFilter[data-name="Commentary"]').click();
      
        // Select Rashi filter under Commentary
        await page.getByText(/^(Rashi|רש"י)$/).click();       // await page.waitForSelector('text=Loading...', { state: 'detached' });
      
        //Assert URL and UI change indicating correct commentary loaded
        await expect(page).toHaveURL(/with=Rashi/);
        await expect(page.locator('div.recentFilterSet a[href*="with=Rashi"] div.textFilter.on')).toBeVisible();      
      });
});

test.describe("Navigating To/Loading Book Pages", () => {

  test('TC014 Navigate to different books through categories and titles', async ({ context }) => {
    const page = await goToPageWithLang(context, '/texts');      
   // await page.goto('https://www.sefaria.org.il/texts');
    await page.locator('.interfaceLinks-button').click();
    await page.getByRole('banner').getByRole('link', { name: 'English' }).click();
    //Test Bereshit
    await page.getByRole('link', { name: 'Tanakh' }).click();
    await page.getByRole('link', { name: 'Genesis', exact: true }).click();
    await page.locator('.sectionLink').first().click();
    await page.getByRole('button', { name: '×' }).click();
    const genesisHebrew = page.getByText('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃');
    const genesisEnglish = page.getByText('When God');
    await (await genesisHebrew.isVisible() ? genesisHebrew : genesisEnglish).click();
    //await page.getByText('Bereshit').click();
    //await page.getByText('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃' || 'When God').click();
    //await page.getByText(/בְּרֵאשִׁ֖ית*|When God/).click();
   //Test Mishneh Torah
    await page.getByRole('link', { name: 'Texts' }).click();
    await page.getByRole('link', { name: 'Halakhah' }).click();
    await page.getByRole('link', { name: 'Mishneh Torah' }).click();
    await page.getByRole('link', { name: 'Repentance' }).click();
    await page.getByRole('link', { name: '1', exact: true }).click();
    //await page.getByText(/כָּל מִצְוֹת שֶׁבַּתּוֹרָה בֵּין עֲשֵׂה|If a person transgresses/ ).click();
    const rambamHebrew = page.getByText('כָּל מִצְוֹת שֶׁבַּתּוֹרָה בֵּין עֲשֵׂה');
    const rambamEnglish = page.getByText('If a person transgresses');
    await (await rambamHebrew.isVisible() ? rambamHebrew : rambamEnglish).click();
   // await page.getByText('כָּל מִצְוֹת שֶׁבַּתּוֹרָה בֵּין עֲשֵׂה').click();
    //await page.getByText('If a person transgresses').click();
    await page.getByRole('link', { name: 'Texts' }).click();
    await page.getByRole('link', { name: 'Chasidut' }).click();
    await page.getByRole('link', { name: 'Kedushat Levi' }).click();
    await page.getByRole('link', { name: 'Bereshit' }).click();
    await page.getByText('Genesis, Bereshit', { exact: true }).click();
    const kedushatLeviHebrew = page.getByText('הכלל שהבורא ברוך הוא ברא הכל');
    const kedushatLeviEnglish = page.getByText('The first thing Gd embarked on');
    await (await kedushatLeviHebrew.isVisible() ? kedushatLeviHebrew : kedushatLeviEnglish).click();
    //await page.getByText(/The first thing Gd embarked on|הכלל שהבורא ברוך הוא ברא הכל/).click();
  });

  test('TC015 Navigate to different books through titles', async ({ context }) => {
    const page = await goToPageWithLang(context, '/Genesis.1.1?lang=he&with=all&lang2=he'); 
    //await page.locator('.interfaceLinks-button').click();
    //await page.getByRole('banner').getByRole('link', { name: 'English' }).click();
    //Test Bereshit
    const genesisHebrew = page.getByText('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃');
    const genesisEnglish = page.getByText('When God');

    await Promise.any([
      genesisHebrew.waitFor({ state: 'visible', timeout: 5000 }),
      genesisEnglish.waitFor({ state: 'visible', timeout: 5000 }),
    ]);
    const isHebrewVisible = await genesisHebrew.isVisible();
    const textToClick = isHebrewVisible ? genesisHebrew : genesisEnglish;
    await textToClick.click();
   //Test Mishneh Torah
   await page.goto('https://www.sefaria.org./Mishneh_Torah%2C_Repentance.1.1?');
    const rambamHebrew = page.getByText('כָּל מִצְוֹת שֶׁבַּתּוֹרָה בֵּין עֲשֵׂה');
    const rambamEnglish = page.getByText('If a person transgresses');
    await Promise.any([
      rambamHebrew.waitFor({ state: 'visible', timeout: 5000 }),
      rambamEnglish.waitFor({ state: 'visible', timeout: 5000 }),
    ]);
    await (await rambamHebrew.isVisible() ? rambamHebrew : rambamEnglish).click();
   // await page.getByText('כָּל מִצְוֹת שֶׁבַּתּוֹרָה בֵּין עֲשֵׂה').click();
    //await page.getByText('If a person transgresses').click();
    await page.goto('https://www.sefaria.org./Kedushat_Levi%2C_Genesis%2C_Bereshit.1.1?');
    
    const kedushatLeviHebrew = page.getByText('הכלל שהבורא ברוך הוא ברא הכל');
    const kedushatLeviEnglish = page.getByText('The first thing Gd embarked on');
    await Promise.any([
      kedushatLeviHebrew.waitFor({ state: 'visible', timeout: 5000 }),
      kedushatLeviEnglish.waitFor({ state: 'visible', timeout: 5000 }),
    ]);
    await (await kedushatLeviHebrew.isVisible() ? kedushatLeviHebrew : kedushatLeviEnglish).click();
    //await page.getByText(/The first thing Gd embarked on|הכלל שהבורא ברוך הוא ברא הכל/).click();
  });


});

test.describe('Navigating to/loading spanning references and opening connections', () => {
  test('TC016: Load spanning reference and open connections', async ({ context }) => {
    //await page.goto('https://www.sefaria.org/Shabbat.2a-2b',{waitUntil: 'domcontentloaded'});
    const page = goToPageWithLang(context, '/Shabbat.2a-2b');
  
    // Click the segment
    const englishText = (await page).getByText('The acts of carrying out', { exact: false });
    const hebrewText = (await page).getByText('מַתְנִי׳ יְצִיאוֹת הַשַּׁבָּת, שְׁתַּיִם שֶׁהֵן אַרְבַּע בִּפְנִים', { exact: false });
    await (await page).waitForTimeout(1000); // fallback delay
    if (await hebrewText.isVisible()) {
      await hebrewText.click();
    } else {
      await englishText.click();
    }
  
    // Wait for the connections panel to open
    const connectionsPanel = (await page).locator('.readerPanelBox.sidebar');
    await expect(connectionsPanel).toBeVisible();
  
    // Confirm the panel relates to Shabbat 2a:1
    await expect(connectionsPanel).toContainText(/הקדמה למסכת שבת|Introduction to Shabbat/);
  });

  test('TC017: Search for spanning ref and open connections', async ({ context }) => {
    //await page.goto('https://www.sefaria.org/texts');
    const page = goToPageWithLang(context, '/texts');

    // Open search bar and type query
    const searchInput = (await page).getByPlaceholder(/Search|חיפוש/);
    await searchInput.click();
    await searchInput.fill('Shabbat 2a-2b');
    await (await page).keyboard.press('Enter');
  
    // Wait for search results to load and click the result
    const result = (await page).getByText('Shabbat 2a-2b', { exact: false });
    await result.waitFor({ state: 'visible' });
    await result.click();
  
    // Wait for the segment to be visible
    // Click the segment
    const englishText = (await page).getByText('The acts of carrying out', { exact: false });
    const hebrewText = (await page).getByText('מַתְנִי׳ יְצִיאוֹת הַשַּׁבָּת, שְׁתַּיִם שֶׁהֵן אַרְבַּע בִּפְנִים', { exact: false });
    await (await page).waitForTimeout(1000); // fallback delay
    if (await hebrewText.isVisible()) {
      await hebrewText.click();
    } else {
      await englishText.click();
    }
  
    // Wait for the connections panel to open
    const connectionsPanel = (await page).locator('.readerPanelBox.sidebar');
    await expect(connectionsPanel).toBeVisible();
  
    // Confirm the panel relates to Shabbat 2a:1
    await expect(connectionsPanel).toContainText(/הקדמה למסכת שבת|Introduction to Shabbat/);
  });

  test('TC018: Filters persist across ranged references', async ({ context }) => {
    const page = await goToPageWithLang(context, '/Shabbat.2a');      
    //click 2a:1
    const englishText1 = (await page).getByText('The acts of carrying out', { exact: false });
    const hebrewText1 = (await page).getByText('מַתְנִי׳ יְצִיאוֹת הַשַּׁבָּת, שְׁתַּיִם שֶׁהֵן אַרְבַּע בִּפְנִים', { exact: false });
    await (await page).waitForTimeout(1000); // fallback delay
    if (await hebrewText1.isVisible()) {
      await hebrewText1.click();
    } else {
      await englishText1.click();
    }
    await hideAllModalsAndPopups(page)
    
    // Wait for the connections panel to open
    const connectionsPanel = (await page).locator('.readerPanelBox.sidebar');
    await expect(connectionsPanel).toBeVisible();

    //locate the Mishnah filter (either Hebrew or English)
    let mishnahFilter = page.locator('.filterText', { hasText: /משנה|Mishnah/ }).first();
    if (!(await mishnahFilter.isVisible())) {
      //Click "More" to reveal additional filters
        const moreButton = page.locator('a.toolsButton.more', { hasText: /More|עוד/ });
        if (await moreButton.isVisible()) {
        await moreButton.click();
        //Re-fetch the Mishnah filter locator
        let mishnahFilter = page.locator('.filterText', { hasText: /משנה|Mishnah/ }).first();
        //wait a moment or wait for it to become visible
        await expect(mishnahFilter).toBeVisible();
      }
    }
    //Click the Mishnah filter
    await mishnahFilter.click();
    const mishnahShabbatFilter = page.getByRole('link', { name: /משנה שבת|Mishnah Shabbat/ });
    await mishnahShabbatFilter.click();
    
    //check that the title is visible
    const titleLocator = page.getByRole('heading', { level: 2, name: 'משנה שבת א׳:א׳' });
    await expect(titleLocator).toBeVisible();
    await hideAllModalsAndPopups(page);
    
    //click on 2a:2
    const hebrewSegment2 = page.locator('div.segment[data-ref="Shabbat 2a:2"] >> p.segmentText >> span.contentSpan.he.primary');
    const englishSegment2 = page.locator('div.segment[data-ref="Shabbat 2a:2"] >> span.contentSpan.en.translation');
    if (await hebrewSegment2.isVisible()) {
      await hebrewSegment2.click();
    } else {
      await englishSegment2.click();
    }
    //check that the Mishnah filter is still applied
  await expect(titleLocator).toBeVisible();
  });
  
});

test.describe('Click Versioned Search Result, Desktop and Mobile', () => {
  test('TC019- Clicks on a versioned search result on desktop and navigates correctly', async ({ context }) => {
    //Navigate to /texts (entry point for search)
    const page = await goToPageWithLang(context, '/texts');      

    //Type search query
    //const searchInput = page.locator('input.search[placeholder=Search"]');
    const searchInput = page.locator('input[placeholder]:is([placeholder="Search"], [placeholder="חיפוש"])');
    await searchInput.fill('they howl like dogs');
    await searchInput.press('Enter');

    //Wait for results and find versioned result link
    const versionedResult = page.locator( '.result.textResult:has(.version):has(.result-title span)').first();
    await versionedResult.click();
    
    // Assert it’s visible before clicking (optional safety check)
    await expect(versionedResult).toBeVisible({ timeout: 5000 });
    // Click the link inside the versioned result
    await versionedResult.locator('a').click();

    //Validate navigation to a versioned text URL
    await expect(page).toHaveURL(/Psalms\.59\.7\?ven=english\|The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein&lang=(en|he|bi)/);    
  });

  test('TC020- Clicks on a versioned search result on mobile and navigates correctly', async ({ context }) => {
      
  });
});