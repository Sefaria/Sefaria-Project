/**
 * The NG reader's import graph stays separate from the classic reader's: no ReaderApp.jsx,
 * Misc.jsx or CSS imports (the NG bundle and the SSR graph must not pull in the classic tree),
 * and nothing outside static/js/ng/ except the data layer (sefaria/) and lib/django-csrf.
 */
const fs = require('fs');
const path = require('path');

const NG_DIR = path.resolve(__dirname, '..');

function sourceFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { return entry.name === 'tests' ? [] : sourceFiles(full); }
    return /\.jsx?$/.test(entry.name) ? [full] : [];
  });
}

const importsOf = (file) => {
  const src = fs.readFileSync(file, 'utf8');
  return [...src.matchAll(/(?:import[^'"]*from\s*|import\s*|require\()\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
};

const files = sourceFiles(NG_DIR);

test('there are NG source files to check', () => {
  expect(files.length).toBeGreaterThan(10);
});

test.each(files.map(f => [path.relative(NG_DIR, f), f]))('%s imports only NG modules, the data layer, and allowed packages', (_, file) => {
  for (const spec of importsOf(file)) {
    expect(spec).not.toMatch(/(^|\/)(ReaderApp|Misc)(\.jsx)?$|\.s?css$/);
    if (spec.startsWith('.')) {
      const resolved = path.resolve(path.dirname(file), spec);
      const insideNg = resolved.startsWith(NG_DIR);
      const allowed = insideNg || /static\/js\/sefaria\//.test(resolved) || /static\/js\/lib\/django-csrf$/.test(resolved);
      expect({spec, allowed}).toEqual({spec, allowed: true});
    } else {
      expect(['react', 'react-dom', '@sentry/react', 'regenerator-runtime/runtime']).toContain(spec);
    }
  }
});
