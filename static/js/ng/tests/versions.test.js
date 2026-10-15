import {
  byPriority, currVersionsWith, flattenVersions, groupVersions, languageAfterVersionChoice, languageName, sameVersion,
  versionDisplayTitle, versionFullTitle, versionNotes,
} from '../versions';
import {DEFAULT_SETTINGS, fontSizeLevel, stepFontSize} from '../settings';

const v = (o) => ({languageFamilyName: 'english', language: 'en', actualLanguage: 'en', isSource: false, ...o});

describe('ordering, never choosing', () => {
  test('byPriority: higher first, missing counts as 0, API order breaks ties', () => {
    const list = [v({versionTitle: 'a'}), v({versionTitle: 'b', priority: 3}), v({versionTitle: 'c', priority: 0}), v({versionTitle: 'd', priority: 3})];
    expect(byPriority(list).map(x => x.versionTitle)).toEqual(['b', 'd', 'a', 'c']);
  });

  test('groupVersions: sources apart; translations by language, the preference, then English, then A-Z', () => {
    const byLanguage = {
      he: [v({versionTitle: 'src2', isSource: true, priority: 1, language: 'he', actualLanguage: 'he'}),
        v({versionTitle: 'src1', isSource: true, priority: 2, language: 'he', actualLanguage: 'he'}),
        v({versionTitle: 'Yiddish-ish', isSource: false, language: 'he', actualLanguage: 'yi', languageFamilyName: 'yiddish'})],
      en: [v({versionTitle: 'en1', priority: 1}), v({versionTitle: 'en2', priority: 4})],
      de: [v({versionTitle: 'de1 [de]', actualLanguage: 'de', languageFamilyName: 'german'})],
      fr: [v({versionTitle: 'fr1 [fr]', actualLanguage: 'fr', languageFamilyName: 'french'})],
    };
    const {sources, translations} = groupVersions(byLanguage, {translationLanguagePreference: 'fr'});
    expect(sources.map(x => x.versionTitle)).toEqual(['src1', 'src2']);
    expect(translations.map(g => g.lang)).toEqual(['fr', 'en', 'de', 'yi']);
    expect(translations[1].versions.map(x => x.versionTitle)).toEqual(['en2', 'en1']);
    expect(groupVersions(byLanguage).translations.map(g => g.lang)).toEqual(['en', 'fr', 'de', 'yi']);
    expect(groupVersions(null)).toEqual({sources: [], translations: []});
  });

  test('flattenVersions accepts the bucketed shape or a plain list', () => {
    expect(flattenVersions({a: [1], b: [2, 3]})).toEqual([1, 2, 3]);
    expect(flattenVersions([1, 2])).toEqual([1, 2]);
  });
});

describe('labels', () => {
  test('display title: short title, Hebrew in a Hebrew interface, no [xx] suffix', () => {
    const jps = v({versionTitle: 'THE JPS TANAKH: Gender-Sensitive Edition', shortVersionTitle: 'Revised JPS, 2023'});
    expect(versionDisplayTitle(jps)).toBe('Revised JPS, 2023');
    expect(versionFullTitle(jps)).toBe('THE JPS TANAKH: Gender-Sensitive Edition');
    expect(versionDisplayTitle(v({versionTitle: 'Bible du Rabbinat 1899 [fr]'}))).toBe('Bible du Rabbinat 1899');
    expect(versionFullTitle(v({versionTitle: 'Bible du Rabbinat 1899 [fr]'}))).toBe('');
    const mam = v({versionTitle: 'Miqra according to the Masorah', versionTitleInHebrew: 'מקרא על פי המסורה'});
    expect(versionDisplayTitle(mam, 'hebrew')).toBe('מקרא על פי המסורה');
    expect(versionDisplayTitle(mam, 'english')).toBe('Miqra according to the Masorah');
    expect(versionNotes(v({versionNotes: 'en', versionNotesInHebrew: 'he'}), 'hebrew')).toBe('he');
    expect(versionNotes(v({versionNotes: 'en'}), 'hebrew')).toBe('en');
  });

  test('language names in the interface language, falling back to the family name', () => {
    expect(languageName('es')).toBe('Spanish');
    expect(languageName('es', 'hebrew')).toBe('ספרדית');
    expect(languageName('', 'english', 'ladino')).toBe('Ladino');
  });

  test('sameVersion: title within a language family', () => {
    expect(sameVersion({versionTitle: 'X', languageFamilyName: 'english'}, {versionTitle: 'X', languageFamilyName: 'english'})).toBe(true);
    expect(sameVersion({versionTitle: 'X', languageFamilyName: 'english'}, {versionTitle: 'X', languageFamilyName: 'french'})).toBe(false);
    expect(sameVersion({versionTitle: 'X'}, null)).toBe(false);
  });
});

describe('choosing', () => {
  test('a translation fills currVersions.en (any language); a source fills he', () => {
    const es = v({versionTitle: 'El Pentateuco [es]', languageFamilyName: 'spanish', actualLanguage: 'es'});
    expect(currVersionsWith({en: null, he: null}, es)).toEqual({en: {languageFamilyName: 'spanish', versionTitle: 'El Pentateuco [es]'}, he: null});
    const src = v({versionTitle: 'MAM', languageFamilyName: 'hebrew', isSource: true});
    expect(currVersionsWith({en: {versionTitle: 'x', languageFamilyName: 'english'}, he: null}, src))
      .toEqual({en: {versionTitle: 'x', languageFamilyName: 'english'}, he: {languageFamilyName: 'hebrew', versionTitle: 'MAM'}});
  });

  test('the chosen version becomes visible, as ReaderApp._getPanelLangOnVersionChange', () => {
    expect(languageAfterVersionChoice('hebrew', false)).toBe('bilingual');
    expect(languageAfterVersionChoice('english', true)).toBe('bilingual');
    expect(languageAfterVersionChoice('english', false)).toBe('english');
    expect(languageAfterVersionChoice('hebrew', true)).toBe('hebrew');
    expect(languageAfterVersionChoice('bilingual', false)).toBe('bilingual');
  });
});

describe('font size', () => {
  test('steps by 1.15 on a grid from the default, two down and five up', () => {
    expect(stepFontSize(62.5, 'larger')).toBe(71.875);
    expect(stepFontSize(71.875, 'smaller')).toBe(62.5);
    let size = DEFAULT_SETTINGS.fontSize;
    for (let i = 0; i < 10; i++) { size = stepFontSize(size, 'larger'); }
    expect(fontSizeLevel(size)).toBe(5);
    for (let i = 0; i < 10; i++) { size = stepFontSize(size, 'smaller'); }
    expect(fontSizeLevel(size)).toBe(-2);
    expect(stepFontSize(size, 'smaller')).toBe(size);
  });
  test('an off-grid classic value snaps back onto the grid', () => {
    expect(stepFontSize(82.65625000000001, 'smaller')).toBe(71.875);
  });
});
