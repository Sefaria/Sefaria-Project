
// ==============================================================================
// HELP SHEET TO ZENDESK REDIRECTS
// ==============================================================================

/**
 * Interface for help sheet redirect mappings
 * Based on ticket #22597 - redirects from old help sheets to new Zendesk help center
 */
export interface HelpSheetRedirect {
  readonly category?: string;
  readonly sheetTitle?: string;
  readonly includedTopics?: ReadonlyArray<string>;
  readonly sheetPath: string; // Path only, e.g., "/sheets/215584?lang=bi"
  readonly zendeskUrl: string; // Full URL to help.sefaria.org
  readonly notes?: string;
  readonly upToDate?: string;
  readonly views?: number;
}


/**
 * Help sheet to Zendesk redirect mappings
 * Maps old help sheet URLs to new Zendesk help center URLs
 *
 * Usage in tests:
 * - Replace www.sefaria.org with SANDBOX_URL in sheetPath
 * - Verify redirect to zendeskUrl (keep help.sefaria.org unchanged)
 */
export const HELP_SHEET_REDIRECTS: ReadonlyArray<HelpSheetRedirect> = [
  {
    category: 'Sefaria basics',
    sheetTitle: 'Accessibility Features',
    includedTopics: [
      'Choosing between Bilingual and monolingual layouts',
      'Adding Vowels or Cantillation Markings',
      'Bilingual Text Layout',
      'Adjust font size',
      'Dark mode (in App)',
      'Screen readers'
    ],
    sheetPath: '/sheets/215584?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/12756520483868-Text-Formatting-Accessibility',
    upToDate: 'yes',
    views: 3585
  },
  {
    category: 'Sefaria advanced',
    sheetTitle: 'Selecting a Language',
    includedTopics: [
      'Changing text language',
      'Changing homepage language',
      'Changing website language',
      'Changing app language',
      'Choose a Default Language',
      'Tranlsation pages'
    ],
    sheetPath: '/sheets/218610?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/18613320256156-Translations',
    notes: 'This is probably the closest thing to the sheet, even though it doesn\'t cover absolutely everything because (for example) app related content is found elsewhere',
    upToDate: 'yes',
    views: 2895
  },
  {
    category: 'Donate',
    sheetTitle: 'Supporting Sefaria',
    includedTopics: [
      'Donate',
      'Swag store',
      'Make sheets public',
      'Editing Community Translations',
      'Adding connections/translations',
      'Contribute translations',
      'Add translation other than English',
      'Get in touch with Donation Team',
      'Create a Classy Profile',
      'Cancel a Recurring Donation',
      'Edit My Donation'
    ],
    sheetPath: '/sheets/231440?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/categories/12756350371100-Donations',
    upToDate: 'no',
    views: 3723
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'Getting Started with Sefaria',
    includedTopics: [
      'What is Sefaria',
      'Account info - how to make one and why to make one',
      'Homepage header toolbar',
      'Homepage footer'
    ],
    sheetPath: '/sheets/210670?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/categories/13368526623132-Getting-Started',
    upToDate: 'yes',
    views: 8027
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'Contacting Sefaria',
    includedTopics: [
      'hello',
      'report mistake',
      'request text/translation',
      'report bug'
    ],
    sheetPath: '/sheets/213949?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/articles/21806344785308-How-to-Contact-Sefaria',
    notes: 'We get lots of correction emails',
    upToDate: 'yes',
    views: 3569
  },
  {
    category: 'Sefaria advanced',
    sheetTitle: 'Printing',
    includedTopics: [
      'Print from library',
      'Print sheet',
      'Export sheet to google'
    ],
    sheetPath: '/sheets/218612?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/12756518640668-How-to-Reuse-Download-and-Otherwise-Reproduce-Texts',
    notes: 'old editor',
    upToDate: '?',
    views: 5957
  },
  {
    category: 'Sheets',
    sheetTitle: 'Copying a Sheet',
    includedTopics: ['Copy a sheet'],
    sheetPath: '/sheets/225828?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/20094783356956-The-Sheet-Editor',
    upToDate: 'yes',
    views: 2772
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'Interconnected Texts',
    includedTopics: [
      'Video - Going deeper',
      'Find connections'
    ],
    sheetPath: '/sheets/218668?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/articles/18613227644316-How-to-Find-Interconnected-Texts',
    upToDate: 'yes',
    views: 2582
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'The Resource Panel',
    includedTopics: [
      'Meet the Resource Panel',
      'About this text',
      'Switch translations',
      'Notes',
      'How to Write, Edit, or Delete Notes',
      'How to Access All Your Notes',
      'Chavruta',
      'sheets',
      'web pages',
      'Topics',
      'Manuscripts',
      'Torah readings',
      'Add to sheet',
      'Dictionary',
      'versions in sidebar',
      'How to Share a Text',
      'Table of contents',
      'Feedback',
      'Compare texts'
    ],
    sheetPath: '/sheets/219447?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/articles/18472472138652-Quick-Guide-Meet-the-Resource-Panel',
    upToDate: 'yes',
    views: 24878
  },
  {
    category: 'Sefaria advanced',
    sheetTitle: 'Use and Reuse of Sources',
    includedTopics: [
      'check license or copyright',
      'explanation of license/copyright terms',
      'How to Download'
    ],
    sheetPath: '/sheets/228381?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/12756518640668-How-to-Reuse-Download-and-Otherwise-Reproduce-Texts',
    notes: 'Do we want to put "copyright" in the title?',
    upToDate: 'yes',
    views: 3199
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'Using the Sefaria App',
    includedTopics: [
      'links to apps',
      'downloading offline library',
      'changing version on app',
      'signing into app',
      'connections on app',
      'Topics on app'
    ],
    sheetPath: '/sheets/220945?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/categories/19814642862876-Sefaria-s-Mobile-Apps',
    upToDate: 'yes',
    views: 3906
  },
  {
    category: 'Sefaria advanced',
    sheetTitle: 'Using Reference Tools',
    includedTopics: [
      'how to use dictionaries',
      'what reference tools do we have',
      'Video',
      'Dictionaries on app'
    ],
    sheetPath: '/sheets/233647?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/12756555356956-Study-and-Reference-Tools',
    upToDate: 'yes',
    views: 3420
  },
  {
    category: 'Sheets',
    sheetTitle: 'Collaborating With Others (sheets)',
    includedTopics: [
      'Explanation of privacy settings',
      'Setting or changing privacy settings'
    ],
    sheetPath: '/sheets/233017?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/articles/20533111968540-How-to-Use-Source-Sheet-Collections',
    upToDate: 'yes',
    views: 1778
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'Finding Texts',
    includedTopics: [
      'How to find text in the library - video',
      'Search for source',
      'Search within text',
      'Use library homepage to find source',
      'Language pages',
      'Finding unknown texts video',
      'Topics tutorial'
    ],
    sheetPath: '/sheets/211565?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/12721846793116-How-to-Find-Texts',
    upToDate: 'yes',
    views: 3630
  },
  {
    category: 'Sheets',
    sheetTitle: 'Making a Source Sheet on the New Editor',
    includedTopics: [
      'Features of the new editor',
      'Enabling the new editor',
      'Beginning a new sheet',
      'Adding a text from Sefaria\'s library',
      'Add an image',
      'Add media',
      'Formatting your sheet',
      'Editing a source text',
      'Deleting from the sheet',
      'Moving text',
      'The resource panel',
      'Deleting a sheet',
      'Locating your sheets'
    ],
    sheetPath: '/sheets/393695?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/20094783356956-The-Sheet-Editor',
    upToDate: 'yes',
    views: 1990
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'Customizing the Text',
    includedTopics: [
      'video',
      'open the Aא menu',
      'choices  on the Aא menu',
      'choices  for viewing the William Davidson Talmud',
      'change translations',
      'change translations on the app'
    ],
    sheetPath: '/sheets/429277?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/articles/18472614956956-Quick-Guide-Meet-the-A-%D7%90-menu',
    upToDate: 'yes',
    views: 318
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'Topics Tutorial',
    includedTopics: [
      'video',
      'Topics on the Topics Page',
      'Topics from the search bar',
      'Understanding the topics page',
      'Why is this being shown?',
      'Related Topics'
    ],
    sheetPath: '/sheets/231377?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/20094169893276-All-About-Topics-Pages',
    upToDate: 'yes',
    views: 4769
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'The Table of Contents',
    includedTopics: [],
    sheetPath: '/sheets/519205?lang=en',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/articles/18472576952988-Quick-Guide-Meet-the-Table-of-Contents'
  },
  {
    category: 'Sheets',
    sheetTitle: 'Collections',
    includedTopics: [
      'What are Collections',
      'How might I use Collections',
      'Do I have to choose which collection my sheet belongs to',
      'What happens to the groups that I had on Sefaria',
      'How do I create a collection',
      'How do I add a sheet to a collection',
      'three ways to move other people\'s sheets into your collection',
      'pick which collection will appear under the title of my sheet',
      'privacy options for collections',
      'find my collections',
      'delete a collection'
    ],
    sheetPath: '/sheets/289837?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/articles/20533111968540-How-to-Use-Source-Sheet-Collections',
    upToDate: 'yes',
    views: 3269
  },
  {
    category: 'Sefaria advanced',
    sheetTitle: 'Biblical, Mishnaic, and Talmudic Biographies Tutorial',
    includedTopics: [
      'How can I learn more about the rabbis...',
      'Why do some entries say "No Description Known?',
      'How do I find even more information about a rabbi',
      'What will I learn about a Tanakh personality'
    ],
    sheetPath: '/sheets/274871?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/12756555356956-Study-and-Reference-Tools',
    views: 3061
  },
  {
    category: 'Sefaria advanced',
    sheetTitle: 'The Profile Page',
    includedTopics: [
      'What is a profile?',
      'Where is the profile icon?',
      'What will I find in the profile dropdown menu?',
      'How can I expand my profile?',
      'add a profile image',
      'change the email address attached account',
      'personalize experience on Sefaria',
      'preferred translation language option'
    ],
    sheetPath: '/sheets/303276?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/categories/12756351595932-Your-Account',
    upToDate: 'yes',
    views: 1659
  },
  {
    category: 'Sefaria advanced',
    sheetTitle: 'Enabling the Emoji Megillah and App Grogger',
    includedTopics: [
      'enable the Emoji Megillah on the app',
      'enable the Emoji Megillah on the website',
      'turn on the grogger on the app',
      'use the grogger'
    ],
    sheetPath: '/sheets/379494?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/12756538060956-Text-Specific-Special-Features',
    upToDate: 'yes',
    views: 742
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'Managing Your Account',
    includedTopics: [
      'What is a Sefaria account and why do I want one',
      'How do I sign up for a Sefaria account',
      'change my password',
      'change the email address attached to Sefaria account'
    ],
    sheetPath: '/sheets/303288?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/categories/12756351595932-Your-Account',
    upToDate: 'yes',
    views: 1552
  },
  {
    category: 'Donate',
    sheetTitle: 'Already Donated To Sefaria? Get Help Managing Your Donation',
    includedTopics: [
      'contact info for development dept',
      'accidentally made a recurring donation',
      'made a donation by accident',
      'change monthly donation amount',
      'update the credit card',
      'never received a donation receipt',
      'need help with my Day of Learning donation or text sponsorship'
    ],
    sheetPath: '/sheets/359083?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/17430252462236-Managing-Your-Donation',
    views: 647
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'Navigating Sefaria\'s New Design',
    includedTopics: ['Explanation of new header'],
    sheetPath: '/sheets/330784?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/articles/18472380899484-Quick-Guide-Meet-the-Homepage',
    upToDate: 'yes',
    views: 3582
  },
  {
    category: 'Sefaria advanced',
    sheetTitle: 'Adding and Editing Translations',
    includedTopics: [],
    sheetPath: '/sheets/483970?lang=en',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/18613320256156-Translations-and-Language-Preferences'
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'Translations on Sefaria',
    includedTopics: [],
    sheetPath: '/sheets/511573?lang=en',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/18613320256156-Translations-and-Language-Preferences'
  },
  {
    category: 'Sefaria advanced',
    sheetTitle: 'Saving/Bookmarking Texts',
    includedTopics: [],
    sheetPath: '/sheets/497893?lang=en',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/12756555356956-Study-and-Reference-Tools'
  },
  {
    category: 'Sefaria basics',
    sheetTitle: 'How Do I Start Learning on Sefaria?',
    includedTopics: [],
    sheetPath: '/sheets/477118?lang=en',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/18472260943900-Sefaria-101-Quick-Guides-and-Sefaria-Basics'
  },
  {
    category: '',
    sheetTitle: 'Instructions for Using Sefaria for Google Docs',
    includedTopics: [],
    sheetPath: '/sheets/529099?lang=en',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/20235182393244-Sefaria-for-Google-Docs'
  },
  {
    category: '',
    sheetTitle: 'Sefaria for Google Docs  - August 2024',
    includedTopics: [],
    sheetPath: '/sheets/584561?lang=en',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/20235182393244-Sefaria-for-Google-Docs'
  },
  {
    category: '',
    sheetTitle: 'Collaborating with Others',
    includedTopics: [],
    sheetPath: '/sheets/233017?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/articles/20533111968540-How-to-Use-Source-Sheet-Collections'
  },
  {
    category: '',
    sheetTitle: 'Formatting Sheets',
    includedTopics: [],
    sheetPath: '/sheets/218839?lang=bi',
    zendeskUrl: 'https://help.sefaria.org/hc/en-us/sections/20094783356956-The-Sheet-Editor'
  }
] as const;

/**
 * Hebrew Help sheet to Zendesk redirect mappings (Hebrew Help Center)
 * Maps old Hebrew help sheet URLs (.org.il) to new Zendesk help center URLs (Hebrew section)
 *
 * Usage in tests:
 * - Replace www.sefaria.org.il with SANDBOX_URL_IL (MODULE_URLS.HE.LIBRARY) in sheetPath
 * - Verify redirect to zendeskUrl (keep help.sefaria.org/hc/he/ unchanged)
 */
export const HELP_SHEET_REDIRECTS_HE: ReadonlyArray<HelpSheetRedirect> = [
  {
    sheetTitle: 'ביוגרפיות של חכמי המשנה והתלמוד',
    sheetPath: '/sheets/328503?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/articles/20234245638428-%D7%90%D7%99%D7%AA%D7%95%D7%A8-%D7%9E%D7%99%D7%93%D7%A2-%D7%91%D7%99%D7%95%D7%92%D7%A8%D7%A4%D7%99-%D7%90%D7%95%D7%93%D7%95%D7%AA-%D7%93%D7%9E%D7%95%D7%99%D7%95%D7%AA-%D7%9E%D7%94%D7%AA%D7%9C%D7%9E%D7%95%D7%93'
  },
  {
    sheetTitle: 'שימוש באפליקציה',
    sheetPath: '/sheets/243658?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/categories/19814642862876-%D7%94%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%99%D7%99%D7%A9%D7%95%D7%9E%D7%95%D7%9F-%D7%A1%D7%A4%D7%A8%D7%99%D7%90'
  },
  {
    sheetTitle: 'שימושים שונים במקורות בספריא',
    sheetPath: '/sheets/241176?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/sections/12756518640668-%D7%A9%D7%97%D7%96%D7%95%D7%A8-%D7%94%D7%93%D7%A4%D7%A1%D7%94-%D7%95%D7%94%D7%A4%D7%A6%D7%AA-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA'
  },
  {
    sheetTitle: 'שיתוף מקור, הוספת קישור, ושליחת משוב לספריא',
    sheetPath: '/sheets/288330?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/sections/12756518640668-%D7%A9%D7%97%D7%96%D7%95%D7%A8-%D7%94%D7%93%D7%A4%D7%A1%D7%94-%D7%95%D7%94%D7%A4%D7%A6%D7%AA-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA'
  },
  {
    sheetTitle: 'איך יוצרים דף מקורות בעורך החדש של ספריא?',
    sheetPath: '/sheets/399333?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/sections/20094783356956-%D7%99%D7%A6%D7%99%D7%A8%D7%AA-%D7%93%D7%A4%D7%99-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90'
  },
  {
    sheetTitle: 'הדפסת מקורות בספריא',
    sheetPath: '/sheets/242573?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/articles/18490652948508-%D7%94%D7%93%D7%A4%D7%A1%D7%AA-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9E%D7%94%D7%A1%D7%A4%D7%A8%D7%99%D7%99%D7%94'
  },
  {
    sheetTitle: 'מציאת מקור בספריא',
    sheetPath: '/sheets/244351?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/sections/12721846793116-%D7%92%D7%99%D7%A9%D7%94-%D7%9C%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA'
  },
  {
    sheetTitle: 'התאמה אישית של מקורות ותרגומים',
    sheetPath: '/sheets/615752?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/sections/12756520483868-%D7%90%D7%A4%D7%A9%D7%A8%D7%95%D7%99%D7%95%D7%AA-%D7%A4%D7%95%D7%A8%D7%9E%D7%98-%D7%98%D7%A7%D7%A1%D7%98-%D7%95%D7%A0%D7%92%D7%99%D7%A9%D7%95%D7%AA'
  },
  {
    sheetTitle: 'אפשרויות הנְּגִישׁוּת',
    sheetPath: '/sheets/239441?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/sections/12756520483868-%D7%90%D7%A4%D7%A9%D7%A8%D7%95%D7%99%D7%95%D7%AA-%D7%A4%D7%95%D7%A8%D7%9E%D7%98-%D7%98%D7%A7%D7%A1%D7%98-%D7%95%D7%A0%D7%92%D7%99%D7%A9%D7%95%D7%AA'
  },
  {
    sheetTitle: 'סרגל הקישורים והכלים של ספריא',
    sheetPath: '/sheets/288327?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/articles/18472472138652-%D7%94%D7%9E%D7%93%D7%A8%D7%99%D7%9A-%D7%94%D7%9E%D7%94%D7%99%D7%A8-%D7%9C%D7%A1%D7%A8%D7%92%D7%9C-%D7%94%D7%A7%D7%99%D7%A9%D7%95%D7%A8%D7%99%D7%9D-%D7%95%D7%94%D7%9B%D7%9C%D7%99%D7%9D'
  },
  {
    sheetTitle: 'התוסף של ספריא בגוגל דוקס',
    sheetPath: '/sheets/569973?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/categories/20332917021212-%D7%99%D7%A6%D7%99%D7%A8%D7%AA-%D7%93%D7%A4%D7%99-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%95%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%AA%D7%95%D7%A1%D7%A4%D7%99%D7%9D-%D7%9C%D7%93%D7%A4%D7%93%D7%A4%D7%9F'
  },
  {
    sheetTitle: 'הפעלת מגילת אימוג\'י ורעשן',
    sheetPath: '/sheets/382833?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/sections/12756538060956-%D7%A4%D7%99%D7%A6-%D7%A8%D7%99%D7%9D-%D7%9C%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%A2%D7%9D-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9E%D7%A1%D7%95%D7%99%D7%9E%D7%99%D7%9D'
  },
  {
    sheetTitle: 'אתר ספריא- עמודים עיקריים ומבנה האתר',
    sheetPath: '/sheets/332893?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/articles/18472380899484-%D7%94%D7%9E%D7%93%D7%A8%D7%99%D7%9A-%D7%94%D7%9E%D7%94%D7%99%D7%A8-%D7%9C%D7%A2%D7%9E%D7%95%D7%93-%D7%94%D7%91%D7%99%D7%AA'
  },
  {
    sheetTitle: 'קישוריות בין מקורות בספריא',
    sheetPath: '/sheets/242826?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/articles/18613227644316-%D7%90%D7%99%D7%AA%D7%95%D7%A8-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9E%D7%A7%D7%95%D7%A9%D7%A8%D7%99%D7%9D'
  },
  {
    sheetTitle: 'בחירת שפה בספריא',
    sheetPath: '/sheets/239814?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/categories/12721826687772-%D7%94%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90'
  },
  {
    sheetTitle: 'שימוש באסופות',
    sheetPath: '/sheets/293375?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/categories/20332917021212-%D7%99%D7%A6%D7%99%D7%A8%D7%AA-%D7%93%D7%A4%D7%99-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%95%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%AA%D7%95%D7%A1%D7%A4%D7%99%D7%9D-%D7%9C%D7%93%D7%A4%D7%93%D7%A4%D7%9F'
  },
  {
    sheetTitle: 'הוספה, עריכה ומחיקה של הערות בספריא',
    sheetPath: '/sheets/288326?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/sections/12756555356956-%D7%9B%D7%9C%D7%99%D7%9D-%D7%9C%D7%9C%D7%99%D7%9E%D7%95%D7%93-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90'
  },
  {
    sheetTitle: 'תרומה לספריא',
    sheetPath: '/sheets/242831.2?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/sections/17430252462236-%D7%A0%D7%99%D7%94%D7%95%D7%9C-%D7%AA%D7%A8%D7%95%D7%9E%D7%95%D7%AA-%D7%A9%D7%A0%D7%99%D7%AA%D7%A0%D7%95-%D7%9C%D7%A1%D7%A4%D7%A8%D7%99%D7%90'
  },
  {
    sheetTitle: 'היכרות ראשונית עם ספריא',
    sheetPath: '/sheets/541372.93?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/categories/13368526623132-%D7%9E%D7%99%D7%93%D7%A2-%D7%91%D7%A1%D7%99%D7%A1%D7%99-%D7%A2%D7%9C-%D7%A1%D7%A4%D7%A8%D7%99%D7%90'
  },
  {
    sheetTitle: 'יצירת קשר עם ספריא',
    sheetPath: '/sheets/542809.46?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/articles/21806344785308-%D7%99%D7%A6%D7%99%D7%A8%D7%AA-%D7%A7%D7%A9%D7%A8-%D7%A2%D7%9D-%D7%A1%D7%A4%D7%A8%D7%99%D7%90'
  },
  {
    sheetTitle: 'הדפסת מקורות בספריא',
    sheetPath: '/sheets/242573.1?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/articles/18490652948508-%D7%94%D7%93%D7%A4%D7%A1%D7%AA-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9E%D7%94%D7%A1%D7%A4%D7%A8%D7%99%D7%99%D7%94'
  },
  {
    sheetTitle: 'פרסום דפי מקורות',
    sheetPath: '/sheets/540832.8?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/sections/20094783356956-%D7%99%D7%A6%D7%99%D7%A8%D7%AA-%D7%93%D7%A4%D7%99-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90'
  },
  {
    sheetTitle: 'חיפוש מקור',
    sheetPath: '/sheets/244351.132?lang=he',
    zendeskUrl: 'https://help.sefaria.org/hc/he/sections/12721846793116-%D7%92%D7%99%D7%A9%D7%94-%D7%9C%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA'
  }
] as const;