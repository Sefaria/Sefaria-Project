/** Seed the real data layer with a tiny TOC and canned API answers (no network in jest). */
import Sefaria from '../../../sefaria/sefaria';

export const TOC = [
  { category: 'Tanakh', heCategory: 'תנ"ך', order: 5, enDesc: 'The Hebrew Bible.', heDesc: 'המקרא.', enShortDesc: 'Torah, Prophets, and Writings.', heShortDesc: 'תורה, נביאים וכתובים.',
    contents: [
      { category: 'Torah', heCategory: 'תורה', enDesc: 'Five Books of Moses', heDesc: 'חמישה חומשים', enShortDesc: 'The Five Books of Moses', heShortDesc: '',
        contents: [
          { title: 'Genesis', heTitle: 'בראשית', categories: ['Tanakh', 'Torah'], primary_category: 'Tanakh', enShortDesc: 'Creation.', heShortDesc: 'בריאה.', order: 1 },
          { title: 'Exodus', heTitle: 'שמות', categories: ['Tanakh', 'Torah'], primary_category: 'Tanakh', enShortDesc: 'Egypt.', heShortDesc: 'מצרים.', order: 2 },
          { title: 'Job', heTitle: 'איוב', categories: ['Tanakh', 'Torah'], primary_category: 'Tanakh', enShortDesc: '', heShortDesc: '', order: 3 },
        ] },
      { category: 'Commentary', heCategory: 'פרשנות', contents: [
        { title: 'Rashi on Genesis', heTitle: 'רש"י על בראשית', categories: ['Tanakh', 'Commentary', 'Rashi'], primary_category: 'Commentary', dependence: 'Commentary' },
      ] },
    ] },
  { category: 'Talmud', heCategory: 'תלמוד', order: 15, enShortDesc: 'Rabbinic debate.', heShortDesc: 'דיוני חז"ל.',
    contents: [{ category: 'Bavli', heCategory: 'בבלי', contents: [
      { title: 'Berakhot', heTitle: 'ברכות', categories: ['Talmud', 'Bavli'], primary_category: 'Talmud', enShortDesc: 'Blessings.', heShortDesc: 'ברכות.' },
    ] }] },
  { category: 'Hidden', heCategory: 'נסתר', hidden: true, contents: [] },
];

export const GENESIS = {
  title: 'Genesis', heTitle: 'בראשית', categories: ['Tanakh', 'Torah'], heCategories: ['תנ"ך', 'תורה'],
  enDesc: 'Genesis is the first book of the Torah.', heDesc: 'ספר בראשית הוא הספר הראשון.', enShortDesc: 'Creation.', heShortDesc: 'בריאה.',
  authors: [], compDateString: { en: ' (c.1400 – c.400 BCE)', he: ' (1400 – 400 לפנה"ס)' }, compPlaceString: { en: 'Sinai/Canaan', he: 'סיני / כנען' },
  firstSectionRef: 'Genesis 1', sectionNames: ['Chapter', 'Verse'], depth: 2,
  schema: { nodeType: 'JaggedArrayNode', depth: 2, addressTypes: ['Perek', 'Pasuk'], sectionNames: ['Chapter', 'Verse'], heSectionNames: ['פרק', 'פסוק'], lengths: [3, 80], content_counts: [31, 25, 24], title: 'Genesis', heTitle: 'בראשית' },
  alts: { Parasha: { title: 'Genesis', heTitle: 'בראשית', nodes: [
    { nodeType: 'ArrayMapNode', title: 'Bereshit', heTitle: 'בראשית', wholeRef: 'Genesis 1:1-6:8', refs: ['Genesis 1:1-2:3', 'Genesis 2:4-2:19'] },
    { nodeType: 'ArrayMapNode', title: 'Noach', heTitle: 'נח', wholeRef: 'Genesis 6:9-11:32', refs: [] },
  ] } },
  relatedTopics: [{ slug: 'creation', title: { en: 'Creation', he: 'בריאה' } }],
};

export const BERAKHOT = {
  title: 'Berakhot', heTitle: 'ברכות', categories: ['Talmud', 'Bavli'], heCategories: ['תלמוד', 'בבלי'], default_struct: 'Chapters', exclude_structs: ['schema'],
  enDesc: 'Berakhot is the first tractate.', enShortDesc: 'Blessings.', heShortDesc: 'ברכות.', era: 'A', firstSectionRef: 'Berakhot 2a',
  pubDateString: { en: ' (1483 CE)', he: ' (1483)' }, pubPlaceString: { en: 'Soncino', he: 'שונצינו' },
  schema: { nodeType: 'JaggedArrayNode', depth: 2, addressTypes: ['Talmud', 'Integer'], sectionNames: ['Daf', 'Line'], heSectionNames: ['דף', 'שורה'], lengths: [6, 100], content_counts: [0, 0, 14, 19, 15, 32] },
  alts: { Chapters: { title: 'Berakhot', heTitle: 'ברכות', nodes: [
    { nodeType: 'ArrayMapNode', title: 'Chapter 1; MeEimatai', heTitle: 'מאימתי', wholeRef: 'Berakhot 2a:1-3b:15', includeSections: true, refs: ['Berakhot 2a:1-14', 'Berakhot 2b', 'Berakhot 3a', 'Berakhot 3b'] },
  ] } },
  relatedTopics: [],
};

export const HAGGADAH = {
  title: 'Pesach Haggadah', heTitle: 'הגדה של פסח', categories: ['Liturgy', 'Haggadah'], heCategories: ['סדר התפילה', 'הגדה'], enDesc: 'The Haggadah.', firstSectionRef: 'Pesach Haggadah, Kadesh',
  schema: { nodeType: 'SchemaNode', title: 'Pesach Haggadah', heTitle: 'הגדה של פסח', nodes: [
    { nodeType: 'JaggedArrayNode', title: 'Kadesh', heTitle: 'קדש', depth: 1, content_counts: 13 },
    { nodeType: 'SchemaNode', title: 'Magid', heTitle: 'מגיד', nodes: [
      { nodeType: 'JaggedArrayNode', title: 'Ha Lachma Anya', heTitle: 'הא לחמא עניא', depth: 1, content_counts: 3 },
      { nodeType: 'JaggedArrayNode', title: 'Dayenu', heTitle: 'דיינו', depth: 2, content_counts: [3, 4] },
    ] },
  ] },
  relatedTopics: [],
};

export const CALENDARS = [
  { title: { en: 'Parashat Hashavua', he: 'פרשת השבוע' }, displayValue: { en: 'Bereshit', he: 'בראשית' }, url: 'Genesis.1.1-6.8', ref: 'Genesis 1:1-6:8', heRef: 'בראשית א׳:א׳-ו׳:ח׳', order: 1, category: 'Tanakh', description: { en: 'In the beginning.', he: 'בראשית ברא.' } },
  { title: { en: 'Haftarah', he: 'הפטרה' }, displayValue: { en: 'Isaiah 42:5-43:10', he: 'ישעיהו מ״ב' }, url: 'Isaiah.42.5-43.10', ref: 'Isaiah 42:5-43:10', order: 2, category: 'Tanakh' },
  { title: { en: 'Daf Yomi', he: 'דף יומי' }, displayValue: { en: 'Berakhot 2', he: 'ברכות ב׳' }, url: 'Berakhot.2', ref: 'Berakhot 2', order: 3, category: 'Talmud' },
  { title: { en: 'Chok LeYisrael', he: 'חק לישראל' }, displayValue: { en: 'Bereshit', he: 'בראשית' }, url: 'collections/x?tag=Bereshit', order: 12, category: 'Tanakh' },
];

export const VERSIONS = [
  { versionTitle: 'Tanach with Nikkud', versionTitleInHebrew: 'תנ"ך מנוקד', language: 'he', priority: '2.0', license: 'Public Domain', firstSectionRef: 'Genesis 1' },
  { versionTitle: 'The Holy Scriptures', language: 'en', priority: '1.0', license: 'Public Domain', firstSectionRef: 'Genesis 1' },
  { versionTitle: 'Bible en français [fr]', language: 'en', priority: '0', license: 'CC-BY', firstSectionRef: 'Genesis 1' },
];

const DETAILS = { Genesis: GENESIS, Berakhot: BERAKHOT, 'Pesach Haggadah': HAGGADAH };

/** Point the real `Sefaria` at the fixtures: TOC caches, index details, versions, calendars. */
export function seedSefaria() {
  Sefaria.toc = TOC;
  Sefaria.books = ['Genesis', 'Exodus', 'Job', 'Rashi on Genesis', 'Berakhot', 'Pesach Haggadah', 'Bereshit'];
  Sefaria.terms = {};
  Sefaria.virtualBooks = [];
  Sefaria._index = {};
  Sefaria._parseRef = {};
  Sefaria._indexDetails = {};
  Sefaria._versions = {};
  Sefaria.calendars = [];
  Sefaria._makeBooksDict();
  Sefaria._cacheFromToc(Sefaria.toc);
  Sefaria.index('Pesach Haggadah', { title: 'Pesach Haggadah', heTitle: 'הגדה של פסח', categories: ['Liturgy', 'Haggadah'], primary_category: 'Liturgy' });
  jest.spyOn(Sefaria, 'getIndexDetails').mockImplementation(title => Promise.resolve(DETAILS[title] || { error: `No book named '${title}'.` }));
  jest.spyOn(Sefaria, 'getVersions').mockImplementation(() => Promise.resolve(Sefaria._sortVersionsIntoBuckets(VERSIONS.map(v => ({ ...v })))));
  jest.spyOn(Sefaria, 'updateCalendars').mockImplementation(() => { Sefaria.calendars = CALENDARS; return Promise.resolve(); });
}

/** Let pending promises (mocked API calls) settle inside act(). */
export const settle = () => new Promise(resolve => setTimeout(resolve, 0));
