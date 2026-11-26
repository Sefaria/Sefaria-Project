import { GLOSSARY, detectTerms, consonants, findTerm } from '../glossary';
import { FIGURES, detectFigures, unknownRabbis, personFromName } from '../figures';
import { textKind, bookDescription, eraCode, authorsOf, KINDS } from '../textKind';
import { renderMarkdownLite } from '../markdown';
import { clozeCards, tokenize, BLANK } from '../cloze';
import { pickVoice, chunkText, speechSupport } from '../speech';
import { highlightMap, highlightsFor, applyHighlights, useHighlights } from '../highlights';
import { planFor, newestPlan, sectionUnit } from '../plans';
import { flattenSenses, shapeEntries, hebrewWords, lookupWord } from '../../lexiconApi';
import { addHighlight, createPlan, markPlanUnitDone } from '../../../my/collections';
import { _resetStore } from '../../../store';
import Sefaria from '../../../../sefaria/sefaria';
import berakhot from '../../../reader/tests/fixtures/berakhot2a.json';
import genesis from '../../../reader/tests/fixtures/genesis1.json';

beforeEach(() => { _resetStore(); localStorage.clear(); });

describe('glossary', () => {
  test('about sixty terms, each bilingual with a definition and matchers', () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(60);
    const ids = new Set();
    for (const t of GLOSSARY) {
      expect(ids.has(t.id)).toBe(false); ids.add(t.id);
      expect(t.en && t.he && t.def.en && t.def.he).toBeTruthy();
      expect(t.enMatch.length).toBeGreaterThan(0);
      expect(t.heMatch.length).toBeGreaterThan(0);
    }
  });
  test('detects terms in English and Hebrew, ordered by first appearance, once each', () => {
    const found = detectTerms({ en: berakhot.text[0], he: berakhot.he[0] });
    const ids = found.map(f => f.term.id);
    expect(ids).toEqual(expect.arrayContaining(['mishnah', 'shema', 'mitzvah', 'kohen', 'terumah', 'torah']));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.indexOf('mishnah')).toBeLessThan(ids.indexOf('shema'));
    expect(found.find(f => f.term.id === 'shema').lang).toBe('en');
    const heOnly = detectTerms({ he: 'וְאֵלּוּ הֵן הַמִּצְווֹת שֶׁבַּתּוֹרָה' });
    expect(heOnly.map(f => f.term.id)).toEqual(['mitzvah', 'torah']);
    expect(heOnly[0].lang).toBe('he');
    expect(detectTerms({ en: genesis.text[0] })).toEqual([]);
  });
  test('consonants strips vowels and cantillation', () => {
    expect(consonants('בְּרֵאשִׁ֖ית')).toBe('בראשית');
    expect(findTerm('shabbat').he).toBe('שבת');
    expect(findTerm('nope')).toBeNull();
  });
});

describe('figures', () => {
  test('curated list is bilingual with slugs and eras', () => {
    expect(FIGURES.length).toBeGreaterThanOrEqual(40);
    for (const f of FIGURES) { expect(f.slug && f.en && f.he && f.blurb.en && f.blurb.he && f.era).toBeTruthy(); }
    expect(new Set(FIGURES.map(f => f.slug)).size).toBe(FIGURES.length);
  });
  test('detects figures in English and Hebrew', () => {
    const page = detectFigures({ en: berakhot.text.join('\n'), he: berakhot.he.join('\n') });
    expect(page.map(f => f.figure.slug)).toEqual(['rabbi-eliezer-b-hyrcanus', 'rabban-gamliel']);
    expect(page[0].lang).toBe('en');   // the English mentions him too
    expect(detectFigures({ he: 'דִּבְרֵי רַבִּי אֱלִיעֶזֶר' })[0]).toMatchObject({ lang: 'he', figure: { en: 'Rabbi Eliezer' } });
    expect(detectFigures({ en: 'Then Moses and Aaron went to Pharaoh.' }).map(f => f.figure.en)).toEqual(['Moses', 'Aaron', 'Pharaoh']);
    expect(detectFigures({ en: 'Rava said to Abaye' }).map(f => f.figure.en)).toEqual(['Rava', 'Abaye']);
    expect(detectFigures({ en: 'Rav Ashi said' }).map(f => f.figure.en)).toEqual(['Rav Ashi']);
    expect(detectFigures({ en: genesis.text[0] })).toEqual([]);
  });
  test('unknown rabbis are collected for a topics lookup, curated ones skipped', () => {
    const en = 'Rabbi Zeira said in the name of Rav Huna: Rabbi Akiva disagrees. Rabban Gamliel too.';
    expect(unknownRabbis(en)).toEqual(['Rabbi Zeira', 'Rav Huna']);
    expect(unknownRabbis('The Rabbis say: until midnight.')).toEqual([]);
    expect(personFromName({ completion_objects: [{ title: 'Zeira', type: 'Topic', key: 'z' }, { title: 'Rabbi Zeira', type: 'PersonTopic', key: 'rabbi-zeira' }] })).toEqual({ slug: 'rabbi-zeira', en: 'Rabbi Zeira', he: 'Rabbi Zeira' });
    expect(personFromName({ completion_objects: [] })).toBeNull();
  });
});

describe('text kind and book metadata', () => {
  const book = (categories, sectionNames) => ({ categories, data: { sectionNames } });
  test('classifies by category and section names', () => {
    expect(textKind(book(['Tanakh', 'Torah'], ['Chapter', 'Verse']))).toBe('verse');
    expect(textKind(book(['Talmud', 'Bavli', 'Seder Zeraim'], ['Daf', 'Line']))).toBe('sugya');
    expect(textKind(book(['Mishnah', 'Seder Zeraim'], ['Chapter', 'Mishnah']))).toBe('mishnah');
    expect(textKind(book(['Tanakh', 'Rishonim on Tanakh', 'Commentary'], ['Chapter', 'Verse', 'Comment']))).toBe('comment');
    expect(textKind(book(['Midrash', 'Aggadic Midrash']))).toBe('midrash');
    expect(textKind(book(['Halakhah', 'Shulchan Arukh'], ['Siman', 'Seif']))).toBe('halakhah');
    expect(textKind(book(['Liturgy']))).toBe('liturgy');
    expect(textKind(book(['Jewish Thought']))).toBe('thought');
    expect(textKind(book(['Reference']))).toBe('other');
    expect(textKind({})).toBe('other');
    KINDS.forEach(k => expect(typeof k).toBe('string'));
  });
  test('description, era and authors from index details', () => {
    expect(bookDescription(null)).toEqual({ en: '', he: '' });
    expect(bookDescription({ enShortDesc: 'short' })).toEqual({ en: 'short', he: 'short' });
    expect(bookDescription({ enDesc: 'long', heDesc: 'ארוך' }).he).toBe('ארוך');
    expect(eraCode({ era: 'A' })).toBe('A');
    expect(eraCode({ era: 'X' })).toBeNull();
    expect(authorsOf({ authors: [{ en: 'Rashi', he: 'רש"י', slug: 'rashi' }, { slug: 'anon' }] })).toEqual([{ en: 'Rashi', he: 'רש"י', slug: 'rashi' }, { en: 'anon', he: 'anon', slug: 'anon' }]);
  });
});

describe('markdown-lite', () => {
  test('renders paragraphs, emphasis, headings and lists; escapes HTML', () => {
    expect(renderMarkdownLite('Hello **world** and *you*')).toBe('<p>Hello <strong>world</strong> and <em>you</em></p>');
    expect(renderMarkdownLite('# Title\n- a\n- b\n\n1. one\n2. two')).toBe('<h3>Title</h3><ul><li>a</li><li>b</li></ul><ol><li>one</li><li>two</li></ol>');
    expect(renderMarkdownLite('line one\nline two')).toBe('<p>line one<br>line two</p>');
    expect(renderMarkdownLite('<script>x</script> `code`')).toBe('<p>&lt;script&gt;x&lt;/script&gt; <code>code</code></p>');
    expect(renderMarkdownLite('')).toBe('');
  });
});

describe('cloze cards', () => {
  const text = 'When God began to create heaven and earth, the earth being unformed and void, with darkness over the surface of the deep.';
  test('three deterministic cards, longest content words, in text order', () => {
    const cards = clozeCards(text);
    expect(cards).toHaveLength(3);
    expect(cards.map(c => c.back)).toEqual(['unformed', 'darkness', 'surface']);
    cards.forEach(c => { expect(c.front).toContain(BLANK); expect(c.front).not.toContain(c.back); });
    expect(clozeCards(text)).toEqual(cards);
    expect(clozeCards('short', { count: 3 })).toEqual([{ front: BLANK, back: 'short' }]);
    expect(clozeCards('a b c')).toEqual([]);
  });
  test('Hebrew text works too, ignoring vowels when comparing length', () => {
    const cards = clozeCards('בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ', { count: 2 });
    expect(cards.map(c => c.back)).toEqual(['בְּרֵאשִׁית', 'אֱלֹהִים']);   // 6 letters, then a 5-letter tie broken by position
    expect(tokenize('שָׁלוֹם, world!').map(t => t.word)).toEqual(['שָׁלוֹם', 'world']);
  });
});

describe('speech helpers', () => {
  test('voice picking prefers default, then a named quality voice; chunks keep sentences', () => {
    const voices = [{ name: 'Hebrew', lang: 'he-IL' }, { name: 'Alex', lang: 'en-US' }, { name: 'Google US English', lang: 'en-US' }, { name: 'Daniel', lang: 'en_GB', default: true }];
    expect(pickVoice(voices, 'en').name).toBe('Daniel');
    expect(pickVoice(voices.slice(0, 3), 'en').name).toBe('Google US English');
    expect(pickVoice(voices, 'he').name).toBe('Hebrew');
    expect(pickVoice(voices, 'fr')).toBeNull();
    expect(chunkText('One. Two! Three? ' + 'x'.repeat(230) + '. End.')).toEqual(['One. Two! Three?', 'x'.repeat(230) + '.', 'End.']);
    expect(speechSupport([]).supported).toBe(false);   // jsdom has no speechSynthesis
  });
});

describe('highlights', () => {
  test('map, lookup and DOM application', () => {
    let now = 1000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => (now += 1));
    addHighlight('Genesis 1:2', 'green', { text: 'x' });
    addHighlight('Genesis 1:3', 'pink', { text: 'y' });
    addHighlight('Genesis 1:3', 'blue', { text: 'y' });   // newest wins
    clock.mockRestore();
    expect(highlightMap()).toEqual({ 'Genesis 1:2': 'green', 'Genesis 1:3': 'blue' });
    expect(highlightsFor(['Genesis 1:3']).map(h => h.color).sort()).toEqual(['blue', 'pink']);
    document.body.innerHTML = '<ol><li class="ln-seg" data-ref="Genesis 1:1"></li><li class="ln-seg" data-ref="Genesis 1:2" data-ln-highlight="yellow"></li><li class="ln-seg" data-ref="Genesis 1:3"></li></ol>';
    applyHighlights();
    expect(Array.from(document.querySelectorAll('.ln-seg')).map(el => el.getAttribute('data-ln-highlight'))).toEqual([null, 'green', 'blue']);
    document.body.innerHTML = '';
    expect(typeof useHighlights).toBe('function');
  });
});

describe('plans', () => {
  test('finds the plan holding a section, the newest plan, and the unit shape', () => {
    expect(planFor('Genesis 1')).toBeNull();
    expect(newestPlan()).toBeNull();
    const a = createPlan({ title: 'Torah', units: [{ ref: 'Genesis 1' }, { ref: 'Genesis 2' }] });
    const b = createPlan({ title: 'Later', units: [{ ref: 'Exodus 1' }] });
    b.ts = a.ts + 1000;   // list() sorts by ts; make the order explicit
    markPlanUnitDone(a.id, 'Genesis 2');
    expect(planFor('Genesis 1')).toMatchObject({ done: false, plan: { id: a.id } });
    expect(planFor('Genesis 2').done).toBe(true);
    expect(newestPlan().title).toBe('Later');
    expect(sectionUnit({ sectionRef: 'Genesis 1', heSectionRef: 'בראשית א׳' })).toEqual({ ref: 'Genesis 1', label: 'Genesis 1', heLabel: 'בראשית א׳' });
  });
});

describe('lexicon api', () => {
  const raw = [
    { headword: 'רֵאשִׁית', parent_lexicon: 'BDB Augmented Strong', transliteration: 'rêʼshîyth', content: { morphology: 'n-f', senses: [{ definition: 'first, beginning', senses: [{ definition: 'beginning' }, { definition: 'first' }] }] }, parent_lexicon_details: { language: 'heb.biblical' } },
    { headword: 'אֱלֹהִים', parent_lexicon: 'Jastrow Dictionary', content: { senses: [{ definition: ', v. <a href="/x">אֱלוֹהַּ</a>' }] } },
    { headword: 'x', parent_lexicon: 'Klein', content: { senses: [{}, { definition: 'gods.' }] } },
  ];
  test('flattens senses, drops cross-reference-only entries, strips HTML', () => {
    expect(flattenSenses(raw[0].content)).toEqual(['first, beginning', 'beginning', 'first']);
    const shaped = shapeEntries(raw);
    expect(shaped.map(e => e.headword)).toEqual(['רֵאשִׁית', 'x']);
    expect(shaped[0]).toMatchObject({ lexicon: 'BDB Augmented Strong', language: 'heb.biblical', morphology: 'n-f', transliteration: 'rêʼshîyth' });
    expect(shapeEntries(null)).toEqual([]);
  });
  test('hebrewWords: distinct consonantal forms, display keeps vowels, tags and punctuation dropped', () => {
    const words = hebrewWords(genesis.he[0]);
    expect(words[0]).toMatch(/^ב[\u0591-\u05C7]+ר/);   // display form keeps its marks
    expect(words.map(w => w.replace(/[֑-ׇ]/g, ''))).toEqual(['בראשית', 'ברא', 'אלהים', 'את', 'השמים', 'ואת', 'הארץ']);
    expect(hebrewWords('<b>וְאֵ֥ת הָאָֽרֶץ׃ וְאֵת</b>').length).toBe(2);
  });
  test('lookupWord strips cantillation, keeps vowels and shapes the response', async () => {
    const spy = jest.spyOn(Sefaria, 'getLexiconWords').mockImplementation(() => Promise.resolve(raw));
    const entries = await lookupWord('בְּרֵאשִׁ֖ית', 'Genesis 1:1');
    expect(spy).toHaveBeenCalledWith('בְּרֵאשִׁית', 'Genesis 1:1');
    expect(entries).toHaveLength(2);
    expect(await lookupWord('', 'Genesis 1:1')).toEqual([]);
    spy.mockImplementation(() => Promise.reject(new Error('down')));
    expect(await lookupWord('שלום')).toEqual([]);
    spy.mockRestore();
  });
});
