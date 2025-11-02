const sefariaStub = {
  interfaceLang: "english",
  _siteSettings: { TORAH_SPECIFIC: false },
  _uid: null,
  _debug: false,
  activeModule: "library",
  LIBRARY_MODULE: "library",
  VOICES_MODULE: "voices",
  domainModules: {
    library: "https://www.sefaria.org",
    voices: "https://voices.sefaria.org",
    developer: "https://developer.sefaria.org",
  },
  apiHost: "https://www.sefaria.org",
  _: (input) => input,
  _r: (ref) => ref,
  _v: (value) => {
    if (!value || typeof value !== "object") {
      return value;
    }
    const langKey = sefariaStub.interfaceLang === "hebrew" ? "he" : "en";
    return value[langKey] ?? value.en ?? value.he ?? null;
  },
  util: {
    currentPath: () => "/",
    fullURL: (relativePath, moduleTarget) => {
      if (!relativePath) {
        return relativePath;
      }
      if (!relativePath.startsWith("/")) {
        return relativePath;
      }
      const moduleUrl = sefariaStub.getModuleURL(moduleTarget);
      try {
        return new URL(relativePath, moduleUrl ?? sefariaStub.apiHost).href;
      } catch {
        return relativePath;
      }
    },
    naturalTime: () => "moments ago",
    localeDate: (isoDate) =>
      new Date(isoDate || Date.now()).toLocaleDateString(),
    normRef: (ref) => ref,
    getUrlVersionsParams: () => "",
  },
  palette: {
    categoryColor: () => "#3366cc",
    refColor: () => "#3366cc",
  },
  categoryAttribution: () => null,
  track: {
    event: () => {},
    sheets: () => {},
  },
  getSavedItem: () => null,
  toggleSavedItem: () => Promise.resolve(),
  displayTopicTocCategory: () => ({ slug: "main-menu" }),
  getModuleURL: (moduleTarget = null) => {
    const moduleKey = moduleTarget || sefariaStub.activeModule;
    const href =
      sefariaStub.domainModules?.[moduleKey] ?? sefariaStub.apiHost ?? "";
    try {
      return new URL(href);
    } catch {
      return new URL(sefariaStub.apiHost || "https://www.sefaria.org");
    }
  },
  topic_toc: [],
  toc: [],
  is_moderator: false,
  isReturningVisitor: () => false,
  isNewVisitor: () => true,
  _siteSettingsCache: {},
  _analytics: {},
  hebrew: {
    isHebrew: (text) => /[֐-׿]/.test(text ?? ""),
  },
};

export default sefariaStub;
