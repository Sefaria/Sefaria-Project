import { describe, expect, it } from 'vitest';
import { parseQueryState, serializeQueryState, type QueryState } from '../url';

const base: QueryState = {
  q: '',
  category: 'all',
  topics: [],
  languages: [],
  resources: [],
  tech: [],
  showBuggy: false,
  sort: 'new',
  view: 'grid',
};

describe('query state', () => {
  it('omits defaults', () => {
    expect(serializeQueryState(base).toString()).toBe('');
  });

  it('round-trips every field', () => {
    const state: QueryState = {
      q: 'rav kook',
      category: 'viz',
      topics: ['Gemara', 'Tanakh'],
      languages: ['Hebrew'],
      resources: ['Texts', 'Index & structure'],
      tech: ['React', 'Claude/Anthropic API'],
      showBuggy: true,
      sort: 'az',
      view: 'list',
    };
    const search = serializeQueryState(state).toString();
    expect(parseQueryState(search)).toEqual(state);
    const params = new URLSearchParams(search);
    expect(params.get('topic')).toBe('Gemara,Tanakh');
    expect(params.get('lang')).toBe('Hebrew');
    expect(params.get('resource')).toBe('Texts,Index & structure');
    expect(params.get('tech')).toBe('React,Claude/Anthropic API');
    expect(params.get('bugs')).toBe('1');
  });

  it.each([
    ['topics', 'topic', ['Gemara']],
    ['languages', 'lang', ['English', 'French']],
    ['resources', 'resource', ['Search']],
    ['tech', 'tech', ['.NET', 'C#']],
  ] as const)('round-trips %s through ?%s=', (field, param, values) => {
    const search = serializeQueryState({ ...base, [field]: [...values] }).toString();
    expect(search.startsWith(`${param}=`)).toBe(true);
    expect(parseQueryState(search)[field]).toEqual(values);
  });

  it('writes bugs=1 only when on', () => {
    expect(serializeQueryState({ ...base, showBuggy: true }).toString()).toBe('bugs=1');
    expect(parseQueryState('bugs=1').showBuggy).toBe(true);
    expect(parseQueryState('bugs=0').showBuggy).toBe(false);
    expect(parseQueryState('bugs=true').showBuggy).toBe(false);
  });

  it('tolerates blanks and duplicates in lists', () => {
    expect(parseQueryState('topic=Gemara,, Gemara ,Tanakh,').topics).toEqual(['Gemara', 'Tanakh']);
    expect(parseQueryState('topic=').topics).toEqual([]);
  });

  it('falls back to defaults for invalid values and ignores the retired `open` and `project` params', () => {
    expect(parseQueryState('category=bogus&sort=x&view=y&project=abc&open=1')).toEqual(base);
    expect(parseQueryState('project=3')).toEqual(base);
  });

  it('uses the persisted view as the default', () => {
    expect(parseQueryState('', 'list').view).toBe('list');
    expect(serializeQueryState({ ...base, view: 'list' }, 'list').toString()).toBe('');
    expect(serializeQueryState({ ...base, view: 'grid' }, 'list').toString()).toBe('view=grid');
  });

  it("maps older link values for renamed topics and resource groups to today's", () => {
    const state = parseQueryState('topic=Halakha,chavruta&resource=Links %26 related,Name lookup');
    expect(state.topics).toEqual(['Halakhah', 'Chavruta']);
    expect(state.resources).toEqual(['Links & Related', 'Name Lookup']);
  });
});
