// @vitest-environment node
// Code samples equal live's, character for character, for every language and library on get-v3-texts,
// get-calendars and post-find-refs (fixtures captured from live by selecting each language; GET only).
// The only normalization is deviation D-4: live's Node default is ReadMe's `api` SDK, which the portal does not
// offer, so live's "API" library entries are skipped and Node's default is fetch.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { endpointForm, initialValues } from '../model/fields';
import { describeRequest, toHar } from '../request/request';
import { operation } from '../test/specs';
import { generateSnippet } from './generate';
import { ALL_LANGUAGES, MORE_LANGUAGES, PRIMARY_LANGUAGES, findLibrary, requestLabel } from './languages';

interface LiveSample {
  language: string;
  more: boolean;
  headerLabel: string;
  defaultLibrary: string | null;
  code: string;
  libraries: { library: string; headerLabel: string; code: string }[];
}
interface LiveFixture {
  operationId: string;
  moreLanguages: string[];
  samples: LiveSample[];
}

const D4_SKIPPED_LIBRARY = 'API';
const OPS = ['get-v3-texts', 'get-calendars', 'post-find-refs'];

function fixture(op: string): LiveFixture {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, '__fixtures__', `${op}.live.json`), 'utf8'));
}

function harFor(operationId: string) {
  const op = operation(operationId);
  const form = endpointForm(op);
  return toHar(describeRequest(op, form, initialValues(form)), op.server);
}

describe('code sample languages', () => {
  it('lists the five buttons and the 18 "More Languages" entries in live order', () => {
    expect(PRIMARY_LANGUAGES.map((l) => l.label)).toEqual(['Shell', 'Node', 'Ruby', 'PHP', 'Python']);
    for (const op of OPS) expect(MORE_LANGUAGES.map((l) => l.label)).toEqual(fixture(op).moreLanguages);
    expect(MORE_LANGUAGES).toHaveLength(18);
  });

  it('offers Axios, fetch and http for Node, fetch by default (D-4)', () => {
    const node = PRIMARY_LANGUAGES[1]!;
    expect(node.libraries.map((l) => l.label)).toEqual(['Axios', 'fetch', 'http']);
    expect(findLibrary(node, undefined).label).toBe('fetch');
  });
});

describe.each(OPS)('code samples equal live on %s', (operationId) => {
  const live = fixture(operationId);
  const har = harFor(operationId);

  it.each(live.samples.map((s) => [s.language, s] as const))('%s', (_label, sample) => {
    const language = ALL_LANGUAGES.find((l) => l.label === sample.language)!;
    expect(language, sample.language).toBeDefined();
    const liveLibraries = sample.libraries.filter((l) => l.library !== D4_SKIPPED_LIBRARY);
    if (liveLibraries.length === 0) {
      const library = findLibrary(language, undefined);
      expect(generateSnippet(har, language, library)).toBe(sample.code);
      expect(requestLabel(language, library)).toBe(sample.headerLabel.replace(/Examples$/, ''));
      return;
    }
    expect(language.libraries.map((l) => l.label)).toEqual(liveLibraries.map((l) => l.library));
    for (const liveLib of liveLibraries) {
      const library = language.libraries.find((l) => l.label === liveLib.library)!;
      expect(generateSnippet(har, language, library), `${sample.language} / ${liveLib.library}`).toBe(liveLib.code);
      expect(requestLabel(language, library)).toBe(liveLib.headerLabel);
    }
    if (sample.defaultLibrary !== D4_SKIPPED_LIBRARY) {
      expect(findLibrary(language, undefined).label).toBe(sample.defaultLibrary);
      expect(generateSnippet(har, language, findLibrary(language, undefined))).toBe(sample.code);
    }
  });
});
