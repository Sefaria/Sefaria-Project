/** Every `my.*` key the hub references exists in strings.js with both languages. */
const fs = require('fs');
const path = require('path');
import { hasString, t, setLang, _resetStrings } from '../../i18n';
import '../strings';

const DIR = path.resolve(__dirname, '..');

function usedKeys() {
  const keys = new Set();
  for (const file of fs.readdirSync(DIR).filter(f => /\.(jsx?|js)$/.test(f) && f !== 'strings.js')) {
    const src = fs.readFileSync(path.join(DIR, file), 'utf8');
    for (const m of src.matchAll(/'(my\.[A-Za-z0-9_.]+)'/g)) { keys.add(m[1]); }
  }
  return keys;
}

const FAMILIES = {
  'my.tagline.': ['newcomer', 'learner', 'educator', 'scholar'],
  'my.shelf.kind.': ['all', 'ref', 'book'],
  'my.color.': ['yellow', 'green', 'blue', 'pink'],
  'my.cards.grade.': ['again', 'hard', 'good', 'easy'],
  'my.notebook.export.': ['bibtex', 'csv', 'json'],
  'my.data.coll.': ['history', 'streak', 'shelf', 'notes', 'highlights', 'flashcards', 'plans', 'lessons', 'notebook', 'kv'],
  'my.plans.unit.': ['Chapter', 'Daf', 'Mishnah', 'Siman', 'Verse', 'Section'],
  'my.nav.': ['overview', 'shelf', 'history', 'notes', 'plans', 'flashcards', 'lessons', 'notebook', 'data'],
  'my.title.': ['overview', 'shelf', 'history', 'notes', 'plans', 'flashcards', 'lessons', 'notebook', 'data', 'handout', 'shared', 'newLesson', 'lesson'],
};

test('every referenced key exists', () => {
  const missing = [];
  const keys = usedKeys();
  for (const [prefix, members] of Object.entries(FAMILIES)) { members.forEach(m => keys.add(prefix + m)); }
  for (const key of keys) {
    if (/\.$/.test(key) || FAMILIES[key + '.']) { continue; }
    if (!hasString(key)) { missing.push(key); }
  }
  expect(missing).toEqual([]);
});

test('every string has distinct, non-empty English and Hebrew', () => {
  const src = fs.readFileSync(path.join(DIR, 'strings.js'), 'utf8');
  const keys = Array.from(src.matchAll(/^\s*'(my\.[^']+)':/gm)).map(m => m[1]);
  expect(keys.length).toBeGreaterThan(200);
  const problems = [];
  for (const key of keys) {
    setLang('en'); const en = t(key);
    setLang('he'); const he = t(key);
    if (!en || !he || en === key) { problems.push(key); }
    if (en === he && !/^[A-Za-z0-9 ,.{}]*$/.test(en) === false && !/BibTeX|CSV|JSON|S,M,T|^\{n\}/.test(en)) { problems.push(`${key} (same in both)`); }
  }
  setLang('en');
  expect(problems).toEqual([]);
});
