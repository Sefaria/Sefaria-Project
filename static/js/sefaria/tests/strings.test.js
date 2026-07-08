/* Testing done using Jest */
import Sefaria from '../sefaria';

describe('keyed interface strings', () => {
  const keyedEn = require('../i18n/keyed/en.json');
  const keyedHe = require('../i18n/keyed/he.json');
  const englishToId = require('../i18n/keyed/english-to-id.json');
  const legacyFlat = require('../i18n/interface/he.json');
  const legacyFlatTemplate = require('../i18n/interface/en.json');
  const legacyCtx = require('../i18n/interface-context/he.json');
  const legacyCtxTemplate = require('../i18n/interface-context/en.json');
  const ID_RE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

  test('every keyed ID matches the router regex', () => {
    Object.keys(keyedEn).forEach(id => expect(id).toMatch(ID_RE));
  });

  test('keyed en.json and he.json cover the same IDs', () => {
    expect(Object.keys(keyedHe).sort()).toEqual(Object.keys(keyedEn).sort());
  });

  test('english-to-id entries point at existing keyed IDs', () => {
    Object.values(englishToId).forEach(id => expect(keyedEn).toHaveProperty([id]));
  });

  test('no legacy key matches the ID regex (router stays unambiguous)', () => {
    Object.keys(legacyFlat).forEach(k => expect(k).not.toMatch(ID_RE));
    Object.values(legacyCtx).forEach(ns =>
      Object.keys(ns).forEach(k => expect(k).not.toMatch(ID_RE))
    );
  });

  test('legacy Weblate templates (en.json) mirror the runtime maps (he.json)', () => {
    expect(Object.keys(legacyFlatTemplate).sort()).toEqual(Object.keys(legacyFlat).sort());
    expect(Object.keys(legacyCtxTemplate).sort()).toEqual(Object.keys(legacyCtx).sort());
    Object.keys(legacyCtx).forEach(ns => {
      expect(Object.keys(legacyCtxTemplate[ns]).sort()).toEqual(Object.keys(legacyCtx[ns]).sort());
    });
  });

  describe('Sefaria._ routing', () => {
    afterEach(() => { Sefaria.interfaceLang = 'english'; });

    test('keyed ID resolves to English in English interface', () => {
      Sefaria.interfaceLang = 'english';
      expect(Sefaria._('common.cancel')).toBe(keyedEn['common.cancel']);
    });

    test('keyed ID resolves to Hebrew in Hebrew interface', () => {
      Sefaria.interfaceLang = 'hebrew';
      expect(Sefaria._('common.cancel')).toBe(keyedHe['common.cancel']);
    });

    test('keyed ID missing a Hebrew value falls back to English', () => {
      Sefaria._i18nKeyedStrings.en['test.fallback_only'] = 'Fallback Only';
      Sefaria.interfaceLang = 'hebrew';
      expect(Sefaria._('test.fallback_only')).toBe('Fallback Only');
      delete Sefaria._i18nKeyedStrings.en['test.fallback_only'];
    });

    test('legacy English text still translates via the legacy flat map', () => {
      const [en, he] = Object.entries(legacyFlat)[0];
      Sefaria.interfaceLang = 'hebrew';
      expect(Sefaria._(en)).toBe(he);
    });

    test('dynamic lookup of a migrated English string resolves through english-to-id', () => {
      const [en, id] = Object.entries(englishToId)[0];
      Sefaria.interfaceLang = 'hebrew';
      expect(Sefaria._(en)).toBe(keyedHe[id]);
    });

    test('plain English sentences are left untouched in English interface', () => {
      Sefaria.interfaceLang = 'english';
      expect(Sefaria._('Some untranslated string')).toBe('Some untranslated string');
    });
  });
});
