/**
 * Shared helpers for the NG reader tests. Fixtures in ./fixtures are the props sefaria.org
 * serves an iPhone for each page (captured from DJANGO_VARS.props), trimmed by the real
 * reader/ng.py ng_reader_props — i.e. what Django sends NgReaderApp.
 */
const FIXTURES = {
  'genesis-1': () => require('./fixtures/genesis-1.json'),
  'genesis-1-3': () => require('./fixtures/genesis-1-3.json'),
  'berakhot-2a': () => require('./fixtures/berakhot-2a.json'),
  'psalms-23': () => require('./fixtures/psalms-23.json'),
};

const clone = (x) => JSON.parse(JSON.stringify(x));

export function fixture(name, {language, interfaceLang} = {}) {
  const props = clone(FIXTURES[name]());
  if (language) { props.initialSettings.language = language; }
  if (interfaceLang) { props.interfaceLang = interfaceLang; }
  return props;
}

/** An /api/v3/texts-shaped response for a neighbouring section, derived from a fixture's text. */
export function neighbourText(name, {ref, heRef, prev = null, next = null, marker}) {
  const text = clone(FIXTURES[name]().initialPanel.text);
  Object.assign(text, {ref, sectionRef: ref, heRef, heSectionRef: heRef, prev, next, sections: [ref.split(' ').pop()], toSections: [ref.split(' ').pop()]});
  if (marker) {
    text.text = text.text.map((t, i) => (i === 0 ? `${marker} ${t}` : t));
  }
  return text;
}

export const stripTags = (html) => html.replace(/<sup class="footnote-marker">.*?<\/sup><i class="footnote">.*?<\/i>/g, '')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;|&thinsp;/g, ' ').trim();

/** An /api/v3/texts response with a source and (unless `en` is undefined) a translation. */
export function v3(ref, he, en) {
  const versions = [{versionTitle: 'Source', languageFamilyName: 'hebrew', isPrimary: true, isSource: true, direction: 'rtl', text: he}];
  if (en !== undefined) { versions.push({versionTitle: 'Translation', languageFamilyName: 'english', isPrimary: false, isSource: false, direction: 'ltr', text: en}); }
  return {ref, heRef: `he:${ref}`, versions};
}

export const SHARED_DATA = {toc: [], topic_toc: [], terms: {}, books: [], virtualBooks: []};
