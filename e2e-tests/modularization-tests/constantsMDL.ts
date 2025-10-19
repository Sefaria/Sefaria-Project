export const URLS = {
  LIBRARY: 'https://modularization.cauldron.sefaria.org',
  VOICES: 'https://voices.modularization.cauldron.sefaria.org'
} as const;

export const AUTH_CONSTANTS = {
  TEST_USER: {
    email: process.env.PLAYWRIGHT_USER_EMAIL || "example@example.com",
    password: process.env.PLAYWRIGHT_USER_PASSWORD || "example"
  },
  SUPERUSER: {
    email: process.env.PLAYWRIGHT_SUPERUSER_EMAIL || "example@example.com", 
    password: process.env.PLAYWRIGHT_SUPERUSER_PASSWORD || "badpassword"
  },
  LOGIN_URLS: {
    LIBRARY: 'https://modularization.cauldron.sefaria.org/login',
    VOICES: 'https://voices.modularization.cauldron.sefaria.org/login'
  }
} as const;

export const SELECTORS = {
  LOGO: {
    LIBRARY: 'img[alt="Sefaria library logo"]',
    VOICES: 'img[alt="Sefaria voices logo"]'
  },
  ICONS: {
    LANGUAGE: 'img[src="/static/icons/globe-wire.svg"]',
    MODULE_SWITCHER: 'img[src="/static/icons/module_switcher_icon.svg"]',
    USER_MENU: 'img[src="/static/icons/logged_out.svg"]'
  },
  DROPDOWN_OPTION: 'a.interfaceLinks-option',
  MODULE_DROPDOWN_OPTIONS: '.dropdownLinks-menu a.dropdownItem',
  BANNER: '[role="banner"]'
} as const;

export const EXTERNAL_URLS = {
  DONATE: /donate\.sefaria\.org/,
  HELP: /help\.sefaria\.org/,
  DEVELOPERS: /developers\.sefaria\.org/
} as const;

export const SEARCH_DROPDOWN = {
  CONTAINER: '.autocomplete-dropdown',
  SECTIONS: {
    AUTHORS: 'Authors',
    TOPICS: 'Topics',
    CATEGORIES: 'Categories',
    BOOKS: 'Books',
    USERS: 'Users'
  },
  ICONS: {
    SEARCH: { selector: 'img[src="/static/icons/iconmonstr-magnifier-2.svg"]', alt: 'Search' },
    AUTHOR: { selector: 'img[alt="AuthorTopic"]', alt: 'AuthorTopic' },
    TOPIC: { selector: 'img[alt="Topic"]', alt: 'Topic' },
    CATEGORY: { selector: 'img[alt="TocCategory"]', alt: 'TocCategory' },
    BOOK: { selector: 'img[alt="ref"]', alt: 'ref' },
    USER: { selector: 'img[alt="User"]', alt: 'User' }
  },
  // Configuration for what should/shouldn't appear
  LIBRARY_ALL_EXPECTED_SECTIONS: ['Authors', 'Topics', 'Categories', 'Books'] as const,
  LIBRARY_EXCLUDED_SECTIONS: ['Users'] as const,
  LIBRARY_ALL_EXPECTED_ICONS: ['AuthorTopic', 'Topic', 'TocCategory', 'ref'] as const,
  // Sheets-specific configuration - different from Library
  VOICES_ALL_EXPECTED_SECTIONS: ['Topics', 'Authors', 'Users'] as const,
  VOICES_EXCLUDED_SECTIONS: ['Categories', 'Books'] as const,
  VOICES_ALL_EXPECTED_ICONS: ['Topic', 'AuthorTopic', 'User'] as const, // User icons are profile pictures with alt="User"
  // Common search terms that trigger comprehensive results
  TEST_SEARCH_TERMS: {
    LIBRARY_SHOW_ALL: 'mid', // "mid" reliably triggers all 4 sections (Authors, Topics, Categories, Books)
    VOICES_SHOW_ALL: 'rashi', // "rashi" shows Topics, Authors, and Users on Sheets
  }
} as const;

export const MODULE_SWITCHER ={
  options: [
    { name: 'Library', url: URLS.LIBRARY },
    { name: 'Voices', url: URLS.VOICES },
    { name: 'Developers', url: EXTERNAL_URLS.DEVELOPERS },
    { name: 'More from Sefaria ›', url: /\/products$/ }
  ]
}

export const SITE_CONFIGS = {
  LIBRARY: {
    url: URLS.LIBRARY,
    name: 'Library',
    logo: SELECTORS.LOGO.LIBRARY,
    mainLinks: [
      { name: 'Texts', expectedUrl: /texts|\/$$/ },
      { name: 'Topics', expectedUrl: /topics/ }
    ],
    actionButton: { text: 'Sign Up', href: '/register' },
    tabOrder: [
      { selector: '.header a.textLink[href="/texts"]', description: 'Texts link' },
      { selector: '.header a.textLink[href="/topics"]', description: 'Topics link' },
      { selector: '.header a.textLink.donate', description: 'Donate link' },
      { selector: '.header input.search', description: 'Search input' },
      { selector: '.header img.keyboardInputInitiator', description: 'Virtual keyboard icon' },
      // Action button (anchor with role=button) - sign up
      { selector: '.header .sefaria-common-button', description: 'Sign Up / Create button' },
      { selector: '.header .help a', description: 'Help link' },
      { selector: '.header img[src="/static/icons/globe-wire.svg"]', description: 'Language globe button' },
      { selector: '.header button.header-dropdown-button[aria-label="Library"]', description: 'Module switcher button' },
      { selector: '.header button.header-dropdown-button[aria-label="Account menu"]', description: 'User menu button' },
    ]
  },
  VOICES: {
    url: URLS.VOICES,
    name: 'Sheets',
    logo: SELECTORS.LOGO.VOICES,
    mainLinks: [
      { name: 'Topics', expectedUrl: /topics/ },
      { name: 'Collections', expectedUrl: /collections/ }
    ],
    actionButton: { text: 'Create', href: '/sheets/new' },
    tabOrder: [
      { selector: '.header a.textLink[href="/topics"]', description: 'Topics link' },
      { selector: '.header a.textLink[href="/collections"]', description: 'Collections link' },
      { selector: '.header a.textLink.donate', description: 'Donate link' },
      { selector: '.header input.search', description: 'Search input' },
      { selector: '.header img.keyboardInputInitiator', description: 'Virtual keyboard icon' },
      { selector: '.header .sefaria-common-button', description: 'Create button' },
      { selector: '.header .help a', description: 'Help link' },
      { selector: '.header img[src="/static/icons/globe-wire.svg"]', description: 'Language globe button' },
      { selector: '.header button.header-dropdown-button[aria-label="Library"]', description: 'Module switcher button' },
      { selector: '.header button.header-dropdown-button[aria-label="Account menu"]', description: 'User menu button' }
    ]
  }
} as const;

// Type definitions for better TypeScript support
export type SiteConfig = typeof SITE_CONFIGS.LIBRARY | typeof SITE_CONFIGS.VOICES;
export type TabOrderItem = { readonly selector: string; readonly description: string };
export type SearchDropdownSection = typeof SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_SECTIONS[number] | typeof SEARCH_DROPDOWN.VOICES_ALL_EXPECTED_SECTIONS[number];
export type SearchDropdownIcon = typeof SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_ICONS[number] | typeof SEARCH_DROPDOWN.VOICES_ALL_EXPECTED_ICONS[number];
export type IconConfig = { readonly selector: string; readonly alt: string };
export type AuthUser = 'testUser' | 'superUser';