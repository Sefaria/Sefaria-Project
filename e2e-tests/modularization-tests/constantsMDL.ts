export const URLS = {
  LIBRARY: 'https://modularization.cauldron.sefaria.org',
  SHEETS: 'https://sheets.modularization.cauldron.sefaria.org'
} as const;

export const SELECTORS = {
  LOGO: {
    LIBRARY: 'img[alt="Sefaria Logo"]',
    SHEETS: 'img[alt="Sefaria Sheets Logo"]'
  },
  ICONS: {
    LANGUAGE: 'img[src="/static/icons/globe-wire.svg"]',
    MODULE_SWITCHER: 'img[src="/static/icons/module_switcher_icon.svg"]',
    USER_MENU: 'img[src="/static/icons/logged_out.svg"]'
  },
  DROPDOWN_OPTION: 'a.interfaceLinks-option',
  BANNER: '[role="banner"]'
} as const;

export const EXTERNAL_URLS = {
  DONATE: /donate\.sefaria\.org/,
  HELP: /help\.sefaria\.org/,
  DEVELOPERS: /developers\.sefaria\.org/
} as const;

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
      { selector: '.header input.search[placeholder="Search"]', description: 'Search input' },
      { selector: '.header img.keyboardInputInitiator', description: 'Virtual keyboard icon' },
      { selector: '.header button.sefaria-common-button', description: 'Sign Up button' },
      { selector: '.header a[href="/register"]', description: 'Sign Up link' },
      { selector: '.header a[href="https://help.sefaria.org/hc/en-us"]', description: 'Help link' }
    ]
  },
  SHEETS: {
    url: URLS.SHEETS,
    name: 'Sheets',
    logo: SELECTORS.LOGO.SHEETS,
    mainLinks: [
      { name: 'Topics', expectedUrl: /topics/ },
      { name: 'Collections', expectedUrl: /collections/ }
    ],
    actionButton: { text: 'Create', href: '/sheets/new' },
    tabOrder: [
      { selector: '.header a.textLink[href="/sheets/topics"]', description: 'Topics link' },
      { selector: '.header a.textLink[href="/sheets/collections"]', description: 'Collections link' },
      { selector: '.header a.textLink.donate', description: 'Donate link' },
      { selector: '.header input.search[placeholder="Search"]', description: 'Search input' },
      { selector: '.header img.keyboardInputInitiator', description: 'Virtual keyboard icon' },
      { selector: '.header button.sefaria-common-button', description: 'Create button' },
      { selector: '.header a[href="/sheets/new"]', description: 'Create link' },
      { selector: '.header a[href="https://help.sefaria.org/hc/en-us"]', description: 'Help link' }
    ]
  }
} as const;

// Type definitions for better TypeScript support
export type SiteConfig = typeof SITE_CONFIGS.LIBRARY | typeof SITE_CONFIGS.SHEETS;
export type TabOrderItem = { readonly selector: string; readonly description: string };