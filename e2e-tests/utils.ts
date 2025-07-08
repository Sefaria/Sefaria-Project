import {DEFAULT_LANGUAGE, LANGUAGES, SOURCE_LANGUAGES, testUser} from './globals'
import {BrowserContext}  from '@playwright/test';
import type { Page } from '@playwright/test';
import { expect, Locator } from '@playwright/test';
import { LoginPage } from './pages/loginPage';

let currentLocation: string = ''; 
let savedSessionCookie = null;

/*METHODS TO HIDE MODALS/POPUPS THAT INTERRUPT THE USER EXPERIENCE */

export const hideModals = async (page: Page) => {
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.innerHTML = '#interruptingMessageBox {display: none;}';
        document.head.appendChild(style);
    });
}

export const dismissNewsletterPopupIfPresent = async (page: Page) => {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .ub-emb-scroll-wrapper,
      .ub-emb-iframe-wrapper,
      .ub-emb-iframe,
      iframe[src*="ubembed.com"],
      .ub-emb-close,
      div[class*="ub-emb"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      body {
        overflow: auto !important;
        pointer-events: auto !important;
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
        z-index: -9999 !important;
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
};

/**
 * Changes the interface language by clicking through the language menu.
 * Checks if the language is already correct before making changes.
 * 
 * @param page - The Playwright page object
 * @param language - Target language (LANGUAGES.EN or LANGUAGES.HE)
 */
export const changeLanguageIfNeeded = async (page: Page, language: string) => {
    // Check if we're already in the correct language
    const expectedElement = language === LANGUAGES.HE ? 'מקורות' : 'Texts';
    const isAlreadyCorrectLanguage = await page.getByRole('banner').getByRole('link', { name: expectedElement, exact: true }).first().isVisible();
    
    if (isAlreadyCorrectLanguage) {
        // Already in the correct language, no need to change
        return;
    }
    
    // Language change needed - click through the UI
    await page.locator('.interfaceLinks-button').click()
    if (language === LANGUAGES.EN) {
        await page.getByRole('banner').getByRole('link', { name: /English/i }).click();
        // Wait for the language change to complete by checking for English interface text
        await page.getByRole('banner').getByRole('link', { name: 'Texts' }).waitFor({ state: 'visible' });
    } else if (language === LANGUAGES.HE) {
        await page.getByRole('banner').getByRole('link', { name: /עברית/i }).click()
        // Wait for the language change to complete by checking for Hebrew interface text
        await page.getByRole('banner').getByRole('link', { name: 'מקורות' }).waitFor({ state: 'visible' });
    }
}

export const changeLanguageLoggedIn = async (page: Page, language: string) => {
    console.log('Changing language to:', language);

    // Open the profile dropdown by clicking the profile icon
    const profileIcon = page.locator('.myProfileBox .profile-pic');
    await profileIcon.click();
  
    const menu = page.locator('.interfaceLinks-menu.profile-menu');
    await expect(menu).toBeVisible();
  
    // Select the correct language link
    const languageLink = language === LANGUAGES.HE
      ? page.locator('#select-hebrew-interface-link')
      : page.locator('#select-english-interface-link');
  
      console.log('Selector being used:', language === LANGUAGES.HE ? '#select-hebrew-interface-link' : '#select-english-interface-link');

      await expect(languageLink).toBeVisible();
      await languageLink.click();
      await page.waitForTimeout(5000);
      const expectedClass = language === LANGUAGES.HE ? 'interface-hebrew' : 'interface-english';
      await expect(page.locator('body')).toHaveClass(new RegExp(`\\b${expectedClass}\\b`));
    };

/*LOGIN/LOGOUT RELATED METHODS */

    export const simulateLogout = async (context) => {
      const cookies = await context.cookies();
      const sessionCookie = cookies.find(c => c.name === 'sessionid');

      if (sessionCookie) {
        savedSessionCookie = sessionCookie;
        const otherCookies = cookies.filter(c => c.name !== 'sessionid');
        await context.clearCookies();
        await context.addCookies(otherCookies);
        return true;
      } else {
        console.warn('No session cookie found - user may already be logged out');
        return false;
      }
    };    

    export const simulateLogin = async (context) => {
      if (savedSessionCookie) {
        await context.addCookies([savedSessionCookie]);
      }
    };

    export const loginViaNavbar = async (page: Page, language = LANGUAGES.EN) => {
      await page.reload();
      await page.getByRole('link', { name: 'Log in' }).click();
      const loginPage = new LoginPage(page, language);
      await loginPage.loginAs(testUser.email ?? '', testUser.password ?? '');
    };
    
    export const loginViaTooltip = async (page: Page, language = LANGUAGES.EN) => {
      page.once('dialog', async dialog => {
        console.log(`Dialog message: ${dialog.message()}`);
        await dialog.accept();
      });
      await page.getByRole('link', { name: 'Log in' }).click();
      const loginPage = new LoginPage(page, language);
      await loginPage.loginAs(testUser.email ?? '', testUser.password ?? '');
    };

      
  
/*METHODS TO NAVIGATE TO A PAGE */

export const goToPageWithLang = async (context: BrowserContext, url: string, language=DEFAULT_LANGUAGE) => {
    const page: Page = await context.newPage();
    await page.goto(url);

    await changeLanguageIfNeeded(page, language);

    await hideAllModalsAndPopups(page);
    return page
}

export const goToPageWithUser = async (context: BrowserContext, url: string, user=testUser) => {
    const page: Page = await context.newPage();
    await loginUser(page, user)
    await changeLanguageIfNeeded(page, DEFAULT_LANGUAGE);

    await page.goto(url);

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





