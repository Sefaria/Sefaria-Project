import NUSACH_MAP from '../siddurNusachMap.json';
import {
  NUSACHIM,
  NUSACH_BOOKS,
  defaultNusach,
  getStoredNusach,
  getStoredReaderMode,
  hasSeenNusachPicker,
  isSiddurModeActive,
  isSiddurBook,
  mapRefToNusach,
  markNusachPickerSeen,
  normalizeSiddurRef,
  nusachDebugParams,
  nusachForBook,
  parseSiddurRef,
  readerModeFor,
  serviceForHour,
  serviceStartRef,
  setStoredNusach,
  setStoredReaderMode,
  shouldShowLandingPicker,
  siddurContentLang,
  siddurVersions,
  timeOfDayRef,
  trackSiddurEvent,
} from '../siddurNusach';

const K = "The Koren Shalem Siddur; Ashkenaz, ";
const S = "Siddur Sefard, ";
const E = "Siddur Edot HaMizrach, ";
const allSections = NUSACH_MAP.sections.concat(NUSACH_MAP.partialSections);
const sectionByKey = Object.fromEntries(allSections.map(s => [s.key, s]));

describe('books', () => {
  test('the three spec books, and only those, are siddurim with a nusach', () => {
    expect(nusachForBook("The Koren Shalem Siddur; Ashkenaz")).toBe("ashkenaz");
    expect(nusachForBook("Siddur Sefard")).toBe("sfard");
    expect(nusachForBook("Siddur Edot HaMizrach")).toBe("edot");
    expect(isSiddurBook("Siddur Ashkenaz")).toBe(false);
    expect(isSiddurBook("Genesis")).toBe(false);
    expect(isSiddurBook(null)).toBe(false);
  });
});

describe('defaultNusach', () => {
  test('Israel by IP or the Hebrew site gets Edot HaMizrach', () => {
    expect(defaultNusach({countryCode: "il", interfaceLang: "english"})).toBe("edot");
    expect(defaultNusach({countryCode: "IL", interfaceLang: "english"})).toBe("edot");
    expect(defaultNusach({countryCode: "us", interfaceLang: "hebrew"})).toBe("edot");
  });
  test('everyone else gets Ashkenaz', () => {
    expect(defaultNusach({countryCode: "us", interfaceLang: "english"})).toBe("ashkenaz");
    expect(defaultNusach({countryCode: null, interfaceLang: "english"})).toBe("ashkenaz");
    expect(defaultNusach()).toBe("ashkenaz");
  });
});

describe('time-of-day routing', () => {
  test.each([
    [0, "shacharit"], [11, "shacharit"], [12, "mincha"], [18, "mincha"], [19, "arvit"], [23, "arvit"],
  ])('hour %i -> %s', (hour, service) => {
    expect(serviceForHour(hour)).toBe(service);
  });
  test.each([
    ["11:59", "shacharit"], ["12:00", "mincha"], ["18:59", "mincha"], ["19:00", "arvit"],
  ])('%s local time opens %s', (hm, service) => {
    const [h, m] = hm.split(":").map(Number);
    NUSACHIM.forEach(n => {
      expect(timeOfDayRef(n, new Date(2026, 8, 27, h, m))).toBe(NUSACH_BOOKS[n].services[service]);
    });
  });
  test('service start refs', () => {
    expect(serviceStartRef("sfard", "mincha")).toBe(S + "Weekday Mincha, Korbanot");
    expect(serviceStartRef("ashkenaz", "arvit")).toBe(K + "Weekdays, Ma'ariv for Weekdays");
    expect(serviceStartRef("edot", "shacharit")).toBe(E + "Preparatory Prayers, Modeh Ani");
    expect(serviceStartRef("edot", "musaf")).toBe("Siddur Edot HaMizrach");
    expect(serviceStartRef("nope", "mincha")).toBe(null);
  });
});

describe('content language and versions', () => {
  test('Hebrew on the Hebrew site, English on .org', () => {
    expect(siddurContentLang("hebrew", "ashkenaz")).toBe("he");
    expect(siddurContentLang("english", "ashkenaz")).toBe("en");
    expect(siddurContentLang("english", "x", {x: {hasEnglish: false}})).toBe("he");
  });
  test('Edot pins a real English version; others use defaults', () => {
    expect(siddurVersions("edot").en.versionTitle).toBe("Sefaria Community Translation");
    expect(siddurVersions("edot").he).toBe(null);
    expect(siddurVersions("ashkenaz")).toEqual({en: null, he: null});
  });
});

describe('parseSiddurRef', () => {
  test('splits a trailing paragraph or range', () => {
    expect(parseSiddurRef(S + "Weekday Mincha, Amidah 3")).toEqual({path: S + "Weekday Mincha, Amidah", segment: 3});
    expect(parseSiddurRef(S + "Weekday Mincha, Amidah 3-5")).toEqual({path: S + "Weekday Mincha, Amidah", segment: 3});
    expect(parseSiddurRef(K + "Weekdays, Minha for Weekdays")).toEqual({path: K + "Weekdays, Minha for Weekdays", segment: null});
  });
  test('normalizes underscores and Sefard trailing-space titles', () => {
    expect(normalizeSiddurRef("Siddur Sefard, Motzaei Shabbat , Havdala")).toBe("Siddur Sefard, Motzaei Shabbat, Havdala");
    expect(parseSiddurRef("Siddur_Sefard,_Weekday_Mincha,_Amidah_2").path).toBe(S + "Weekday Mincha, Amidah");
  });
  test('no leaf title ends in a number, so a trailing number is always a paragraph', () => {
    NUSACHIM.forEach(n => NUSACH_MAP.positions[n].forEach(p => expect(parseSiddurRef(p.ref).segment).toBe(null)));
  });
});

describe('the nusach map', () => {
  const belongsTo = (ref, n) => ref === NUSACH_BOOKS[n].title || ref.startsWith(NUSACH_BOOKS[n].title + ", ");

  test('every ref belongs to its own book', () => {
    allSections.forEach(section => NUSACHIM.forEach(n => {
      if (section.refs[n]) { expect(belongsTo(section.refs[n], n)).toBe(true); }
    }));
    NUSACHIM.forEach(n => {
      NUSACH_MAP.positions[n].forEach(p => expect(belongsTo(p.ref, n)).toBe(true));
      Object.values(NUSACH_BOOKS[n].services).forEach(ref => expect(belongsTo(ref, n)).toBe(true));
    });
  });
  test('every section ref and service start is a leaf listed in positions', () => {
    NUSACHIM.forEach(n => {
      const leaves = new Set(NUSACH_MAP.positions[n].map(p => normalizeSiddurRef(p.ref)));
      allSections.forEach(section => {
        if (section.refs[n]) { expect(leaves).toContain(parseSiddurRef(section.refs[n]).path); }
      });
      Object.values(NUSACH_BOOKS[n].services).forEach(ref => expect(leaves).toContain(normalizeSiddurRef(ref)));
    });
  });
  test('anchors and fallbacks name real sections; shared sections are in all three books', () => {
    NUSACHIM.forEach(n => NUSACH_MAP.positions[n].forEach(p => {
      if (p.anchor) { expect(sectionByKey).toHaveProperty([p.anchor]); }
      (p.segAnchors || []).forEach(([seg, key]) => { expect(seg).toBeGreaterThan(1); expect(sectionByKey).toHaveProperty([key]); });
    }));
    allSections.forEach(s => { if (s.fallback) { expect(sectionByKey).toHaveProperty([s.fallback]); } });
    NUSACH_MAP.sections.forEach(s => NUSACHIM.forEach(n => expect(s.refs[n]).toBeTruthy()));
  });
});

describe('mapRefToNusach', () => {
  test('same book returns the ref unchanged', () => {
    expect(mapRefToNusach(S + "Weekday Mincha, Amidah 4", "sfard")).toBe(S + "Weekday Mincha, Amidah 4");
  });
  test('maps a whole leaf to the equivalent section', () => {
    expect(mapRefToNusach(S + "Weekday Shacharit, Amidah", "ashkenaz")).toBe(K + "Weekdays, The Amida");
    expect(mapRefToNusach(K + "Weekdays, The Amida", "edot")).toBe(E + "Weekday Shacharit, Amida");
  });
  test('uses paragraph anchors inside Koren single-leaf services', () => {
    // Koren Minha is one leaf: Ashrei 1, Amidah 9, Tachanun 96, Aleinu 120.
    expect(mapRefToNusach(K + "Weekdays, Minha for Weekdays 50", "sfard")).toBe(S + "Weekday Mincha, Amidah");
    expect(mapRefToNusach(K + "Weekdays, Minha for Weekdays 8", "sfard")).toBe(S + "Weekday Mincha, Korbanot 23");
    expect(mapRefToNusach(K + "Weekdays, Minha for Weekdays 125-127", "edot")).toBe(E + "Weekday Mincha, Alenu");
    expect(mapRefToNusach(S + "Weekday Mincha, Amidah 12", "ashkenaz")).toBe(K + "Weekdays, Minha for Weekdays 9");
  });
  test('uses the last anchor at or before the paragraph', () => {
    // Sefard's 15 morning blessings start at paragraph 8 of "Blessings on Torah".
    expect(mapRefToNusach(S + "Weekday Shacharit, Blessings on Torah 3", "ashkenaz")).toBe(K + "Weekdays, Blessings Over the Torah");
    expect(mapRefToNusach(S + "Weekday Shacharit, Blessings on Torah 8", "ashkenaz")).toBe(K + "Weekdays, Morning Blessings");
    expect(mapRefToNusach(S + "Weekday Shacharit, Blessings on Torah 20", "ashkenaz")).toBe(K + "Weekdays, Morning Blessings");
  });
  test('follows rite order differences instead of position', () => {
    // Ashkenaz says Aleinu before Shir shel Yom; Sfard after.
    expect(mapRefToNusach(K + "Weekdays, Conclusion of the Service 31", "sfard")).toBe(sectionByKey["shacharit/aleinu"].refs.sfard);
    expect(mapRefToNusach(K + "Weekdays, The Daily Psalm", "sfard")).toBe(sectionByKey["shacharit/song-of-the-day"].refs.sfard);
  });
  test('a section missing from the target falls back to its fallback section', () => {
    expect(mapRefToNusach(S + "Weekday Shacharit, Beit Yaakov", "ashkenaz"))
        .toBe(sectionByKey["shacharit/song-of-the-day"].refs.ashkenaz);
    expect(mapRefToNusach(E + "Weekday Mincha, Offerings 3", "ashkenaz")).toBe(K + "Weekdays, Minha for Weekdays");
  });
  test('resolves Sefard refs in their canonical trailing-space form', () => {
    const trimmed = mapRefToNusach(S + "Motzaei Shabbat, Havdala 2", "edot");
    expect(trimmed.startsWith(E)).toBe(true);
    expect(mapRefToNusach(S + "Motzaei Shabbat , Havdala 2", "edot")).toBe(trimmed);
  });
  test('a non-leaf node maps via its first leaf', () => {
    expect(mapRefToNusach(S + "Weekday Mincha", "ashkenaz")).toBe(K + "Weekdays, Minha for Weekdays");
  });
  test('unmapped areas and unknown refs go to the start of the target book', () => {
    expect(mapRefToNusach(K + "Preface", "sfard")).toBe("Siddur Sefard");
    expect(mapRefToNusach(K + "No Such Node", "edot")).toBe("Siddur Edot HaMizrach");
    expect(mapRefToNusach("Genesis 1:1", "edot")).toBe("Siddur Edot HaMizrach");
    expect(mapRefToNusach(S + "Weekday Mincha", "nope")).toBe(null);
  });
  test('falls back to the service start when no section in the chain exists in the target', () => {
    const map = {
      books: NUSACH_BOOKS,
      sections: [{key: "mincha/x", service: "mincha", refs: {sfard: S + "Weekday Mincha, Amidah", ashkenaz: null, edot: null}}],
      positions: {sfard: [{ref: S + "Weekday Mincha, Amidah", anchor: "mincha/x"}], ashkenaz: [], edot: []},
    };
    expect(mapRefToNusach(S + "Weekday Mincha, Amidah 2", "ashkenaz", {map})).toBe(NUSACH_BOOKS.ashkenaz.services.mincha);
    map.sections[0].service = "shabbat-day";
    expect(mapRefToNusach(S + "Weekday Mincha, Amidah 2", "ashkenaz", {map})).toBe(NUSACH_BOOKS.ashkenaz.title);
  });
  test('every mapped leaf in every book resolves to a ref in each target book', () => {
    NUSACHIM.forEach(src => NUSACH_MAP.positions[src].forEach(p => NUSACHIM.forEach(dst => {
      const out = mapRefToNusach(p.ref, dst);
      expect(out === NUSACH_BOOKS[dst].title || out.startsWith(NUSACH_BOOKS[dst].title + ", ")).toBe(true);
    })));
  });
});

describe('shouldShowLandingPicker', () => {
  const base = {isSiddur: true, mode: "Text", multiPanel: false, savedNusach: null, seenPicker: false, forcePicker: false};
  test('new mobile readers of a siddur see it', () => {
    expect(shouldShowLandingPicker(base)).toBe(true);
  });
  test.each([
    ["not a siddur", {isSiddur: false}],
    ["not in text mode", {mode: "TextAndConnections"}],
    ["desktop", {multiPanel: true}],
    ["already has a nusach", {savedNusach: "sfard"}],
    ["already saw the picker", {seenPicker: true}],
  ])('hidden when %s', (_, overrides) => {
    expect(shouldShowLandingPicker({...base, ...overrides})).toBe(false);
  });
  test('the debug param forces it on desktop and for returning readers, but only on siddur text', () => {
    expect(shouldShowLandingPicker({...base, multiPanel: true, savedNusach: "edot", seenPicker: true, forcePicker: true})).toBe(true);
    expect(shouldShowLandingPicker({...base, isSiddur: false, forcePicker: true})).toBe(false);
  });
});

describe('debug params', () => {
  test('reads nusachPicker and nusachCountry', () => {
    expect(nusachDebugParams("?nusachPicker=1&nusachCountry=il")).toEqual({forcePicker: true, countryCode: "il"});
    expect(nusachDebugParams("?lang=he")).toEqual({forcePicker: false, countryCode: null});
    expect(nusachDebugParams("")).toEqual({forcePicker: false, countryCode: null});
  });
});

describe('storage helpers', () => {
  beforeEach(() => localStorage.clear());
  test('store only valid nusachim and remember that the picker was seen', () => {
    expect(getStoredNusach()).toBe(null);
    expect(hasSeenNusachPicker()).toBe(false);
    setStoredNusach("bogus");
    expect(getStoredNusach()).toBe(null);
    setStoredNusach("sfard");
    markNusachPickerSeen();
    expect(getStoredNusach()).toBe("sfard");
    expect(hasSeenNusachPicker()).toBe(true);
  });
  test('survive a storage that throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error("blocked"); });
    expect(getStoredNusach()).toBe(null);
    expect(hasSeenNusachPicker()).toBe(false);
    spy.mockRestore();
  });
});

describe('Siddur Mode / Learning Mode', () => {
  beforeEach(() => localStorage.clear());
  test('siddurim default to Siddur Mode', () => {
    expect(readerModeFor({isSiddur: true, storedMode: null})).toBe("siddur");
    expect(readerModeFor({isSiddur: true, storedMode: "bogus"})).toBe("siddur");
    NUSACHIM.forEach(n => expect(isSiddurModeActive({book: NUSACH_BOOKS[n].title, storedMode: null})).toBe(true));
  });
  test('a stored choice overrides the default both ways', () => {
    expect(readerModeFor({isSiddur: true, storedMode: "learning"})).toBe("learning");
    expect(readerModeFor({isSiddur: true, storedMode: "siddur"})).toBe("siddur");
    expect(isSiddurModeActive({book: "Siddur Sefard", storedMode: "learning"})).toBe(false);
    expect(isSiddurModeActive({book: "Siddur Sefard", storedMode: "siddur"})).toBe(true);
  });
  test('non-siddur books are always Learning Mode', () => {
    ["Genesis", "Siddur Ashkenaz", null, undefined].forEach(book => {
      expect(isSiddurModeActive({book, storedMode: null})).toBe(false);
      expect(isSiddurModeActive({book, storedMode: "siddur"})).toBe(false);
    });
    expect(readerModeFor({isSiddur: false, storedMode: "siddur"})).toBe("learning");
  });
  test('stores only valid modes and survives a storage that throws', () => {
    expect(getStoredReaderMode()).toBe(null);
    setStoredReaderMode("bogus");
    expect(getStoredReaderMode()).toBe(null);
    setStoredReaderMode("learning");
    expect(getStoredReaderMode()).toBe("learning");
    expect(localStorage.getItem("siddur.mode")).toBe("learning");
    setStoredReaderMode("siddur");
    expect(getStoredReaderMode()).toBe("siddur");
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error("blocked"); });
    expect(getStoredReaderMode()).toBe(null);
    spy.mockRestore();
  });
});

describe('trackSiddurEvent', () => {
  afterEach(() => { delete window.gtag; });
  test('is a no-op when gtag is not defined (GOOGLE_GTAG unset)', () => {
    delete window.gtag;
    expect(() => trackSiddurEvent("nusach_picker", {origin: "landing"})).not.toThrow();
  });
  test('sends a GA4 event when gtag is defined', () => {
    window.gtag = jest.fn();
    trackSiddurEvent("nusach_picker", {origin: "toc", choice: "sfard"});
    expect(window.gtag).toHaveBeenCalledWith("event", "nusach_picker", {origin: "toc", choice: "sfard"});
  });
});
