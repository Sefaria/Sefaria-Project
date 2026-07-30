/* Testing done using Jest */
import Sefaria from '../sefaria';

describe('keyed interface strings', () => {
  const interfaceEn = require('../i18n/interface/en.json');
  const interfaceHe = require('../i18n/interface/he.json');
  const contextEn = require('../i18n/interface-context/en.json');
  const contextHe = require('../i18n/interface-context/he.json');
  // Keep in sync with Sefaria._keyedStringIdRegex in sefaria.js.
  const ID_RE = /^[a-z0-9_][a-zA-Z0-9_]*(\.[a-z0-9_][a-zA-Z0-9_]*)+$/;

  test('every key in every map is an ID matching the router regex', () => {
    [interfaceEn, interfaceHe, contextEn, contextHe].forEach(map =>
      Object.keys(map).forEach(id => expect(id).toMatch(ID_RE))
    );
  });

  test('ID shape accepts snake_case and camelCase but not capitalized data values', () => {
    ['header.log_in', 'sheets.1_person_likes_this_sheet',
     'search.exactMatchToggle.allResults'].forEach(id =>
      expect(Sefaria._isKeyedStringId(id)).toBe(true));
    // Capitalized data values reach Sefaria._() too; they must not route as IDs.
    ['Gen.1', 'b.Berakhot', 'Mishnah Berakhot', 'Some untranslated string',
     'common', 'e.g.'].forEach(s =>
      expect(Sefaria._isKeyedStringId(s)).toBe(false));
  });

  test('en.json and he.json cover the same IDs in each map', () => {
    expect(Object.keys(interfaceHe).sort()).toEqual(Object.keys(interfaceEn).sort());
    expect(Object.keys(contextHe).sort()).toEqual(Object.keys(contextEn).sort());
  });

  test('interface and interface-context define disjoint IDs', () => {
    const ctxIds = new Set(Object.keys(contextEn));
    Object.keys(interfaceEn).forEach(id => expect(ctxIds.has(id)).toBe(false));
  });

  test('no value is empty in the English source templates', () => {
    [interfaceEn, contextEn].forEach(map =>
      Object.entries(map).forEach(([id, v]) => {
        expect(typeof v).toBe('string');
        expect(v.length).toBeGreaterThan(0);
      })
    );
  });

  test('runtime map merges both directories', () => {
    Object.entries(interfaceEn).forEach(([id, v]) =>
      expect(Sefaria._i18nInterfaceStrings.en[id]).toBe(v));
    Object.entries(contextHe).forEach(([id, v]) =>
      expect(Sefaria._i18nInterfaceStrings.he[id]).toBe(v));
  });

  describe('Sefaria._ routing', () => {
    afterEach(() => { Sefaria.interfaceLang = 'english'; });

    test('keyed ID resolves to English in English interface', () => {
      Sefaria.interfaceLang = 'english';
      expect(Sefaria._('common.cancel')).toBe(interfaceEn['common.cancel']);
    });

    test('keyed ID resolves to Hebrew in Hebrew interface', () => {
      Sefaria.interfaceLang = 'hebrew';
      expect(Sefaria._('common.cancel')).toBe(interfaceHe['common.cancel']);
    });

    test('interface-context ID resolves like any other ID', () => {
      Sefaria.interfaceLang = 'hebrew';
      expect(Sefaria._('follow_button.follow')).toBe(contextHe['follow_button.follow']);
    });

    test('keyed ID missing a Hebrew value falls back to English', () => {
      Sefaria._i18nInterfaceStrings.en['test.fallback_only'] = 'Fallback Only';
      Sefaria.interfaceLang = 'hebrew';
      expect(Sefaria._('test.fallback_only')).toBe('Fallback Only');
      delete Sefaria._i18nInterfaceStrings.en['test.fallback_only'];
    });

    test('plain English sentences are left untouched in English interface', () => {
      Sefaria.interfaceLang = 'english';
      expect(Sefaria._('Some untranslated string')).toBe('Some untranslated string');
    });

    test('non-ID strings fall back to the terms dictionary in Hebrew', () => {
      Sefaria._translateTerms['Test Term XYZ'] = {en: 'Test Term XYZ', he: 'מונח בדיקה'};
      Sefaria.interfaceLang = 'hebrew';
      expect(Sefaria._('Test Term XYZ')).toBe('מונח בדיקה');
      delete Sefaria._translateTerms['Test Term XYZ'];
    });

    test('site-settings override common.site_name / common.library_name by ID', () => {
      const orig = Sefaria._siteSettings;
      Sefaria._siteSettings = {
        SITE_NAME: {en: 'MySite', he: 'האתר שלי'},
        LIBRARY_NAME: {en: 'MyLibrary', he: 'הספריה שלי'},
      };
      Sefaria._cacheSiteInterfaceStrings();
      Sefaria.interfaceLang = 'hebrew';
      expect(Sefaria._('common.site_name')).toBe('האתר שלי');
      Sefaria.interfaceLang = 'english';
      expect(Sefaria._('common.library_name')).toBe('MyLibrary');
      Sefaria._siteSettings = orig;
      Sefaria._i18nInterfaceStrings.en['common.site_name'] = interfaceEn['common.site_name'];
      Sefaria._i18nInterfaceStrings.he['common.site_name'] = interfaceHe['common.site_name'];
      Sefaria._i18nInterfaceStrings.en['common.library_name'] = interfaceEn['common.library_name'];
      Sefaria._i18nInterfaceStrings.he['common.library_name'] = interfaceHe['common.library_name'];
    });

    test('translateISOLanguageName translates known codes and passes unknown codes through', () => {
      Sefaria.interfaceLang = 'hebrew';
      expect(Sefaria.translateISOLanguageName('fr')).toBe(interfaceHe['languages.fr']);
      Sefaria.interfaceLang = 'english';
      expect(Sefaria.translateISOLanguageName('fr')).toBe('French');
      expect(Sefaria.translateISOLanguageName('zz')).toBe('zz');
    });
  });
});
