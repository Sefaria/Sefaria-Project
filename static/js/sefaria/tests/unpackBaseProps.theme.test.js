/**
 * @jest-environment node
 *
 * Node SSR reuses one `Sefaria` object for every visitor. A per-visitor base prop that is only
 * copied `if (key in props)` survives into the next visitor's render when that visitor's props
 * lack it. `theme` must therefore always be overwritten: with the value Django sent, or null.
 */
import fs from 'fs';
import path from 'path';
import Sefaria from '../sefaria';

// What Django sends (reader.views.base_props always includes the key).
const visitor = theme => ({_uid: null, interfaceLang: 'english', theme});

afterEach(() => { Sefaria.theme = null; });

test('this suite runs like the Node SSR server (no document)', () => {
  expect(typeof document).toBe('undefined');
  expect(Sefaria._inBrowser).toBe(false);
});

test('"theme" is in the dataPassedAsProps whitelist', () => {
  const src = fs.readFileSync(path.join(__dirname, '../sefaria.js'), 'utf8');
  const list = src.match(/const dataPassedAsProps = \[([\s\S]*?)\];/);
  expect(list).not.toBeNull();
  expect(list[1]).toMatch(/^\s*"theme",$/m);
});

test('Sefaria.theme starts as null', () => {
  jest.isolateModules(() => {
    expect(require('../sefaria').default.theme).toBeNull();
  });
});

test('copies the visitor\'s theme', () => {
  Sefaria.unpackBaseProps(visitor('dark'));
  expect(Sefaria.theme).toBe('dark');
  Sefaria.unpackBaseProps(visitor('light'));
  expect(Sefaria.theme).toBe('light');
});

test('a dark visitor does not leak into the next visitor who sends theme: null', () => {
  Sefaria.unpackBaseProps(visitor('dark'));
  Sefaria.unpackBaseProps(visitor(null));
  expect(Sefaria.theme).toBeNull();
});

test('nor into a visitor whose props lack the key entirely', () => {
  Sefaria.unpackBaseProps(visitor('dark'));
  Sefaria.unpackBaseProps({_uid: null, interfaceLang: 'english'});
  expect(Sefaria.theme).toBeNull();
});

test.each(['DARK', 'system', '"><script>alert(1)</script>', 42, {}, ['dark']])(
  'an invalid value %p becomes null instead of reaching render', bad => {
    Sefaria.unpackBaseProps(visitor('dark'));
    Sefaria.unpackBaseProps(visitor(bad));
    expect(Sefaria.theme).toBeNull();
  });

test('the full SSR entry point (unpackDataFromProps) resets it too', () => {
  Sefaria.unpackDataFromProps(visitor('dark'));
  expect(Sefaria.theme).toBe('dark');
  Sefaria.unpackDataFromProps(visitor(null));
  expect(Sefaria.theme).toBeNull();
});

test('interleaved visitors each see only their own theme', () => {
  const seen = ['dark', null, 'light', null, 'dark', 'dark', null].map(t => {
    Sefaria.unpackBaseProps(visitor(t));
    return Sefaria.theme;
  });
  expect(seen).toEqual(['dark', null, 'light', null, 'dark', 'dark', null]);
});

test('undefined props (no DJANGO_VARS) leave the value alone, as for every other base prop', () => {
  Sefaria.unpackBaseProps(visitor('dark'));
  Sefaria.unpackBaseProps(undefined);
  expect(Sefaria.theme).toBe('dark');
});
