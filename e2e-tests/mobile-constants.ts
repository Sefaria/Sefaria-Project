/**
 * Mobile-specific constants for E2E tests
 * These selectors and configurations are specific to mobile viewport/responsive design
 */

// Mobile-specific selectors for hamburger menu and navigation
export const MOBILE_SELECTORS = {
  // Hamburger menu button
  HAMBURGER_BUTTON: '.menuButton',
  HAMBURGER_ICON: '.fa-bars',

  // Mobile navigation menu
  NAV_MENU: '.mobileNavMenu',
  NAV_MENU_CLOSED: '.mobileNavMenu.closed',
  SEARCH_LINE: '.mobileNavMenu .searchLine',

  // Mobile header
  HEADER: '.header.mobile',
  HEADER_INNER: '.headerInner.mobile',
  HEADER_CENTER: '.mobileHeaderCenter',
  HEADER_LANGUAGE_TOGGLE: '.mobileHeaderLanguageToggle',

  // Navigation links
  TEXTS_LINK: 'a[href="/texts"]',
  TOPICS_LINK: 'a[href="/topics"]',
  CALENDARS_LINK: 'a[href="/calendars"]',
  COLLECTIONS_LINK: 'a[href="/collections"]',
  DONATE_LINK: '.mobileNavMenu a.blue',

  // Account section
  ACCOUNT_LINKS: '.mobileAccountLinks',
  SAVED_LINK: 'a[href="/saved"]',
  PROFILE_CONTAINER: '.mobileProfileFlexContainer',
  SETTINGS_LINK: 'a[href="/settings/account"]',
  HELP_LINK: 'a[href*="help"]',
  ABOUT_LINK: 'a[href="/mobile-about-menu"]',

  // Language toggle
  LANGUAGE_TOGGLE: '.mobileInterfaceLanguageToggle',
  LANGUAGE_EN: '.int-en',
  LANGUAGE_HE: '.int-he',
  LANGUAGE_INACTIVE: '.inactive',

  // Module switchers
  MODULE_SWITCHER: '.mobileModuleSwitcher',
  MODULE_SWITCHER_VOICES: 'a.mobileModuleSwitcher[data-target-module="voices"]',
  MODULE_SWITCHER_LIBRARY: 'a.mobileModuleSwitcher[data-target-module="library"]',
  MODULE_SWITCHER_DEVELOPERS: 'a.mobileModuleSwitcher[href*="developers"]',
  MODULE_SWITCHER_PRODUCTS: 'a[href="/products"]',

  // Login/Logout
  LOGOUT_LINK: 'a.logout',
  LOGIN_BUTTON: '.login button',
  SIGNUP_BUTTON: '.signup button',

  // Logo
  LOGO_LIBRARY: 'a.home[aria-label="Sefaria library logo"]',
  LOGO_VOICES: 'a.home[aria-label="Sefaria voices logo"]',
} as const;

// Mobile menu items text (for verification)
export const MOBILE_MENU_ITEMS = {
  LIBRARY: {
    EN: {
      TEXTS: 'Texts',
      TOPICS: 'Topics',
      LEARNING_SCHEDULES: 'Learning Schedules',
      DONATE: 'Donate',
      SAVED: 'Saved, History & Notes',
      SETTINGS: 'Account Settings',
      HELP: 'Get Help',
      ABOUT: 'About Sefaria',
      VOICES_ON_SEFARIA: 'Voices on Sefaria',
      DEVELOPERS: 'Developers on Sefaria',
      MORE_FROM_SEFARIA: 'More from Sefaria',
      LOGIN: 'Log in',
      SIGNUP: 'Sign up',
      LOGOUT: 'Logout',
    },
    HE: {
      TEXTS: 'מקורות',
      TOPICS: 'נושאים',
      LEARNING_SCHEDULES: 'לוחות לימוד',
      DONATE: 'לתרומה',
      SAVED: 'שמורים, היסטוריה והערות',
      SETTINGS: 'הגדרות חשבון',
      HELP: 'עזרה',
      ABOUT: 'אודות ספריא',
      VOICES_ON_SEFARIA: 'Voices על ספריא',
      DEVELOPERS: 'Developers על ספריא',
      MORE_FROM_SEFARIA: 'עוד מספריא',
      LOGIN: 'התחברות',
      SIGNUP: 'הרשמה',
      LOGOUT: 'התנתקות',
    }
  },
  VOICES: {
    EN: {
      TOPICS: 'Topics',
      COLLECTIONS: 'Collections',
      DONATE: 'Donate',
      PROFILE: 'Profile',
      NOTIFICATIONS: 'Notifications',
      SETTINGS: 'Account Settings',
      HELP: 'Get Help',
      ABOUT: 'About Sefaria',
      SEFARIA_LIBRARY: 'Sefaria Library',
      DEVELOPERS: 'Developers on Sefaria',
      MORE_FROM_SEFARIA: 'More from Sefaria',
      LOGIN: 'Log in',
      SIGNUP: 'Sign up',
      LOGOUT: 'Logout',
    },
    HE: {
      TOPICS: 'נושאים',
      COLLECTIONS: 'אוספים',
      DONATE: 'לתרומה',
      PROFILE: 'פרופיל',
      NOTIFICATIONS: 'התראות',
      SETTINGS: 'הגדרות חשבון',
      HELP: 'עזרה',
      ABOUT: 'אודות ספריא',
      SEFARIA_LIBRARY: 'ספריית ספריא',
      DEVELOPERS: 'Developers על ספריא',
      MORE_FROM_SEFARIA: 'עוד מספריא',
      LOGIN: 'התחברות',
      SIGNUP: 'הרשמה',
      LOGOUT: 'התנתקות',
    }
  }
} as const;

// Mobile device configurations for Playwright (2026 devices)
export const MOBILE_DEVICES = {
  IPHONE_16: {
    name: 'iPhone 16',
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  PIXEL_10: {
    name: 'Pixel 10',
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  },
  PIXEL_9: {
    name: 'Pixel 9',
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  },
  IPHONE_15: {
    name: 'iPhone 15',
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  }
} as const;

// Expected search result types for mobile
export const MOBILE_SEARCH_TYPES = {
  LIBRARY: ['Authors', 'Topics', 'Categories', 'Books'],
  VOICES: ['Topics', 'Authors', 'Users'],
} as const;

// Mobile-specific URLs and routes
export const MOBILE_ROUTES = {
  ABOUT_MENU: '/mobile-about-menu',
  HELP: 'https://help.sefaria.org',
  DEVELOPERS: 'https://developers.sefaria.org',
  PRODUCTS: '/products',
} as const;
