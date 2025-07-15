import {DEFAULT_LANGUAGE, LANGUAGES, SOURCE_LANGUAGES, testUser} from './globals'
import {BrowserContext}  from '@playwright/test';
import type { Page } from '@playwright/test';
import { expect, Locator } from '@playwright/test';
import { LoginPage } from './pages/loginPage';
import path from 'path';

let currentLocation: string = ''; 

/**
 * Gets the path to a test fixture file
 * @param fixtureName - Name of the fixture file (e.g., 'test-image.jpg')
 * @returns Absolute path to the fixture file
 */
export const getFixturePath = (fixtureName: string): string => {
  return path.join(__dirname, 'fixtures', fixtureName);
};

/**
 * Gets the path to a test image for upload testing
 * @param imageName - Name of the image file (defaults to 'test-image.jpg')
 * @returns Absolute path to the test image
 */
export const getTestImagePath = (imageName: string = 'test-image.jpg'): string => {
  return getFixturePath(imageName);
};

/*METHODS TO HIDE MODALS/POPUPS THAT INTERRUPT THE USER EXPERIENCE */

/**Note, for all of these miding/dismiss methods, we currently use CSS to hide them
 * We may want to opt for a more robust solution in the future, or something user-realistic such as 
 * clicking an "x" or "okay" button,but this is a workaround for now.
 * 
 * They are all exports in the case that they will be used individually in tests outside this file, 
 * rather than only calling hideAllModalsAndPopups()
*/

// Dismisses the main modal interrupting message by injecting CSS to hide it.
export const hideModals = async (page: Page) => {
    await page.waitForLoadState('networkidle'); // Wait for all network requests to finish to ensure modals are present
    await page.evaluate(() => {
        const style = document.createElement('style');
        // Use !important to override any inline or external styles
        style.innerHTML = '#interruptingMessageBox {display: none !important;}';
        document.head.appendChild(style); // Inject style into the page
    });
}
//try clicking the close button, else hide the modal and overlay forcibly
export const hideExploreTopicsModal = async (page: Page) => {
  await page.evaluate(() => {
    // Try to click the close button if it exists
    const closeBtn = document.querySelector('.ub-emb-close');
    if (closeBtn) {
      (closeBtn as HTMLElement).click();
    } else {
      // Fallback: hide the modal and overlay forcibly
      const modal = document.querySelector('.ub-emb-iframe-wrapper');
      if (modal) {
        (modal as HTMLElement).style.display = 'none';
        (modal as HTMLElement).style.visibility = 'hidden';
        (modal as HTMLElement).style.pointerEvents = 'none';
      }
      // Also hide the iframe just in case
      const iframe = document.querySelector('.ub-emb-iframe');
      if (iframe) {
        (iframe as HTMLElement).style.display = 'none';
        (iframe as HTMLElement).style.visibility = 'hidden';
        (iframe as HTMLElement).style.pointerEvents = 'none';
      }
    }
  });
}

export const dismissNewsletterPopupIfPresent = async (page: Page) => {
  await page.evaluate(() => {
    const style = document.createElement('style');
    // Hide all known newsletter popup elements and overlays; !important ensures they are not shown
    style.innerHTML = `
      .ub-emb-scroll-wrapper,
      .ub-emb-iframe-wrapper,
      .ub-emb-iframe,
      iframe[src*="ubembed.com"],
      .ub-emb-close,
      div[class*="ub-emb"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important; // Prevents interaction with hidden elements
      }
    `;
    document.head.appendChild(style);
  });
};

//method to hide Welcome to New Editor banner
export const hideGenericBanner = async (page: Page) => {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .genericBanner {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  });
};

export const hideCookiesPopup = async (page: Page) => {
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.innerHTML = `
        .cookiesNotification {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(style);
    });
  };
  
export const hideTopBanner = async (page: Page) => {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .readerControlsOuter,
      header.readerControls.fullPanel.sheetReaderControls {
        display: none !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  });
};

/**
 * Hides all common popups, modals, and banners that might interfere with tests
 * This is called automatically by navigation functions but can also be called manually
 */
export const hideAllModalsAndPopups = async (page: Page) => {
  await hideModals(page);
  await dismissNewsletterPopupIfPresent(page);
  await hideGenericBanner(page);
  await hideCookiesPopup(page);
  await hideTopBanner(page);
  await hideExploreTopicsModal(page);
};

/**
 * Changes the interface language by clicking through the language menu.
 * Checks if the language is already correct before making changes.
 * 
 * @param page - The Playwright page object
 * @param language - Target language (LANGUAGES.EN or LANGUAGES.HE)
 */
export const changeLanguageIfNeeded = async (page: Page, language: string) => {
    await page.waitForLoadState('domcontentloaded'); 
    // Check if we're already in the correct language
    const expectedElement = language === LANGUAGES.HE ? 'מקורות' : 'Texts';
    const isAlreadyCorrectLanguage = await page.getByRole('banner').getByRole('link', { name: expectedElement, exact: true }).first().isVisible();
    
    if (isAlreadyCorrectLanguage) {
        return;
    }
    // Language change needed - click through the UI
    await page.locator('.interfaceLinks-button').click()
    if (language === LANGUAGES.EN) {
        await page.getByRole('banner').getByRole('link', { name: /English/i }).click();
        // Wait for the language change to complete by checking for English interface text
        await page.getByRole('banner').getByRole('link', { name: 'Texts', exact: true }).waitFor({ state: 'visible' });
    } else if (language === LANGUAGES.HE) {
        await page.getByRole('banner').getByRole('link', { name: /עברית/i }).click()
        // Wait for the language change to complete by checking for Hebrew interface text
        await page.getByRole('banner').getByRole('link', { name: 'מקורות', exact: true }).waitFor({ state: 'visible' });
    }
}

export const changeLanguageLoggedIn = async (page: Page, language: string) => {
    // Open the profile dropdown by clicking the profile icon
    const profileIcon = page.locator('.myProfileBox .profile-pic');
    await profileIcon.click();
  
    const menu = page.locator('.interfaceLinks-menu.profile-menu');
    await expect(menu).toBeVisible();
  
    // Select the correct language link
    const languageLink = language === LANGUAGES.HE
      ? page.locator('#select-hebrew-interface-link')
      : page.locator('#select-english-interface-link');
  
      await expect(languageLink).toBeVisible();
      await languageLink.click();
      const expectedClass = language === LANGUAGES.HE ? 'interface-hebrew' : 'interface-english';
      await expect(page.locator('body')).toHaveClass(new RegExp(`\\b${expectedClass}\\b`));
    };

/*LOGIN/LOGOUT RELATED METHODS */

//located in utils rather than loginPage because it is used in multiple places;
//it involves removing authentication (cookies) rather than logging out    
/**
 * Simulates a logout by removing the sessionid cookie
 * note that you still need to trigger logout by typing, refreshing, etc on the test itself
 * @param context - The Playwright browser context
 * @returns true if a sessionid cookie was found and removed, false otherwise
 */
export const expireLogoutCookie = async (context) => {
  const cookies = await context.cookies();
  const sessionCookie = cookies.find(c => c.name === 'sessionid');
  if (sessionCookie) {    // Overwrite the sessionid cookie with an expired one to remove it
    await context.addCookies([
      {
        name: 'sessionid',
        value: '',
        domain: sessionCookie.domain,
        path: sessionCookie.path,
        expires: Math.floor(Date.now() / 1000) - 1000, // Expired in the past
        httpOnly: sessionCookie.httpOnly,
        secure: sessionCookie.secure,
        sameSite: sessionCookie.sameSite,
      }
    ]);
    return true;
  } else {
    return false;
  }
};
        
/*METHODS TO NAVIGATE TO A PAGE */

export const goToPageWithLang = async (context: BrowserContext, url: string, language=DEFAULT_LANGUAGE) => {
    const page: Page = await context.newPage();
    await page.goto(url);

    await changeLanguageIfNeeded(page, language);

    //await hideAllModalsAndPopups(page);
    await hideModals(page);
    return page
}

export const goToPageWithUser = async (context: BrowserContext, url: string, language=DEFAULT_LANGUAGE, user = testUser) => {
    const page: Page = await context.newPage();
    await page.goto('/login', {waitUntil: 'domcontentloaded'});
    await changeLanguageIfNeeded(page, language);
    const loginPage = new LoginPage(page, language);
    await loginPage.loginAs(user);
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await changeLanguageIfNeeded(page, language);
    await hideModals(page);
    return page;
}

export const getPathAndParams = (url: string) => {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
}


export const getCountryByIp = async (page: Page) => {
    const services = [
        {
            url: 'https://ipapi.co/json/',
            extract: (data: any) => data.country
        },
        {
            url: 'https://api.ipbase.com/v1/json/',
            extract: (data: any) => data.country_code
        }
    ];

    for (const service of services) {
        try {
            const data = await page.evaluate(async (url) => {
                const response = await fetch(url);
                return await response.json();
            }, service.url);
            
            if (data) {
                return service.extract(data);
            }
        } catch (e) {
            console.log(`Failed to get country from ${service.url}`, e);
            continue;
        }
    }
    return null;
}

export const isIsraelIp = async (page: Page) => {
    if (!currentLocation) {
        currentLocation = await getCountryByIp(page);
    }
    return currentLocation === "IL";
}


/*DOM RELATED METHODS */

export const isClickable = async (locator: Locator): Promise<boolean> => {
  try {
    // Check visibility
    const visible = await locator.isVisible();
    if (!visible) return false;

    // Check computed style: pointer-events
    const pointerEvents = await locator.evaluate(el =>
      window.getComputedStyle(el).pointerEvents
    );
    if (pointerEvents === 'none') return false;

    // Check if the element could be clicked (no overlays etc.)
    await locator.click({ trial: true });

    return true;
  } catch (e) {
    return false;
  }
}

/* NETWORK RELATED METHODS */

export const simulateOfflineMode = async (page: Page) => {
  await page.context().setOffline(true);
};

export const simulateOnlineMode = async (page: Page) => {
  await page.context().setOffline(false);
};





