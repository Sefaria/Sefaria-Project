/**
 * Library Next must never pull in the classic app: no ReaderApp.jsx, Misc.jsx or s2.css imports
 * anywhere under static/js/library-next/ (PLAN.md). Checks every source file, including features.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FORBIDDEN = [/ReaderApp(\.jsx)?['"]/, /\bMisc(\.jsx)?['"]/, /s2\.css/];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full, out); } else if (/\.(jsx?|css)$/.test(entry.name)) { out.push(full); }
  }
  return out;
}

const importLines = (src) => src.split('\n').filter(line => /^\s*(import\b|export\b.*\bfrom\b|.*\brequire\()/.test(line) || /@import/.test(line));

test('nothing under static/js/library-next imports ReaderApp.jsx, Misc.jsx or s2.css', () => {
  const offenders = [];
  for (const file of walk(ROOT)) {
    if (file === __filename) { continue; }
    const src = fs.readFileSync(file, 'utf8');
    for (const line of importLines(src)) {
      if (FORBIDDEN.some(re => re.test(line))) { offenders.push(`${path.relative(ROOT, file)}: ${line.trim()}`); }
    }
  }
  expect(offenders).toEqual([]);
});

test('the tree only reaches the classic code through the data layer', () => {
  const allowed = [/^\.\.\/sefaria\//, /^\.\.\/lib\/django-csrf/];
  const offenders = [];
  for (const file of walk(ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const line of importLines(src)) {
      const m = /from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/.exec(line);
      const spec = m && (m[1] || m[2]);
      if (spec && spec.startsWith('../') && !spec.startsWith('../i18n') && path.relative(ROOT, path.resolve(path.dirname(file), spec)).startsWith('..')) {
        const fromRoot = path.relative(ROOT, path.resolve(path.dirname(file), spec));
        if (!allowed.some(re => re.test('../' + fromRoot.replace(/^(\.\.\/)+/, '')))) { offenders.push(`${path.relative(ROOT, file)}: ${spec}`); }
      }
    }
  }
  expect(offenders).toEqual([]);
});
