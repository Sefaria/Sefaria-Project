import { describe, expect, it } from 'vitest';
import { normalizeEndpoint, resourceGroup } from '../endpoints';

describe('normalizeEndpoint', () => {
  it('strips a trailing slash and query string, and trims', () => {
    expect(normalizeEndpoint('/api/texts/')).toBe('/api/texts');
    expect(normalizeEndpoint('/api/index?foo=bar')).toBe('/api/index');
    expect(normalizeEndpoint('  /api/index  ')).toBe('/api/index');
  });

  it('collapses extra path segments onto the longest known base', () => {
    expect(normalizeEndpoint('/api/v3/texts/Esther%201.1?version=french')).toBe('/api/v3/texts');
    expect(normalizeEndpoint('/api/words/completion/foo/bar')).toBe('/api/words/completion');
    expect(normalizeEndpoint('/api/words/foo')).toBe('/api/words');
  });

  it('keeps unknown endpoints as their own value', () => {
    expect(normalizeEndpoint('/api/totally-unknown-thing')).toBe('/api/totally-unknown-thing');
  });
});

describe('resourceGroup', () => {
  it.each([
    ['/api/texts', 'Texts'],
    ['/api/texts/translations', 'Texts'],
    ['/api/texts/random', 'Texts'],
    ['/api/v3/texts/', 'Texts'],
    ['/api/v3/texts/Esther%201.1?version=french', 'Texts'],
    ['/api/text', 'Texts'],
    ['Text', 'Texts'],
    ['/api/index', 'Index & structure'],
    ['/api/index/titles', 'Index & structure'],
    ['/api/v2/raw/index/', 'Index & structure'],
    ['/api/v2/index', 'Index & structure'],
    ['/api/shape/', 'Index & structure'],
    ['/api/counts', 'Index & structure'],
    ['Calendars', 'Calendars'],
    ['/api/calendars/', 'Calendars'],
    ['/api/links', 'Links & Related'],
    ['/api/related', 'Links & Related'],
    ['/api/search-wrapper/es8', 'Search'],
    ['/api/search/text/_search', 'Search'],
    ['/api/words/completion', 'Dictionary (Words)'],
    ['Documentation', 'Documentation'],
    ['/api/name/', 'Name Lookup'],
    ['Sefaria-Export', 'Sefaria-Export'],
    ['Sefaria MCP', 'Sefaria MCP'],
    ['/api/manuscripts', 'Manuscripts'],
    ['Manuscripts', 'Manuscripts'],
  ])('%s -> %s', (raw, group) => {
    expect(resourceGroup(raw)).toBe(group);
  });

  it('excludes the generic Sefaria API and unmapped values', () => {
    expect(resourceGroup('Sefaria API')).toBeNull();
    expect(resourceGroup('Miscellaneous')).toBeNull();
    expect(resourceGroup('Sefaria-Project code')).toBeNull();
    expect(resourceGroup('/api/topics')).toBeNull();
  });
});
