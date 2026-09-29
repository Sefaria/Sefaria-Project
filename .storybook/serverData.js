// Stand-in for the data Django writes into every page before sefaria.js runs.
// sefaria.js reads these two globals the moment it is imported (Sefaria.setup()
// at the bottom of static/js/sefaria/sefaria.js), so this file must be imported
// before anything that imports sefaria.js.
//
//   DJANGO_VARS.props  <- templates/base.html, built by base_props() in reader/views.py
//   DJANGO_DATA_VARS   <- /data.js, built by data_js() in sefaria/views.py
//
// Values mirror a logged-out visitor on the English Library site.

globalThis.DJANGO_VARS = {
  props: {
    _uid: null,
    _email: "",
    slug: "",
    is_moderator: false,
    is_editor: false,
    is_sustainer: false,
    experiments: false,
    full_name: "",
    profile_pic_url: "",
    is_history_enabled: true,
    following: [],
    blocking: [],
    calendars: [],
    notifications: [],
    saved: { loaded: false, items: [] },
    last_place: [],
    activeModule: "library",
    multiPanel: true,
    interfaceLang: "english",
    countryCode: "US",
    numLibraryTopics: 0,
    _debug: false,
    _debug_mode: null,
    domainModules: {
      en: { library: "https://www.sefaria.org", voices: "https://voices.sefaria.org" },
      he: { library: "https://www.sefaria.org.il", voices: "https://voices.sefaria.org.il" },
    },
    // From sites/sefaria/site_settings.py (HELP_CENTER_REDIRECTS left out for size).
    _siteSettings: {
      TORAH_SPECIFIC: true,
      SITE_NAME: { en: "Sefaria", he: "ספריא" },
      LIBRARY_NAME: { en: "The Sefaria Library", he: "האוסף של ספריא" },
      SUPPORTED_TRANSLATION_LANGUAGES: ["en", "es", "fr", "de"],
      COLLECTIONS_BUCKET: "sefaria-collection-images",
      PROFILES_BUCKET: "sefaria-profile-pictures",
      UGC_BUCKET: "sheet-user-uploaded-media",
      TOPICS_BUCKET: "img.sefaria.org",
      HELP_CENTER_URLS: {
        EN_US: "https://help.sefaria.org/hc/en-us",
        HE: "https://help.sefaria.org/hc/he",
      },
      ABOUT_SIDEBAR_PAGES: [],
      WHAT_ARE_VOICES_PATHS: { en: "/sheets/674324", he: "/sheets/674327" },
      MODULE_SWITCHER_LEARN_MORE_PATH: { en: "/sheets/689609", he: "/sheets/689610" },
      HELP_CENTER_REDIRECTS: { en: {}, he: {} },
    },
  },
  inReaderApp: true,
};

// The real /data.js is ~9 MB, almost all of it the library table of contents and
// book list. Start empty; add a trimmed slice only if stories turn out to need it.
globalThis.DJANGO_DATA_VARS = {
  _dataLoaded: true,
  toc: [],
  topic_toc: [],
  terms: {},
  books: [],
  searchIndexText: "text",
  searchIndexSheet: "sheet",
  virtualBooks: [],
};

globalThis.STRAPI_INSTANCE = null;
