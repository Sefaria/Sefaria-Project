import Sefaria from '../../../../sefaria/sefaria';
import { setup, genesis, berakhot, links } from '../../teach/tests/helpers';
import { collection } from '../../../my/collections';
import { RESEARCH_TOOL_IDS } from '../index';
import { graphModel } from '../linkGraph';
import { refToPath } from '../../../reader/refKind';

const strip = s => String(s).replace(/[\u0591-\u05C7]/g, '');

const MASORAH = 'Miqra according to the Masorah';
const TAAMEI = "Tanach with Ta'amei Hamikra";
const PAGES = [{ manuscript_slug: 'leningrad', page_id: 'LC_Folio_1v', image_url: 'https://m.example/full.jpg', thumbnail_url: 'https://m.example/thumb.jpg', anchorRef: 'Genesis 1:1-26',
  manuscript: { title: 'Leningrad Codex (1008 CE)', he_title: 'כתב יד לנינגרד', source: 'https://library.example/', description: 'Courtesy of the library' } }];
const ENTRIES = [{ headword: 'רֵאשִׁית', parent_lexicon: 'BDB Augmented Strong', content: { morphology: 'n-f', senses: [{ definition: 'first, beginning', senses: [{ definition: 'beginning' }] }] }, refs: ['Bereishit Rabbah 3:5'] }];

const h = setup({
  getText: (ref, settings) => {
    if (settings.heVersion === MASORAH) { return Promise.resolve({ ref, he: ['בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃'], text: [''], heVersionTitle: MASORAH }); }
    if (settings.heVersion === TAAMEI) { return Promise.resolve({ ref, he: ['בראשית ברא אלהים את הארץ ואת השמים׃'], text: [''], heVersionTitle: TAAMEI }); }
    if (settings.heVersion) { return Promise.resolve({ ref, he: ['בראשית ברא'], text: [''], heVersionTitle: settings.heVersion }); }
    return null;
  },
});

test('scholar toolbelt: persona order, graph and cite present, teaching tools absent', async () => {
  await h.open('/Genesis.1', { persona: 'scholar' });
  await h.click(h.$$('.ln-seg')[0]);
  const ids = h.$$('.ln-toolbelt [data-tool]').map(b => b.dataset.tool);
  expect(ids.slice(0, 6)).toEqual(['versions', 'manuscripts', 'lexicon', 'cite', 'linkGraph', 'connections']);
  expect(ids).toContain('shelf');
  RESEARCH_TOOL_IDS.forEach(id => expect(ids).toContain(id));
  expect(h.$('[data-tool="lessonBuilder"]')).toBeNull();
});

describe('Versions compare', () => {
  test('English: Hebrew versions by default, word diff with highlights, saved to the notebook', async () => {
    const panel = await h.openTool('/Genesis.1', 'versions', { persona: 'scholar' });
    expect(panel.textContent).toContain('Versions compare');
    const selects = panel.querySelectorAll('select');
    expect(selects).toHaveLength(2);
    expect(selects[0].value).toBe(MASORAH);   // the version in view
    expect(selects[1].value).toBe(TAAMEI);
    const a = panel.querySelector('.ln-diff-a'), b = panel.querySelector('.ln-diff-b');
    expect(a.textContent).toContain(MASORAH);
    // "השמים ואת הארץ" vs "הארץ ואת השמים": LCS keeps three words, two change on each side
    expect(a.querySelectorAll('.ln-diff-token.is-changed').length).toBeGreaterThan(0);
    expect(b.querySelectorAll('.ln-diff-token.is-changed').length).toBeGreaterThan(0);
    expect(a.querySelectorAll('.ln-diff-token:not(.is-changed)').length).toBeGreaterThanOrEqual(3);
    expect(panel.querySelector('.ln-diff-summary').textContent).toMatch(/\d+ insertions, \d+ deletions/);
    expect(panel.querySelector('.ln-diff-side').getAttribute('dir')).toBe('rtl');
    await h.click(h.byText('button', /Save comparison to notebook/));
    const entries = collection('notebook').list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ ref: 'Genesis 1:1', heTitle: 'בראשית א׳:א׳', versions: [MASORAH, TAAMEI] });
    expect(entries[0].text).toContain(`Compared ${MASORAH} with ${TAAMEI}`);
    expect(entries[0].citation).toContain('Genesis 1:1, Miqra according to the Masorah / Tanach with Ta\'amei Hamikra. Sefaria.');
    expect(panel.querySelector('a[href="/my/notebook"]')).not.toBeNull();
    expect(h.byText('button', /Save comparison/).disabled).toBe(true);
  });
  test('Hebrew: Hebrew version titles, switching to English lists the translations', async () => {
    const panel = await h.openTool('/Genesis.1', 'versions', { persona: 'scholar', lang: 'hebrew' });
    expect(panel.textContent).toContain('השוואת נוסחים');
    expect(panel.querySelector('select option').textContent).toBe('מקרא על פי המסורה');
    await h.click(Array.from(panel.querySelectorAll('[role="radio"]')).find(b => /אנגלית/.test(b.textContent)));
    expect(panel.querySelectorAll('select')[0].value).toBe(genesis.versionTitle);
    expect(panel.querySelectorAll('select option').length / 2).toBe(genesis.versions.filter(v => (v.actualLanguage || v.language) === 'en').length);
  });
});

describe('Manuscripts', () => {
  test('English: thumbnails with library and full-image link', async () => {
    jest.spyOn(Sefaria, '_ApiPromise').mockImplementation(() => Promise.resolve(PAGES));
    const panel = await h.openTool('/Genesis.1', 'manuscripts', { persona: 'scholar' });
    expect(panel.textContent).toContain('1 manuscript pages');
    const card = panel.querySelector('.ln-ms-card');
    expect(card.querySelector('img').getAttribute('src')).toBe('https://m.example/thumb.jpg');
    expect(card.querySelector('a.ln-ms-thumb').getAttribute('href')).toBe('https://m.example/full.jpg');
    expect(card.textContent).toContain('Leningrad Codex (1008 CE)');
    expect(card.textContent).toContain('Covers Genesis 1:1-26');
    expect(card.querySelector('a[href="https://library.example/"]').textContent).toBe('Source library');
  });
  test('Hebrew: empty state when nothing is linked', async () => {
    jest.spyOn(Sefaria, '_ApiPromise').mockImplementation(() => Promise.resolve([]));
    const panel = await h.openTool('/Berakhot.2a', 'manuscripts', { persona: 'scholar', lang: 'hebrew' });
    expect(panel.querySelector('.ln-ms-empty')).not.toBeNull();
    expect(panel.textContent).toContain('עדיין אין תמונות כתבי יד');
  });
  test('Hebrew titles when the interface is Hebrew', async () => {
    jest.spyOn(Sefaria, '_ApiPromise').mockImplementation(() => Promise.resolve(PAGES));
    const panel = await h.openTool('/Genesis.1', 'manuscripts', { persona: 'scholar', lang: 'hebrew' });
    expect(panel.textContent).toContain('כתב יד לנינגרד');
  });
});

describe('Lexicon', () => {
  test('English: the selection\'s Hebrew words are tappable; a tap fetches and shows entries', async () => {
    const spy = jest.spyOn(Sefaria, 'getLexiconWords').mockImplementation(() => Promise.resolve(ENTRIES));
    const panel = await h.openTool('/Genesis.1', 'lexicon', { persona: 'scholar' });
    const words = panel.querySelectorAll('.ln-lex-word');
    expect(words.length).toBeGreaterThanOrEqual(7);
    expect(strip(words[0].textContent)).toBe('בראשית');
    expect(words[0].textContent).toMatch(/[\u05B0-\u05BD]/);   // vowels kept for display
    expect(words[0].textContent).not.toMatch(/[\u0591-\u05AF]/);   // cantillation dropped
    await h.click(words[0]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(strip(spy.mock.calls[0][0])).toBe('בראשית');
    expect(spy.mock.calls[0][1]).toBe('Genesis 1:1');
    const entry = panel.querySelector('.ln-lex-entry');
    expect(entry.textContent).toContain('רֵאשִׁית');
    expect(entry.textContent).toContain('BDB Augmented Strong');
    expect(entry.querySelectorAll('.ln-lex-sense')).toHaveLength(2);
    expect(entry.querySelector('a[href="/Bereishit_Rabbah.3.5"]')).not.toBeNull();
    expect(words[0].className).toContain('is-active');
  });
  test('Hebrew: typed lookup with no result shows the empty message', async () => {
    jest.spyOn(Sefaria, 'getLexiconWords').mockImplementation(() => Promise.resolve([]));
    const panel = await h.openTool('/Berakhot.2a', 'lexicon', { persona: 'scholar', lang: 'hebrew' });
    expect(panel.textContent).toContain('הקישו על מילה');
    await h.type(panel.querySelector('.ln-lex-input'), 'שמע');
    await h.click(panel.querySelector('form button[type="submit"]'));
    expect(panel.textContent).toContain('אין ערך מילוני עבור ״שמע״');
  });
});

describe('Cite / export', () => {
  test('scholar, English: Chicago / MLA / BibTeX, export buttons, save to notebook', async () => {
    const panel = await h.openTool('/Genesis.1', 'cite', { persona: 'scholar' });
    expect(panel.querySelector('.ln-cite-export')).not.toBeNull();
    const pre = panel.querySelector('.ln-cite-block');
    expect(pre.textContent).toMatch(/^Genesis 1:1, .*Sefaria, accessed .*https:\/\/www\.sefaria\.org\/Genesis\.1\.1\.$/);
    await h.click(h.byText('[role="radio"]', /MLA/));
    expect(panel.querySelector('.ln-cite-block').textContent).toMatch(/^"Genesis 1:1\." .*Sefaria, www\.sefaria\.org\/Genesis\.1\.1\. Accessed/);
    await h.click(h.byText('[role="radio"]', /BibTeX/));
    expect(panel.querySelector('.ln-cite-block').textContent).toContain('@misc{Genesis_1_1,');
    expect(panel.querySelector('.ln-cite-block').getAttribute('dir')).toBe('ltr');
    expect(panel.textContent).toContain('Export selection');
    await h.click(h.byText('button', /Save to notebook/));
    const entries = collection('notebook').list();
    expect(entries).toHaveLength(1);
    expect(entries[0].citation).toContain('@misc{Genesis_1_1,');
    expect(entries[0].versions).toEqual([genesis.heVersionTitle, genesis.versionTitle]);
    expect(strip(entries[0].text)).toContain('בראשית ברא');   // scholars read Hebrew-first, so the body is the Hebrew
  });
  test('newcomer keeps the built-in Copy / cite body', async () => {
    const panel = await h.openTool('/Genesis.1', 'cite', { persona: 'newcomer' });
    expect(panel.querySelector('.ln-cite-export')).toBeNull();
    expect(h.byText('[role="radio"]', /Simple/)).not.toBeUndefined();
  });
  test('scholar, Hebrew: labels and Hebrew access word', async () => {
    const panel = await h.openTool('/Genesis.1', 'cite', { persona: 'scholar', lang: 'hebrew' });
    expect(panel.textContent).toContain('העתקה / ציטוט');
    expect(panel.querySelector('.ln-cite-block').textContent).toContain('אוחזר');
    expect(panel.textContent).toContain('שמירה במחברת');
  });
});

describe('Cross-references graph', () => {
  test('English: live count, one node per work (capped), click navigates to the linked text', async () => {
    const panel = await h.openTool('/Genesis.1', 'linkGraph', { persona: 'scholar' });
    expect(panel.querySelector('.ln-graph-live').textContent).toMatch(new RegExp(`Live data: ${links.length} connections to \\d+ works`));
    const nodes = panel.querySelectorAll('.ln-graph-node');
    expect(nodes.length).toBeGreaterThan(3);
    expect(nodes.length).toBeLessThanOrEqual(18);
    expect(panel.querySelector('.ln-graph-center text').textContent).toBe(String(links.length));
    expect(panel.querySelectorAll('.ln-graph-legend-item').length).toBeGreaterThan(1);
    const first = graphModel(links).nodes[0];
    const node = Array.from(nodes).find(n => n.getAttribute('aria-label') === `Open ${first.title} (${first.count})`);
    expect(node).not.toBeUndefined();
    await h.click(node);
    expect(window.location.pathname).toBe(refToPath(first.targetRef));
    expect(h.$('.ln-reader-panel')).toBeNull();   // the panel closed on navigation
  });
  test('Hebrew: Hebrew work names and label', async () => {
    const panel = await h.openTool('/Genesis.1', 'linkGraph', { persona: 'scholar', lang: 'hebrew' });
    expect(panel.querySelector('svg.ln-graph').getAttribute('aria-label')).toContain('בראשית א׳:א׳');
    expect(panel.textContent).toContain('נתונים חיים');
    expect(Array.from(panel.querySelectorAll('.ln-graph-label')).some(l => /[֐-׿]/.test(l.textContent))).toBe(true);
  });
  test('empty state when there are no links', async () => {
    Sefaria.getLinks.mockImplementation(() => Promise.resolve([]));
    const panel = await h.openTool('/Berakhot.2a', 'linkGraph', { persona: 'scholar' });
    expect(panel.textContent).toContain('No cross-references for this passage');
  });
});
