


const { chromium } = require('playwright');

describe('Main sefaria', () => {
  let page;
  let browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.goto('https://sefaria.org.il/Mishnah_Peah.6?lang=bi');
    
    // if interruptingMessageClose is visible, click it
    if(await page.$('#interruptingMessageClose') !== null) {
      await page.click('#interruptingMessageClose');
    }
  });

  afterEach(async () => {
    await page.close();
  });

  it('Open translations', async () => {
    // wait for the page to load
    await page.waitForSelector('.contentSpan.he');
    // click first element
    await page.click('.contentSpan.he');
    // click copy button
    await page.click('.categoryFilter');
    // go back with fa-chevron-right
    await page.click('.fa-chevron-right');
    // get third toolsButtonText
    await page.click(':nth-match(.toolsButtonText, 3)');
    // get first text
    await page.click('.segment');
    // execute manual javascript document.getElementsByClassName('selectButton')[1].click()
    await page.evaluate(() => {
      document.getElementsByClassName('selectButton')[1].click();
    });
  });

});
