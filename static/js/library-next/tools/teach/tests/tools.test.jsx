import { act } from 'react-dom/test-utils';
import { setup, genesis } from './helpers';
import { collection, createLesson } from '../../../my/collections';
import { ASSISTANT_EVENT } from '../../../assistant/events';
import { TEACH_TOOL_IDS } from '../index';

const KOREN = 'The Koren Jerusalem Bible';
const h = setup({
  getText: (ref, settings) => {
    if (settings.enVersion === KOREN) { return Promise.resolve({ ref, text: ['IN THE BEGINNING God created the heaven and the earth.'], he: [''], versionTitle: KOREN, heVersionTitle: '' }); }
    if (settings.enVersion) { return Promise.resolve({ ref, text: [`${settings.enVersion}: text`], he: [''], versionTitle: settings.enVersion }); }
    return null;
  },
});

const bookVersions = genesis.versions;

test('educator toolbelt lists the four teaching tools first, in persona order', async () => {
  await h.open('/Genesis.1', { persona: 'educator' });
  await h.click(h.$$('.ln-seg')[0]);
  const ids = h.$$('.ln-toolbelt [data-tool]').map(b => b.dataset.tool);
  expect(ids.slice(0, 5)).toEqual([...TEACH_TOOL_IDS, 'connections']);
  expect(ids).toContain('shelf');
  expect(ids).toContain('cite');
  expect(h.$('[data-tool="versions"]')).toBeNull();
});

test('learners do not see the teaching tools', async () => {
  await h.open('/Genesis.1', { persona: 'learner' });
  await h.click(h.$$('.ln-seg')[0]);
  expect(h.$('[data-tool="lessonBuilder"]')).toBeNull();
  expect(h.$('[data-tool="handout"]')).toBeNull();
});

describe('Add to lesson', () => {
  test('English: creates a lesson inline, adds the selection as a source, links to the lesson', async () => {
    const panel = await h.openTool('/Genesis.1', 'lessonBuilder');
    expect(panel.textContent).toContain('Add to lesson');
    expect(panel.textContent).toContain('No lessons yet');
    await h.type(panel.querySelector('.ln-lesson-new input'), 'Creation unit');
    await h.click(panel.querySelector('.ln-lesson-new button'));
    expect(panel.querySelector('select').value).not.toBe('__new');
    await h.type(panel.querySelector('.ln-field input.ln-input:not([aria-label])') || panel.querySelectorAll('input.ln-input')[0], 'Read aloud first');
    await h.click(panel.querySelector('button[type="submit"]'));
    const lessons = collection('lessons').list();
    expect(lessons).toHaveLength(1);
    expect(lessons[0].title).toBe('Creation unit');
    expect(lessons[0].sources).toHaveLength(1);
    expect(lessons[0].sources[0]).toMatchObject({ ref: 'Genesis 1:1', heTitle: 'בראשית א׳:א׳', category: 'Tanakh' });
    expect(lessons[0].sources[0].en).toContain('When God began');
    expect(lessons[0].sources[0].en + lessons[0].sources[0].he).not.toMatch(/<|footnote/);   // plain text, no markup
    expect(panel.querySelector('[data-state="added"]')).not.toBeNull();
    expect(panel.querySelector('a.ln-btn-primary').getAttribute('href')).toBe(`/my/lessons/${lessons[0].id}`);
    expect(document.body.textContent).toContain('Added to “Creation unit”');
  });
  test('Hebrew: picks an existing lesson and refuses a duplicate source', async () => {
    const lesson = createLesson({ title: 'שיעור בראשית' });
    const panel = await h.openTool('/Genesis.1', 'lessonBuilder', { lang: 'hebrew' });
    expect(document.documentElement.dir).toBe('rtl');
    expect(panel.textContent).toContain('הוספה לשיעור');
    expect(panel.querySelector('select').value).toBe(lesson.id);
    await h.click(panel.querySelector('button[type="submit"]'));
    expect(collection('lessons').get(lesson.id).sources).toHaveLength(1);
    await h.click(panel.querySelector('.ln-btn-quiet'));   // add to another lesson → back to the form
    expect(panel.querySelector('button[type="submit"]').disabled).toBe(true);
    expect(panel.textContent).toContain('כבר נמצא');
  });
});

describe('Discussion questions', () => {
  test('English: three Tanakh questions, editable, added to a lesson; the assistant gets the quoted text', async () => {
    const lesson = createLesson({ title: 'Creation' });
    const heard = [];
    window.addEventListener(ASSISTANT_EVENT, e => heard.push(e.detail.prompt));
    const panel = await h.openTool('/Genesis.1', 'discussionPrompts');
    const areas = panel.querySelectorAll('textarea');
    expect(areas).toHaveLength(3);
    expect(areas[0].value).toContain('Genesis 1:1');
    expect(areas[0].value).toMatch(/Read .* aloud/);   // the Tanakh template family
    expect(panel.textContent).toContain('Templates by text type');
    await h.type(areas[1], 'My own question about light');
    await h.click(panel.querySelector('.ln-btn-primary'));
    const saved = collection('lessons').get(lesson.id).questions;
    expect(saved).toHaveLength(3);
    expect(saved[1]).toMatchObject({ en: 'My own question about light', he: 'My own question about light' });
    expect(saved[0].he).toMatch(/[֐-׿]/);
    expect(saved[0].he).toContain('בראשית א׳:א׳');   // Hebrew questions carry the Hebrew ref
    expect(saved[0].he).not.toContain('Genesis 1:1');
    await h.click(panel.querySelector('.ln-q-add'));
    expect(collection('lessons').get(lesson.id).questions).toHaveLength(4);
    const first = areas[0].value;
    await h.click(h.byText('.ln-btn-quiet', /Other questions/));
    expect(panel.querySelectorAll('textarea')[0].value).not.toBe(first);
    await h.click(panel.querySelector('.ln-ask-assistant'));
    expect(heard).toHaveLength(1);
    expect(heard[0]).toContain('I am teaching Genesis 1:1 (Tanakh)');
    expect(heard[0]).toContain('"When God began to create');
  });
  test('Hebrew: Talmud templates for Berakhot, Hebrew prompt', async () => {
    const heard = [];
    window.addEventListener(ASSISTANT_EVENT, e => heard.push(e.detail.prompt));
    const panel = await h.openTool('/Berakhot.2a', 'discussionPrompts', { lang: 'hebrew' });
    expect(panel.textContent).toContain('שאלות לדיון');
    const areas = panel.querySelectorAll('textarea');
    expect(areas).toHaveLength(3);
    expect(areas[0].value).toContain('הסוגיה');
    await h.click(panel.querySelector('.ln-ask-assistant'));
    expect(heard[0]).toContain('אני מלמד/ת את');
  });
});

describe('Handout snippet', () => {
  test('English: bilingual preview, grade changes the note and scale, print opens a window', async () => {
    const opened = [];
    const fakeWin = { document: { open: jest.fn(), write: jest.fn(html => opened.push(html)), close: jest.fn() }, focus: jest.fn() };
    jest.spyOn(window, 'open').mockImplementation(() => fakeWin);
    const panel = await h.openTool('/Genesis.1', 'handout', { segment: 2 });
    const card = panel.querySelector('.ln-handout');
    expect(card).not.toBeNull();
    expect(card.className).toContain('bi');
    expect(card.textContent).toContain('Genesis 1:2');
    expect(card.textContent).toContain('בראשית א׳:ב׳');
    expect(card.textContent).toContain('read the Hebrew first');
    expect(card.getAttribute('style')).toContain('--scale:1');
    await h.click(h.byText('[role="radio"]', /Elementary/));
    expect(panel.querySelector('.ln-handout').getAttribute('style')).toContain('--scale:1.3');
    expect(panel.querySelector('.ln-handout').textContent).toContain('read the English aloud');
    expect(panel.querySelector('.ln-badge-simulated')).not.toBeNull();
    await h.type(panel.querySelector('select'), '5');
    await h.click(h.byText('button', /Open print view/));
    expect(window.open).toHaveBeenCalled();
    expect(opened[0]).toMatch(/^<!doctype html><html lang="en" dir="ltr">/);
    expect(opened[0]).toContain('@media print');
    expect((opened[0].match(/<div><\/div>/g) || []).length).toBe(5);
  });
  test('Hebrew: RTL print document, blocked pop-up is reported', async () => {
    jest.spyOn(window, 'open').mockImplementation(() => null);
    const panel = await h.openTool('/Genesis.1', 'handout', { lang: 'hebrew' });
    expect(panel.textContent).toContain('שכבת גיל');
    expect(h.byText('[role="radio"]', /תיכון/).getAttribute('aria-checked')).toBe('true');
    await h.click(h.byText('button', /תצוגת הדפסה/));
    expect(document.body.textContent).toContain('חלון ההדפסה נחסם');
  });
});

describe('Compare translations', () => {
  test('English: lists the English versions, shows up to three side by side, toggles', async () => {
    const panel = await h.openTool('/Genesis.1', 'translations');
    const english = bookVersions.filter(v => (v.actualLanguage || v.language) === 'en');
    expect(panel.textContent).toContain(`${english.length} English translations available`);
    const chips = panel.querySelectorAll('.ln-vchip');
    expect(chips).toHaveLength(english.length);
    const cols = panel.querySelectorAll('.ln-compare-col');
    expect(cols.length).toBeGreaterThanOrEqual(2);
    expect(cols.length).toBeLessThanOrEqual(3);
    expect(cols[0].textContent).toContain(genesis.versionTitle);
    const korenChip = Array.from(chips).find(c => c.textContent.includes(KOREN));
    expect(korenChip.className).not.toContain('is-on');   // fourth by priority, so not shown by default
    await h.click(korenChip.querySelector('input'));       // adding a fourth replaces the oldest pick
    expect(panel.querySelectorAll('.ln-compare-col')).toHaveLength(3);
    const koren = panel.querySelector('.ln-compare-col[aria-label="The Koren Jerusalem Bible"]');
    expect(koren).not.toBeNull();
    expect(koren.textContent).toContain('IN THE BEGINNING God created');
    await h.click(korenChip.querySelector('input'));
    expect(panel.querySelector('.ln-compare-col[aria-label="The Koren Jerusalem Bible"]')).toBeNull();
    expect(panel.querySelectorAll('.ln-compare-col')).toHaveLength(2);
  });
  test('Hebrew interface: Hebrew version names where available', async () => {
    const panel = await h.openTool('/Genesis.1', 'translations', { lang: 'hebrew' });
    expect(panel.textContent).toContain('תרגומים לאנגלית זמינים');
    expect(panel.textContent).toContain('מוצג בקורא');
  });
});
