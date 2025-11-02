const sefariaStub = {
  interfaceLang: "english",
  _siteSettings: { TORAH_SPECIFIC: false },
  _uid: null,
  _debug: false,
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
  track: {
    event: () => {},
    sheets: () => {},
  },
  getSavedItem: () => null,
  toggleSavedItem: () => Promise.resolve(),
  displayTopicTocCategory: () => ({ slug: "main-menu" }),
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
