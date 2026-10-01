import { generateQuestions, assistantPrompt, QUESTION_CATEGORIES } from '../questions';
import { notesToMarkdown, notebookToBibTeX, notebookToCSV, notebookToJSON, csvEscape, download } from '../exportFormats';
import { sectionsFor, sectionFor, pathFor, ORDER, FEATURED, SECTIONS } from '../nav';
import { askAssistant, ASSISTANT_EVENT } from '../assistant';
import { isAssistantOpen, closeAssistant } from '../../AssistantDock';

test('question templates are bilingual, category-aware and cycle without repeats', () => {
  const qs = generateQuestions('Tanakh', 'Genesis 1:1');
  expect(qs).toHaveLength(3);
  qs.forEach(q => { expect(q.en).toContain('Genesis 1:1'); expect(q.he).toContain('Genesis 1:1'); expect(q.en).not.toMatch(/\{/); });
  expect(qs[0].en).toMatch(/Read Genesis 1:1 aloud/);
  expect(generateQuestions('Tanakh', 'Genesis 1:1', { offset: 4 })[0].en).toBe('What would be lost if Genesis 1:1 were missing from Genesis?');
  expect(generateQuestions('Talmud', 'Berakhot 2a')[0].en).toMatch(/sugya/);
  expect(generateQuestions('Tosefta', 'Tosefta Berakhot 1')[0].en).toBe(generateQuestions('Mishnah', 'Tosefta Berakhot 1')[0].en);
  const generic = generateQuestions('Reference', 'Jastrow, א', { count: 10 });
  expect(generic).toHaveLength(5);                      // only the generic pool
  expect(generic[0].en).toMatch(/central claim/);
  expect(QUESTION_CATEGORIES).toContain('Halakhah');
});

test('assistant prompt in both languages and the dock event', () => {
  const lesson = { title: 'Light', sources: [{ ref: 'Genesis 1:1' }, { ref: 'Genesis 1:3' }] };
  expect(assistantPrompt(lesson, 'en')).toBe('I am preparing a lesson called "Light" on Genesis 1:1, Genesis 1:3. Suggest three classroom discussion questions, from accessible to demanding, and say briefly what each one tests.');
  expect(assistantPrompt(lesson, 'he')).toMatch(/^אני מכין\/ה שיעור בשם "Light" על Genesis 1:1, Genesis 1:3\./);
  expect(assistantPrompt({ title: 'Empty' }, 'en')).toContain('on Empty.');
  const seen = [];
  const listener = (e) => seen.push(e.detail);
  window.addEventListener(ASSISTANT_EVENT, listener);
  closeAssistant();
  askAssistant('  Hello  ', { source: 'lesson' });
  expect(seen).toEqual([{ prompt: 'Hello', source: 'lesson' }]);
  expect(isAssistantOpen()).toBe(true);
  closeAssistant();
  askAssistant('No open', { open: false });
  expect(isAssistantOpen()).toBe(false);
  expect(() => askAssistant('')).toThrow(TypeError);
  window.removeEventListener(ASSISTANT_EVENT, listener);
});

const entries = [
  { id: 'e1', ref: 'Berakhot 2a:1', title: 'Berakhot 2a:1', heTitle: 'ברכות ב׳ א', text: 'Opening, "when" question', versions: ['William Davidson', 'Vilna'], citation: 'Berakhot 2a:1. Sefaria.', ts: Date.UTC(2026, 9, 1) },
  { id: 'e2', ref: 'Genesis 1:1', title: 'Genesis 1:1', heTitle: '', text: 'line one\nline two', versions: [], citation: 'Genesis 1:1. Sefaria.', ts: Date.UTC(2026, 9, 2) },
];

test('markdown export groups notes and highlights by book', () => {
  const md = notesToMarkdown({
    notes: [{ ref: 'Genesis 1:1', text: 'In the beginning', ts: Date.UTC(2026, 9, 1) }, { ref: 'Berakhot 2a:1', book: 'Berakhot', text: 'From when', ts: Date.UTC(2026, 9, 1) }],
    highlights: [{ ref: 'Genesis 1:2', color: 'green', text: 'the earth', ts: Date.UTC(2026, 9, 3) }],
  });
  expect(md.split('\n')[0]).toBe('# My notes');
  expect(md.indexOf('## Berakhot')).toBeLessThan(md.indexOf('## Genesis'));
  expect(md).toContain('### [Genesis 1:1](https://www.sefaria.org/Genesis_1.1)');
  expect(md).toContain('- **Highlight** ([Genesis 1:2](https://www.sefaria.org/Genesis_1.2), green): the earth');
  expect(md).toContain('_2026-10-01_');
  expect(md).not.toMatch(/\n{3,}/);
});

test('notebook exports: BibTeX, CSV, JSON', () => {
  const bib = notebookToBibTeX(entries);
  expect(bib).toContain('@misc{Berakhot2026_1,');
  expect(bib).toContain('  howpublished = {\\url{https://www.sefaria.org/Berakhot_2a.1}},');
  expect(bib).toContain('  note = {Versions compared: William Davidson; Vilna},');
  expect(bib).toContain('  urldate = {2026-10-02}');
  expect(bib).not.toMatch(/Genesis1:1/);
  expect(notebookToBibTeX([])).toBe('');

  const csv = notebookToCSV(entries);
  const lines = csv.trim().split('\n');
  expect(lines[0]).toBe('ref,title,heTitle,note,versions,citation,date');
  expect(lines[1]).toBe('Berakhot 2a:1,Berakhot 2a:1,ברכות ב׳ א,"Opening, ""when"" question",William Davidson | Vilna,Berakhot 2a:1. Sefaria.,2026-10-01');
  expect(csv).toContain('"line one\nline two"');
  expect(csvEscape(null)).toBe('');

  const json = JSON.parse(notebookToJSON(entries));
  expect(json.format).toBe('sefaria.libnext.notebook');
  expect(json.entries).toHaveLength(2);
});

test('download is a safe no-op without object URLs and clicks an anchor with them', () => {
  expect(download('a.txt', 'x')).toBe(false);          // jsdom has no URL.createObjectURL
  URL.createObjectURL = jest.fn(() => 'blob:x');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  expect(download('notes.md', '# hi', 'text/markdown')).toBe(true);
  expect(click).toHaveBeenCalledTimes(1);
  click.mockRestore();
  delete URL.createObjectURL; delete URL.revokeObjectURL;
});

test('persona nav order keeps every section reachable', () => {
  const all = Object.keys(SECTIONS).sort();
  Object.values(ORDER).forEach(order => expect([...order].sort()).toEqual(all));
  expect(sectionsFor('learner').slice(0, 3).map(s => s.id)).toEqual(['overview', 'plans', 'flashcards']);
  expect(sectionsFor('educator')[1].id).toBe('lessons');
  expect(sectionsFor('scholar')[1].id).toBe('notebook');
  expect(sectionsFor('unknown')[1].id).toBe('shelf');
  Object.entries(FEATURED).forEach(([persona, ids]) => ids.forEach(id => expect(ORDER[persona]).toContain(id)));
  expect(sectionFor('')).toBe('overview');
  expect(sectionFor('lessons/abc/handout')).toBe('lessons');
  expect(sectionFor('nope')).toBeNull();
  expect(pathFor('overview')).toBe('/my');
  expect(pathFor('notes')).toBe('/my/notes');
});
