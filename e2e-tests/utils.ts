import {DEFAULT_LANGUAGE, LANGUAGES, SOURCE_LANGUAGES, testUser} from './globals'
import {BrowserContext}  from 'playwright-core';
import type { Page } from 'playwright-core';
import { expect, Locator } from '@playwright/test';

import { SourceSheetEditorPage } from './pages/sourceSheetEditor.page';

let langCookies: any = [];
let loginCookies: any = [];
let currentLocation: string = ''; 

//method to hid modals that interrupt the user experience
export const hideModals = async (page: Page) => {
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.innerHTML = '#interruptingMessageBox {display: none;}';
        document.head.appendChild(style);
    });
}

export async function dismissNewsletterPopupIfPresent(page: Page) {

     // Wait for up to 5 seconds if it shows up late
  try {
    await page.evaluate(() => {
      const blocker = document.querySelector('.ub-emb-scroll-wrapper');
      if (blocker) {
        (blocker as HTMLElement).style.pointerEvents = 'none';
        (blocker as HTMLElement).style.display = 'none'; // Optional: fully hide it
      }
    });
    console.log('Popup closed successfully.');
  } catch (err) {
    console.log('Popup not found or already hidden.');
  }
  }
  

//method to hide the generic banner that appears on the editor page (Welcome to New Editor)
export const hideGenericBanner = async (page: Page) => {
  await page.evaluate(() => {
    const banner = document.querySelector('.genericBanner');
    if (banner) {
      (banner as HTMLElement).style.display = 'none';
    }

    // Fallback style override just in case dynamic styles re-show it
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

// Method to hide the cookies popup that appears on the site
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
      // Remove the top banner directly
      const banner = document.querySelector('header.readerControls.fullPanel.sheetReaderControls');
      if (banner && banner.parentElement) {
        banner.parentElement.removeChild(banner);
      }
      // Also remove its container (if it's wrapping/intercepting events)
      const outer = document.querySelector('.readerControlsOuter');
      if (outer && outer.parentElement) {
        outer.parentElement.removeChild(outer);
      }
      // Just in case, remove any z-index overlays or leftover styles
      const style = document.createElement('style');
      style.innerHTML = `
        .readerControlsOuter, header.readerControls.fullPanel.sheetReaderControls {
          display: none !important;
          pointer-events: none !important;
          visibility: hidden !important;
          z-index: -9999 !important;
        }
      `;
      document.head.appendChild(style);
    });
  };
  

export const changeLanguageLoggedOut = async (page: Page, language: string) => {
    await page.locator('.interfaceLinks-button').click()
    if (language === LANGUAGES.EN) {
        //await page.getByRole('banner').getByRole('link', { name: /English/i }).click();
        await page.locator('.interfaceLinks-option.int-en').click();
    } else if (language === LANGUAGES.HE) {
        //await page.getByRole('banner').getByRole('link', { name: /עברית/i }).click()
        await page.locator('.interfaceLinks-option.int-he').click();

    }
}

export const changeLanguageLoggedIn = async (page: Page, language: string) => {
    console.log('Changing language to:', language);

    // Open the profile dropdown by clicking the profile icon
    const profileIcon = page.locator('.myProfileBox .profile-pic');
    await profileIcon.click();
  
    // Wait for the dropdown to appear
    const menu = page.locator('.interfaceLinks-menu.profile-menu');
    await expect(menu).toBeVisible();
  
    // Select the correct language link
    const languageLink = language === LANGUAGES.HE
      ? page.locator('#select-hebrew-interface-link')
      : page.locator('#select-english-interface-link');
  
      console.log('Selector being used:', language === LANGUAGES.HE ? '#select-hebrew-interface-link' : '#select-english-interface-link');
    // await expect(languageLink).toBeVisible();
    // await languageLink.click();

    await expect(languageLink).toBeVisible();
    await languageLink.click();
  
    // Wait for the <body> class to reflect the language change
    const expectedClass = language === LANGUAGES.HE ? 'interface-hebrew' : 'interface-english';
    await expect(page.locator('body')).toHaveClass(new RegExp(`\\b${expectedClass}\\b`));
  };
  
  
  

export const goToPageWithLang = async (context: BrowserContext, url: string, language=DEFAULT_LANGUAGE) => {
    // If a cookie already has contents, clear it so that the language cookie can be reset
    if (langCookies.length) {
        await context.clearCookies()
    }   
    const page: Page = await context.newPage();
    await page.goto(url);

    // Only change language if the IP address doesn't match the specified language.
    const inIsrael = await isIsraelIp(page)
    if( ( inIsrael && language == LANGUAGES.EN) || 
        ( !inIsrael && language == LANGUAGES.HE)){
        await changeLanguageLoggedOut(page, language);
    }

    langCookies = await context.cookies();

    await context.addCookies(langCookies);
    await page.reload()
    return page

}

// export const loginUser = async (page: Page, user=testUser, language=DEFAULT_LANGUAGE) => {
//     await page.goto('/login');
//     await changeLanguage(page, language);
//     await page.getByPlaceholder('Email Address').fill(user.email ?? '');
//     await page.getByPlaceholder('Password').fill(user.password ?? '');
//     await page.getByRole('button', { name: 'Login' }).click();
//     await page.getByRole('link', { name: 'See My Saved Texts' }).isVisible();
// }

export const loginUser = async (page: Page, user = testUser, language = DEFAULT_LANGUAGE) => {
    // Assume we are already on the login page with the correct `?next=` param
    //await changeLanguageLoggedOut(page, language);
    //await page.getByPlaceholder('Email Address').fill(user.email ?? '');
    await page.getByPlaceholder('Email Address').fill('tzirel@sefaria.org');
    await page.getByPlaceholder('Password').fill('1234567');
    //await page.getByPlaceholder('Password').fill(user.password ?? '');
    await page.getByRole('button', { name: 'Login' }).click();
  
    // Wait for navigation to complete — ideally back to the previous page
    await page.waitForLoadState('networkidle');
  };
  


export const goToPageWithUser = async (context: BrowserContext, url: string, user=testUser) => {
    if (!loginCookies.length) {
        const page: Page = await context.newPage();
        await loginUser(page, user)
        loginCookies = await context.cookies();
    }
    await context.addCookies(loginCookies);
    // this is a hack to get the cookie to work
    const newPage: Page = await context.newPage();
    await newPage.goto(url);
    await hideModals(newPage);
    return newPage;
}

export const goToSourceSheetEditorWithUser = async (context: BrowserContext, url: string, user=testUser) => {
    return await goToPageWithUser(context, '/sheets/new', user);
}

export const getPathAndParams = (url: string) => {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
}

export const changeLanguageOfText = async (page: Page, sourceLanguage: RegExp) => {
    // Clicking on the Source Language toggle
    await page.getByAltText('Toggle Reader Menu Display Settings').click()

    // Selecting Source Language
    await page.locator('div').filter({ hasText: sourceLanguage }).click()
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


/**
 * Checks whether an element is visible, has pointer events,
 * and is not obscured by another element.
 */
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



