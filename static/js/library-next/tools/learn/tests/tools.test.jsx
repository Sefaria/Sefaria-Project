import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Sefaria from '../../../../sefaria/sefaria';
import '../../../strings';
import '../../../routes';
import App from '../../../App';
import { setLang } from '../../../i18n';
import { setPersona } from '../../../persona';
import { _resetStore } from '../../../store';
import { _resetOverlays } from '../../../overlays';
import { ASSISTANT_EVENT } from '../../../assistant/events';
import { collection, createPlan } from '../../../my/collections';
import { BLANK } from '../cloze';
import { LEARN_TOOL_IDS } from '../index';
import genesis from '../../../reader/tests/fixtures/genesis1.json';
import berakhot from '../../../reader/tests/fixtures/berakhot2a.json';
import indexGenesis from '../../../reader/tests/fixtures/indexGenesis.json';

const TEXTS = {
  'Genesis 1': genesis,
  'Berakhot 2a': berakhot,
  'Berakhot 3a': { ...berakhot, ref: 'Berakhot 3a', sectionRef: 'Berakhot 3a', heRef: 'ברכות ג׳ א', heSectionRef: 'ברכות ג׳ א', prev: 'Berakhot 2b', next: 'Berakhot 3b', sections: ['3a'], toSections: ['3a'],
    text: ['Rabbi Zeira said in the name of Rav Huna: one recites the Shema.'], he: ['אמר רבי זירא אמר רב הונא: קורא את שמע.'] },
};
const LEXICON = [{ headword: 'אֱלֹהִים', parent_lexicon: 'BDB Augmented Strong', transliteration: 'elohim', content: { morphology: 'n-m', senses: [{ definition: 'God', senses: [{ definition: 'rulers, judges' }] }] } }];
const flush = () => new Promise(r => setTimeout(r, 0));
let container;

beforeAll(() => { window.scrollTo = jest.fn(); window.scrollBy = jest.fn(); Sefaria.virtualBooks = Sefaria.virtualBooks || []; });
beforeEach(() => {
  _resetStore(); _resetOverlays(); localStorage.clear();
  jest.spyOn(Sefaria, 'getText').mockImplementation(ref => (TEXTS[ref] ? Promise.resolve(TEXTS[ref]) : Promise.reject(new Error('missing'))));
  jest.spyOn(Sefaria, 'getLinks').mockImplementation(() => Promise.resolve([]));
  jest.spyOn(Sefaria, 'getIndexDetails').mockImplementation(() => Promise.resolve(indexGenesis));
  jest.spyOn(Sefaria, 'getIndexDetailsFromCache').mockImplementation(() => null);
  jest.spyOn(Sefaria, 'getLexiconWords').mockImplementation(() => Promise.resolve(LEXICON));
  jest.spyOn(Sefaria, 'getName').mockImplementation(name => Promise.resolve({ completion_objects: name === 'Rabbi Zeira' ? [{ title: 'Rabbi Zeira', type: 'PersonTopic', key: 'rabbi-zeira' }] : [] }));
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { ReactDOM.unmountComponentAtNode(container); container.remove(); jest.restoreAllMocks(); setLang('en'); delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; });

async function open(path, { lang = 'english', persona = 'newcomer' } = {}) {
  setLang(lang); setPersona(persona);
  window.history.replaceState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  await act(async () => { ReactDOM.render(<App props={{ interfaceLang: lang }} />, container); await flush(); });
}
const $ = sel => container.querySelector(sel);
const $$ = sel => Array.from(container.querySelectorAll(sel));
const text = sel => ($(sel) ? $(sel).textContent.trim() : null);
const click = async (el, init = {}) => act(async () => { if (!el) { throw new Error('click: element not found'); } el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })); await flush(); });
const type = async (el, value) => act(async () => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true })); await flush();
});
const submit = async (form) => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush(); });
const byText = (sel, re) => $$(sel).find(el => re.test(el.textContent));
const openTool = async (id) => { await click($(`[data-tool="${id}"]`)); const p = $(`.ln-reader-panel[data-tool="${id}"]`); if (!p) { throw new Error(`panel ${id} did not open`); } return p; };
const panelText = () => $('.ln-panel-body').textContent;
const lastToast = () => { const all = $$('.ln-toast'); return all.length ? all[all.length - 1].textContent.trim() : null; };
const bare = s => s.replace(/[\u0591-\u05C7]/g, '');
const settle = (ms = 60) => act(async () => { await new Promise(r => setTimeout(r, ms)); });   // lets the decorator's animation frame run

test('newcomer toolbelt: explain, who\'s who, read aloud first', async () => {
  await open('/Genesis.1');
  await click($$('.ln-seg')[0]);
  expect($$('.ln-tool').map(b => b.dataset.tool)).toEqual(['explain', 'whosWho', 'readAloud', 'connections', 'shelf', 'cite']);
});

test('learner toolbelt: the five learner tools, then connections', async () => {
  await open('/Genesis.1', { persona: 'learner' });
  await click($$('.ln-seg')[0]);
  expect($$('.ln-tool').map(b => b.dataset.tool)).toEqual(['highlight', 'note', 'flashcard', 'markRead', 'vocab', 'connections', 'shelf', 'cite']);
  expect(LEARN_TOOL_IDS).toHaveLength(8);
});

test('Explain this: kind, book metadata, glossary terms and the assistant hand-off', async () => {
  const prompts = [];
  const onAsk = e => prompts.push(e.detail.prompt);
  window.addEventListener(ASSISTANT_EVENT, onAsk);
  await open('/Genesis.1');
  await click($$('.ln-seg')[0]);
  await openTool('explain');
  expect(text('.ln-panel-title')).toBe('Explain this');
  expect($('.ln-learn-kind').dataset.kind).toBe('verse');
  expect(text('.ln-learn-kind')).toMatch(/^A verse \(pasuk\)/);
  expect(text('.ln-learn-desc')).toContain('first book of the Torah');
  expect(text('.ln-learn-meta')).toContain('Composed c.1400  – c.400 BCE in Sinai/Canaan');
  expect(panelText()).toContain('No glossary terms found');
  await click(byText('.ln-panel-body .ln-btn', /Ask the Assistant/));
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain('Genesis 1:1');
  expect(prompts[0]).toContain('When God began to create');
  window.removeEventListener(ASSISTANT_EVENT, onAsk);
});

test('Explain this on Talmud: sugya and the glossary terms of the passage', async () => {
  await open('/Berakhot.2a');
  await click($$('.ln-seg')[0]);
  await openTool('explain');
  expect($('.ln-learn-kind').dataset.kind).toBe('sugya');
  const terms = $$('.ln-learn-term dt .ln-text-en').map(e => e.textContent);
  expect(terms).toEqual(expect.arrayContaining(['Shema', 'Mitzvah', 'Kohen', 'Terumah']));
  expect($$('.ln-learn-term dd').every(dd => dd.textContent.length > 10)).toBe(true);
});

test('Who\'s who: curated figures, topic links, and an unknown rabbi resolved through the topics API', async () => {
  await open('/Berakhot.2a');
  await click($$('.ln-seg')[0]);
  await click($$('.ln-seg')[2], { shiftKey: true });
  await openTool('whosWho');
  expect($$('.ln-learn-figure strong').map(e => e.textContent)).toEqual(['Rabbi Eliezer', 'Rabban Gamliel']);
  expect($$('.ln-learn-figure a').map(a => a.getAttribute('href'))).toEqual(['/topics/rabbi-eliezer-b-hyrcanus', '/topics/rabban-gamliel']);
  expect(panelText()).toContain('Tanna (sage of the Mishnah)');
  expect(Sefaria.getName).not.toHaveBeenCalled();
});

test('Who\'s who: an unknown rabbi is resolved through the topics API', async () => {
  await open('/Berakhot.3a');
  await click($$('.ln-seg')[0]);
  await openTool('whosWho');
  await act(async () => { await flush(); });
  expect(Sefaria.getName).toHaveBeenCalledWith('Rabbi Zeira', 5);
  expect(Sefaria.getName).toHaveBeenCalledWith('Rav Huna', 5);
  expect($$('.ln-learn-figure strong').map(e => e.textContent)).toEqual(['Rabbi Zeira']);
  expect(panelText()).toContain('From Sefaria topics');
  expect($('.ln-learn-figure a').getAttribute('href')).toBe('/topics/rabbi-zeira');
});

test('Who\'s who: nothing recognised', async () => {
  await open('/Genesis.1');
  await click($$('.ln-seg')[0]);
  await openTool('whosWho');
  expect(panelText()).toContain('No names we recognise');
});

test('Read it to me: graceful fallback without speech, speaks with a voice', async () => {
  await open('/Genesis.1');
  await click($$('.ln-seg')[0]);
  await openTool('readAloud');
  expect(panelText()).toContain('not available on this device');
  expect($('.ln-panel-body .ln-badge-simulated')).not.toBeNull();
  await click($('.ln-panel-close'));

  const spoken = [];
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.speechSynthesis = { getVoices: () => [{ name: 'Daniel', lang: 'en-GB', default: true }], speak: u => spoken.push(u), cancel: jest.fn(), pause: jest.fn(), resume: jest.fn() };
  await openTool('readAloud');
  expect($('.ln-panel-body .ln-badge-simulated')).toBeNull();
  const buttons = $$('.ln-learn-voice .ln-btn');
  expect(buttons[0].disabled).toBe(false);
  expect(buttons[1].disabled).toBe(true);
  expect(panelText()).toContain('Voice: Daniel');
  expect(panelText()).toContain('No Hebrew voice');
  await click(buttons[0]);
  expect(spoken.length).toBeGreaterThan(0);
  expect(spoken[0].text).toContain('When God began to create');
  expect(spoken[0].voice.name).toBe('Daniel');
  expect(panelText()).toContain('Reading…');
  await click(byText('.ln-panel-body .ln-btn', /^Stop$/));
  expect(window.speechSynthesis.cancel).toHaveBeenCalled();
});

test('Highlight: colour, one row per segment, decoration on the stream, remove', async () => {
  await open('/Genesis.1', { persona: 'learner' });
  const segs = $$('.ln-seg');
  await click(segs[1]);
  await click(segs[2], { shiftKey: true });
  await openTool('highlight');
  expect($$('.ln-learn-swatch')).toHaveLength(4);
  await click($('.ln-learn-swatch[data-color="green"]'));
  expect($('.ln-learn-swatch[data-color="green"]').getAttribute('aria-checked')).toBe('true');
  await click(byText('.ln-panel-body .ln-btn', /Highlight 2 segments/));
  const rows = collection('highlights').list().sort((a, b) => a.ref.localeCompare(b.ref));
  expect(rows.map(r => [r.ref, r.color, r.book])).toEqual([['Genesis 1:2', 'green', 'Genesis'], ['Genesis 1:3', 'green', 'Genesis']]);
  expect(rows[1].text).toContain('God said');
  expect($('.ln-reader-panel')).toBeNull();
  expect(lastToast()).toBe('Highlighted');
  await settle();
  expect($('.ln-seg[data-ref="Genesis 1:2"]').getAttribute('data-ln-highlight')).toBe('green');
  expect($('.ln-seg[data-ref="Genesis 1:3"]').getAttribute('data-ln-highlight')).toBe('green');
  expect($('.ln-seg[data-ref="Genesis 1:1"]').hasAttribute('data-ln-highlight')).toBe(false);
  await openTool('highlight');
  expect(panelText()).toContain('Already highlighted');
  await click(byText('.ln-panel-body .ln-btn', /^Remove$/));
  expect(collection('highlights').list()).toHaveLength(0);
  await settle();
  expect($('.ln-seg[data-ref="Genesis 1:2"]').hasAttribute('data-ln-highlight')).toBe(false);
});

test('Note: preview renders markdown-lite, saving writes `notes` and lists it', async () => {
  await open('/Genesis.1', { persona: 'learner' });
  await click($$('.ln-seg')[0]);
  const panel = await openTool('note');
  await type(panel.querySelector('textarea[name="note"]'), 'A **first** note\n- point');
  await click(byText('.ln-panel-body .ln-segment', /^Preview$/));
  expect($('.ln-learn-md').innerHTML).toBe('<p>A <strong>first</strong> note</p><ul><li>point</li></ul>');
  await click(byText('.ln-panel-body .ln-segment', /^Write$/));
  await submit(panel.querySelector('form'));
  expect(collection('notes').list()).toHaveLength(1);
  expect(collection('notes').list()[0]).toMatchObject({ ref: 'Genesis 1:1', text: 'A **first** note\n- point', title: 'Genesis', heTitle: 'בראשית', book: 'Genesis' });
  expect(lastToast()).toBe('Note saved');
  expect(panelText()).toContain('Your notes here');
  expect($$('.ln-learn-note .ln-learn-md strong')[0].textContent).toBe('first');
  expect(panel.querySelector('textarea').value).toBe('');
});

test('Flashcard: Hebrew front / English back, own answer, and three cloze cards from Quiz me', async () => {
  await open('/Genesis.1', { persona: 'learner' });
  await click($$('.ln-seg')[0]);
  const panel = await openTool('flashcard');
  expect(bare($('.ln-learn-card-face').textContent)).toMatch(/^בראשית ברא אלהים/);
  expect($('.ln-learn-card-back').textContent).toContain('When God began to create');
  await submit(panel.querySelector('form'));
  let cards = collection('flashcards').list();
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ ref: 'Genesis 1:1', due: expect.any(Number), interval: 0, reps: 0 });
  expect(bare(cards[0].front)).toMatch(/^בראשית/);
  expect(cards[0].back).toContain('When God began');
  await click(byText('.ln-panel-body .ln-segment', /^The reference$/));
  await click(byText('.ln-panel-body .ln-segment', /^My own answer$/));
  expect(panel.querySelector('form button[type="submit"]').disabled).toBe(true);
  await type(panel.querySelector('textarea[name="own"]'), 'Creation begins');
  await submit(panel.querySelector('form'));
  expect(collection('flashcards').list().find(c => c.front === 'Genesis 1:1').back).toBe('Creation begins');
  await click(byText('.ln-panel-body .ln-btn', /^Quiz me$/));
  cards = collection('flashcards').list();
  expect(cards).toHaveLength(5);
  const quiz = cards.filter(c => c.front.includes(BLANK));
  expect(quiz).toHaveLength(3);
  expect($$('.ln-learn-quiz-card')).toHaveLength(3);
  expect(lastToast()).toBe('3 quiz cards added');
});

test('Mark as read: start a plan, then toggle the section done; add to the newest plan', async () => {
  await open('/Genesis.1', { persona: 'learner' });
  await click($$('.ln-seg')[0]);
  await openTool('markRead');
  expect(panelText()).toContain('not in any of your study plans');
  await click(byText('.ln-panel-body .ln-btn', /Start a plan for Genesis/));
  let plan = collection('plans').list()[0];
  expect(plan).toMatchObject({ title: 'Genesis', heTitle: 'בראשית', book: 'Genesis', units: [{ ref: 'Genesis 1', label: 'Genesis 1', heLabel: 'בראשית א׳' }], done: [] });
  expect(panelText()).toContain('This section is in your plan "Genesis"');
  expect(panelText()).toContain('0 of 1 done');
  await click(byText('.ln-panel-body .ln-btn', /Mark Genesis 1 as read/));
  plan = collection('plans').get(plan.id);
  expect(plan.done).toEqual(['Genesis 1']);
  expect(panelText()).toContain('1 of 1 done');
  expect(lastToast()).toBe('Marked as read');
  await click(byText('.ln-panel-body .ln-btn', /Mark as unread/));
  expect(collection('plans').get(plan.id).done).toEqual([]);
});

test('Add to plan: the section joins the newest plan', async () => {
  const plan = createPlan({ title: 'Genesis', units: [{ ref: 'Genesis 1' }] });
  await open('/Berakhot.2a', { persona: 'learner' });
  await click($$('.ln-seg')[0]);
  await openTool('markRead');
  await click(byText('.ln-panel-body .ln-btn', /Add to "Genesis"/));
  expect(collection('plans').get(plan.id).units.map(u => u.ref)).toEqual(['Genesis 1', 'Berakhot 2a']);
  expect(panelText()).toContain('in your plan "Genesis"');
  expect(lastToast()).toBe('Added to your plan');
});

test('Vocabulary: word chips, dictionary lookup, add a definition as a flashcard', async () => {
  await open('/Genesis.1', { persona: 'learner' });
  await click($$('.ln-seg')[0]);
  await openTool('vocab');
  const chips = $$('.ln-learn-chip');
  expect(chips.map(c => c.textContent.replace(/[֑-ׇ]/g, ''))).toEqual(['בראשית', 'ברא', 'אלהים', 'את', 'השמים', 'ואת', 'הארץ']);
  expect(Sefaria.getLexiconWords).not.toHaveBeenCalled();
  await click(chips[2]);
  expect(Sefaria.getLexiconWords).toHaveBeenCalledWith('אֱלֹהִים', 'Genesis 1:1');
  expect(chips[2].getAttribute('aria-selected')).toBe('true');
  expect(text('.ln-learn-entry-head strong')).toBe('אֱלֹהִים');
  expect($$('.ln-learn-sense > span').map(s => s.textContent)).toEqual(['God', 'rulers, judges']);
  expect(panelText()).toContain('Source: BDB Augmented Strong');
  await click($$('.ln-learn-sense-add')[0]);
  expect(collection('flashcards').list()[0]).toMatchObject({ front: 'אֱלֹהִים', back: 'God', ref: 'Genesis 1:1' });
  expect(lastToast()).toBe('Flashcard added');
  Sefaria.getLexiconWords.mockImplementation(() => Promise.resolve([]));
  await click(chips[1]);
  expect(panelText()).toContain('No dictionary entry found');
});

const HE_LABELS = { explain: 'הסבר', whosWho: 'מי זה מי', readAloud: 'הקראה', highlight: 'הדגשה', note: 'הערה', flashcard: 'כרטיסייה', markRead: 'סימון כנקרא', vocab: 'אוצר מילים' };

test.each(LEARN_TOOL_IDS)('%s renders in the Hebrew interface (RTL, Hebrew label, no raw keys)', async (id) => {
  const persona = ['explain', 'whosWho', 'readAloud'].includes(id) ? 'newcomer' : 'learner';
  await open('/Berakhot.2a', { lang: 'hebrew', persona });
  expect($('.ln-shell').getAttribute('dir')).toBe('rtl');
  await click($$('.ln-seg')[0]);
  await openTool(id);
  expect(text('.ln-panel-title')).toBe(HE_LABELS[id]);
  expect(text('.ln-panel-ref')).toBe('ברכות ב׳ א:א׳');
  expect(panelText()).not.toMatch(/learn\.[a-zA-Z.]+/);
  expect(panelText().length).toBeGreaterThan(10);
  if (id === 'explain') { expect(panelText()).toContain('קטע מן התלמוד'); expect($$('.ln-learn-term').length).toBeGreaterThan(2); }
  if (id === 'whosWho') { expect(text('.ln-learn-figure strong')).toBe('רבי אליעזר'); }
  if (id === 'markRead') { expect(panelText()).toContain('פתיחת תוכנית לברכות'); }
});

test.each(LEARN_TOOL_IDS)('%s renders in English on Berakhot 2a without raw keys', async (id) => {
  const persona = ['explain', 'whosWho', 'readAloud'].includes(id) ? 'newcomer' : 'learner';
  await open('/Berakhot.2a', { persona });
  await click($$('.ln-seg')[0]);
  await openTool(id);
  expect(panelText()).not.toMatch(/learn\.[a-zA-Z.]+/);
  expect(text('.ln-panel-ref')).toBe('Berakhot 2a:1');
});
