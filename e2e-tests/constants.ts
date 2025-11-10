/**
 * Constant variables for E2E tests
 */

// Interface for save state objects
export interface SaveState {
  text: RegExp;
  textHebrew: RegExp;
  tooltip: RegExp;
  tooltipHebrew: RegExp;
}

//Strings for testing save state indicators, currently only in use for the source sheet editor page

export const SaveStates: Record<string, SaveState> = {
    saved: {
      text: /Saved/i,
      textHebrew: /נשמר/i,
      tooltip: /Your sheet is saved to Sefaria/i,
      tooltipHebrew: /דף המקורות שלך שמור בספריא/i,
    },
    saving: {
      text: /Saving/i,
      textHebrew: /שומר/i,
      tooltip: /We are saving your changes to Sefaria/i,
      tooltipHebrew: /כעת מתבצעת שמירת השינויים שלך בספריא/i,
    },
    loggedOut: {
      text: /User logged out/i,
      textHebrew: /בוצעה התנתקות מהמערכת/i,
      tooltip: /You are not logged in to Sefaria/i,
      tooltipHebrew: /כעת אינך מחובר\/ת לספריא/i,
    },
    tryingToConnect: {
      text: /Trying to connect/i,
      textHebrew: /ניסיון התחברות/i,
      tooltip: /No internet connection detected/i,
      tooltipHebrew: /לא זוהה חיבור לאינטרנט/i,
    },
    catchAllFifthState: { //catch all error state, developers have called it "fifth state"
      text: /Something went wrong. Try refreshing the page./i,
      textHebrew: /משהו השתבש. יש לנסות לרענן את העמוד/i,
      tooltip: /If this problem persists, please try again later and contact us at hello@sefaria.org/i,
      tooltipHebrew: /אם הבעיה נמשכת, אנא נסו לרענן שוב מאוחר יותר וצרו איתנו קשר בכתובת hello@sefaria.org/i,
    },
  };

// ==============================================================================
// MODULE-SPECIFIC CONSTANTS (Library and Voices)
// ==============================================================================

export const MODULE_URLS = {
  LIBRARY: 'https://www.modularization.cauldron.sefaria.org',
  VOICES: 'https://voices.modularization.cauldron.sefaria.org'
} as const;

export const MODULE_SELECTORS = {
  LOGO: {
    LIBRARY: 'img[alt="Sefaria library logo"]',
    VOICES: 'img[alt="Sefaria voices logo"]'
  },
  ICONS: {
    LANGUAGE: 'img[src="/static/icons/globe-wire.svg"]',
    MODULE_SWITCHER: 'img[src="/static/icons/module_switcher_icon.svg"]',
    USER_MENU: 'img[src="/static/icons/logged_out.svg"]'
  },
  DROPDOWN: '.dropdownLinks-menu',
  DROPDOWN_OPTION: 'a.dropdownItem',
  LANGUAGE_SWITCHER_GLOBE: 'div.dropdownLanguageToggle',
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
  // Voices-specific configuration - different from Library
  VOICES_ALL_EXPECTED_SECTIONS: ['Topics', 'Authors', 'Users'] as const,
  VOICES_EXCLUDED_SECTIONS: ['Categories', 'Books'] as const,
  VOICES_ALL_EXPECTED_ICONS: ['Topic', 'AuthorTopic', 'User'] as const,
  // Common search terms that trigger comprehensive results
  TEST_SEARCH_TERMS: {
    LIBRARY_SHOW_ALL: 'mid', // "mid" reliably triggers all 4 sections
    VOICES_SHOW_ALL: 'rashi', // "rashi" shows Topics, Authors, and Users
  }
} as const;

// Valid topics for Voices testing (slug -> display name mapping)
// Format: slug is the URL-safe identifier, display name is what appears in UI
export const VALID_TOPICS = {
  '13-middot': '13 Middot',
  'aaron': 'Aaron',
  'abraham': 'Abraham',
  'action': 'Action',
  'adam': 'Adam',
  'agriculture': 'Agriculture',
  'agunah': 'Agunah',
  'aleinu': 'Aleinu',
  'al-hanisim': 'Al HaNissim',
  'amen': 'Amen',
  'amulets': 'Amulets',
  'angels': 'Angels',
  'anger': 'Anger',
  'animals': 'Animals',
  'antisemitism': 'Antisemitism',
  'apostasy': 'Apostasy',
  'aron-habrit': 'Aron HaBrit',
  'art': 'Art',
  'asherah': 'Asherah',
  'astrology': 'Astrology',
  'astronomy': 'Astronomy',
  'atonement': 'Atonement',
  'authority': 'Authority',
  'babel': 'Babel',
  'bar-kokhba': 'Bar Kokhba',
  'bar-mitzvah': 'Bar Mitzvah',
  'bat-kol': 'Bat Kol',
  'batsheva3': 'Batsheva',
  'beauty': 'Beauty',
  'beit-hillel': 'Beit Hillel',
  'beit-shammai': 'Beit Shammai',
  'beliefs': 'Beliefs',
  'betzalel': 'Betzalel',
  'beyond-the-letter-of-the-law': 'Beyond the Letter of the Law',
  'binding-of-isaac': 'Binding of Isaac',
  'birds': 'Birds',
  'birkat-hamazon': 'Birkat HaMazon',
  'birth': 'Birth',
  'birthright': 'Birthright',
  'blessings-(halakhah)': 'Blessings (Halakhah)',
  'blindness': 'Blindness',
  'bodies': 'Body',
  'book-of-life': 'Book of Life',
  'borders': 'Borders',
  'bread': 'Bread',
  'bribes': 'Bribes',
  'burial': 'Burial',
  'burning-bush': 'Burning Bush',
  'business': 'Business',
  'cain': 'Cain',
  'calendar': 'Calendar',
  'camp': 'Camp',
  'candle-lighting': 'Candle Lighting',
  'candles': 'Candles',
  'censuses': 'Censuses',
  'chachamim': 'Chachamim',
  'chagigah': 'Chagigah',
  'challah': 'Challah',
  'changes': 'Changes',
  'menorah': 'Chanukkiah',
  'chevruta': 'Chavruta',
  'children': 'Children',
  'chosenness': 'Chosenness',
  'circles': 'Circles',
  'cities-of-refuge': 'Cities of Refuge',
  'civil-discourse': 'Civil Discourse',
  'civil-disobedience': 'Civil Disobedience',
  'climate-change': 'Climate Change',
  'clothing': 'Clothing',
  'clouds': 'Clouds',
  'comfort': 'Comfort',
  'compassion': 'Compassion',
  'congregations1': 'Congregations',
  'construction': 'Construction',
  'contradictions1': 'Contradictions',
  'conversion': 'Converts and Conversion',
  'counting': 'Counting',
  'courage': 'Courage',
  'covenants': 'Covenants',
  'craving1': 'Craving',
  'creation': 'Creation',
  'creativity': 'Creativity',
  'cremation': 'Cremation',
  'culture': 'Culture',
  'curiosity': 'Curiosity',
  'curses': 'Curses',
  'damages': 'Damages',
  'dances1': 'Dance',
  'darkness': 'Darkness',
  'daughters-of-zelophehad': 'Daughters of Tzelofchad',
  'death': 'Death',
  'death-penalty': 'Death Penalty',
  'debates': 'Debates',
  'deborah': 'Deborah'
} as const;

export const MODULE_SWITCHER = {
  options: [
    { name: 'Library', url: MODULE_URLS.LIBRARY },
    { name: 'Voices', url: MODULE_URLS.VOICES },
    { name: 'Developers', url: EXTERNAL_URLS.DEVELOPERS },
    { name: 'More from Sefaria ›', url: /\/products$/ }
  ]
} as const;

// Module-specific text translations for English and Hebrew interfaces
export const MODULE_TEXTS = {
  LIBRARY: {
    EN: {
      TEXTS_LINK: 'Texts',
      TOPICS_LINK: 'Topics',
      SIGN_UP_BUTTON: 'Sign Up'
    },
    HE: {
      TEXTS_LINK: 'מקורות',
      TOPICS_LINK: 'נושאים',
      SIGN_UP_BUTTON: 'הרשמה'
    }
  },
  VOICES: {
    EN: {
      TOPICS_LINK: 'Topics',
      COLLECTIONS_LINK: 'Collections',
      CREATE_BUTTON: 'Create'
    },
    HE: {
      TOPICS_LINK: 'נושאים',
      COLLECTIONS_LINK: 'אוספים',
      CREATE_BUTTON: 'צור'
    }
  }
} as const;

// Site configurations for both modules
export interface SiteConfig {
  readonly url: string;
  readonly name: string;
  readonly logo: string;
  readonly mainLinks: ReadonlyArray<{ name: string; expectedUrl: RegExp }>;
  readonly actionButton: { text: string; href: string };
  readonly tabOrder: ReadonlyArray<{ selector: string; description: string }>;
}

export const SITE_CONFIGS: { readonly LIBRARY: SiteConfig; readonly VOICES: SiteConfig } = {
  LIBRARY: {
    url: MODULE_URLS.LIBRARY,
    name: 'Library',
    logo: MODULE_SELECTORS.LOGO.LIBRARY,
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
      { selector: '.header .sefaria-common-button', description: 'Sign Up / Create button' },
      { selector: '.header .help a', description: 'Help link' },
      { selector: '.header img[src="/static/icons/globe-wire.svg"]', description: 'Language globe button' },
      { selector: '.header button.header-dropdown-button[aria-label="Library"]', description: 'Module switcher button' },
      { selector: '.header button.header-dropdown-button[aria-label="Account menu"]', description: 'User menu button' },
    ]
  },
  VOICES: {
    url: MODULE_URLS.VOICES,
    name: 'Sheets',
    logo: MODULE_SELECTORS.LOGO.VOICES,
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

// Type definitions
export type ModuleType = 'library' | 'voices';
export type TabOrderItem = { readonly selector: string; readonly description: string };
export type SearchDropdownSection = typeof SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_SECTIONS[number] | typeof SEARCH_DROPDOWN.VOICES_ALL_EXPECTED_SECTIONS[number];
export type SearchDropdownIcon = typeof SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_ICONS[number] | typeof SEARCH_DROPDOWN.VOICES_ALL_EXPECTED_ICONS[number];
export type IconConfig = { readonly selector: string; readonly alt: string };
  
  