import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  activeFilterValues,
  categoryCounts,
  DEFAULT_FILTERS,
  facetOptions,
  filterFacets,
  filterProjects,
  searchProjects,
  type Filters,
} from '../filter';
import { fixtureProjects, makeProject } from '../../test/factories';

const projects = [
  makeProject({
    id: 1,
    project_name: 'Talmud Helper',
    project_desc: 'Study aid',
    project_category: 'Learning & Study Tools',
    tags: ['Gemara', 'English'],
    tech_used_raw: 'React and Python',
    sefaria_tools_used: ['/api/texts'],
  }),
  makeProject({
    id: 2,
    project_name: 'Bot',
    project_desc: 'Answers questions',
    project_category: 'AI Projects, Apps, & Other Tools Learning & Study Tools',
    tags: ['Tanakh', 'Hebrew'],
    tech_used_raw: 'React',
    sefaria_tools_used: ['/api/calendars/', '/api/texts'],
    project_source_code: 'https://github.com/x/y',
  }),
  makeProject({
    id: 3,
    project_name: 'Chart',
    project_category: 'Visualization & Data Analysis',
    tags: ['Visual', 'Gemara', 'English'],
    tech_used_raw: 'Python',
  }),
  makeProject({
    id: 4,
    project_name: 'Buggy',
    project_category: 'Visualization & Data Analysis',
    tags: ['Gemara'],
    is_buggy: true,
  }),
];

const ids = (list: { id: number }[]) => list.map((p) => p.id);
const filters = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...patch });
const counts = (options: { value: string; count: number }[]) =>
  Object.fromEntries(options.map((o) => [o.value, o.count]));

describe('searchProjects', () => {
  it('returns everything for a blank query', () => {
    expect(searchProjects(projects, '  ')).toHaveLength(4);
  });
  it.each([
    ['talmud', [1]], // name, case-insensitive
    ['answers', [2]], // description
    ['gemara', [1, 3, 4]], // topic
    ['hebrew', [2]], // language
    ['AI & Apps', [2]], // short category label
    ['calendars', [2]], // resource
  ])('matches %s', (q, expected) => {
    expect(ids(searchProjects(projects, q))).toEqual(expected);
  });
});

describe('filterProjects', () => {
  it('matches a project when its categories include the selected one', () => {
    expect(ids(filterProjects(projects, filters({ category: 'learn' })))).toEqual([1, 2]);
  });
  it('combines search and category', () => {
    expect(ids(filterProjects(projects, filters({ q: 'bot', category: 'ai' })))).toEqual([2]);
    expect(filterProjects(projects, filters({ q: 'bot', category: 'viz' }))).toEqual([]);
  });

  it('ORs the values within a section', () => {
    expect(ids(filterProjects(projects, filters({ topics: ['Gemara', 'Tanakh'] })))).toEqual([1, 2, 3]);
    expect(ids(filterProjects(projects, filters({ tech: ['React', 'Python'] })))).toEqual([1, 2, 3]);
  });

  it('ANDs across sections', () => {
    expect(ids(filterProjects(projects, filters({ topics: ['Gemara'], languages: ['English'] })))).toEqual([1, 3]);
    expect(
      ids(
        filterProjects(
          projects,
          filters({
            topics: ['Gemara'],
            languages: ['English'],
            tech: ['Python'],
            resources: ['Texts'],
          })
        )
      )
    ).toEqual([1]);
    expect(filterProjects(projects, filters({ topics: ['Tanakh'], languages: ['English'] }))).toEqual([]);
    expect(ids(filterProjects(projects, filters({ category: 'viz', topics: ['Gemara'] })))).toEqual([3]);
  });

  it('filters by language, Sefaria resource group and technology', () => {
    expect(ids(filterProjects(projects, filters({ languages: ['Hebrew'] })))).toEqual([2]);
    expect(ids(filterProjects(projects, filters({ resources: ['Calendars'] })))).toEqual([2]);
    expect(ids(filterProjects(projects, filters({ resources: ['Texts'] })))).toEqual([1, 2]);
    expect(ids(filterProjects(projects, filters({ tech: ['Python'] })))).toEqual([1, 3]);
  });

  it('applies the search before the sections', () => {
    expect(ids(filterProjects(projects, filters({ q: 'chart', topics: ['Gemara'] })))).toEqual([3]);
  });

  it('excludes projects with known issues by default and includes them with showBuggy', () => {
    expect(ids(filterProjects(projects, DEFAULT_FILTERS))).toEqual([1, 2, 3]);
    expect(ids(filterProjects(projects, filters({ showBuggy: true })))).toEqual([1, 2, 3, 4]);
    expect(ids(filterProjects(projects, filters({ q: 'buggy' })))).toEqual([]);
    expect(ids(filterProjects(projects, filters({ q: 'buggy', showBuggy: true })))).toEqual([4]);
  });

  it('shows 122 of the 134 fixture projects by default', () => {
    expect(filterProjects(fixtureProjects, DEFAULT_FILTERS)).toHaveLength(122);
    expect(filterProjects(fixtureProjects, filters({ showBuggy: true }))).toHaveLength(134);
  });
});

describe('categoryCounts', () => {
  it('counts per category and reflects the current search, not the selected category', () => {
    expect(categoryCounts(projects, { q: '' })).toMatchObject({
      all: 3,
      learn: 2,
      ai: 1,
      viz: 1,
      ext: 0,
      community: 0,
      none: 0,
    });
    expect(categoryCounts(projects, { q: 'study aid' })).toMatchObject({
      all: 1,
      learn: 1,
      ai: 0,
    });
    expect(categoryCounts(projects, { category: 'ai' })).toMatchObject({ all: 3, ai: 1, learn: 2 });
  });
  it('reflects every other active filter and the known-issues rule', () => {
    expect(categoryCounts(projects, { topics: ['Gemara'] })).toMatchObject({
      all: 2,
      learn: 1,
      viz: 1,
    });
    expect(categoryCounts(projects, { topics: ['Gemara'], showBuggy: true })).toMatchObject({
      all: 3,
      viz: 2,
    });
  });
  it('works on the fixture', () => {
    expect(categoryCounts(fixtureProjects, {}).all).toBe(122);
    expect(categoryCounts(fixtureProjects, { showBuggy: true }).all).toBe(134);
  });
});

describe('facetOptions', () => {
  it('builds options from the data with live counts, sorted by count then A–Z', () => {
    const options = facetOptions(projects, DEFAULT_FILTERS, 'topics');
    expect(options.map((o) => [o.value, o.count])).toEqual([
      ['Gemara', 2],
      ['Tanakh', 1],
      ['Visual', 1],
    ]);
    expect(options.some((o) => o.value === 'English')).toBe(false);
  });

  it('counts exclude the section’s own selection, so picking one topic keeps the others', () => {
    const picked = filters({ topics: ['Gemara'] });
    expect(counts(facetOptions(projects, picked, 'topics'))).toEqual({
      Gemara: 2,
      Tanakh: 1,
      Visual: 1,
    });
    // …while other sections do see it
    expect(counts(facetOptions(projects, picked, 'languages'))).toEqual({ English: 2 });
    expect(counts(facetOptions(projects, picked, 'tech'))).toEqual({ Python: 2, React: 1 });
  });

  it('applies the search, the category and the known-issues rule to counts', () => {
    expect(counts(facetOptions(projects, filters({ q: 'talmud' }), 'topics'))).toEqual({
      Gemara: 1,
    });
    expect(counts(facetOptions(projects, filters({ category: 'viz' }), 'topics'))).toEqual({
      Gemara: 1,
      Visual: 1,
    });
    expect(counts(facetOptions(projects, filters({ showBuggy: true }), 'topics')).Gemara).toBe(3);
  });

  it('hides zero-count options but keeps selected ones, with a count of 0', () => {
    const options = facetOptions(projects, filters({ languages: ['English'], topics: ['Tanakh'] }), 'topics');
    // English projects have no Tanakh, so the selected Tanakh shows 0
    expect(options.find((o) => o.value === 'Tanakh')).toEqual({
      value: 'Tanakh',
      count: 0,
      selected: true,
    });
    expect(options.find((o) => o.value === 'Gemara')).toMatchObject({ count: 2, selected: false });
    const hidden = facetOptions(projects, filters({ languages: ['Hebrew'] }), 'topics');
    expect(hidden.map((o) => o.value)).toEqual(['Tanakh']);
  });

  it('keeps a selected value that is not in the data at all', () => {
    expect(facetOptions(projects, filters({ tech: ['Rust'] }), 'tech')).toContainEqual({
      value: 'Rust',
      count: 0,
      selected: true,
    });
  });

  it('counts a project once per option', () => {
    const twice = makeProject({
      id: 9,
      sefaria_tools_used: ['/api/texts', '/api/v3/texts', 'Text'],
    });
    expect(counts(facetOptions([twice], DEFAULT_FILTERS, 'resources'))).toEqual({ Texts: 1 });
  });

  it('builds the fixture lists without hard-coded values', () => {
    const facets = filterFacets(fixtureProjects, DEFAULT_FILTERS);
    expect(facets.languages.map((o) => o.value)).toEqual(
      expect.arrayContaining(['English', 'Hebrew', 'French', 'Spanish', 'German', 'Korean'])
    );
    expect(facets.topics[0]).toMatchObject({ value: 'AI' });
    expect(facets.resources.map((o) => o.value)).not.toContain('Sefaria API');
    expect(facets.tech.map((o) => o.value)).toContain('React');
  });
});

describe('activeFilterCount', () => {
  it('counts every selected value, not search or the display option', () => {
    expect(activeFilterCount(filters({ q: 'x', showBuggy: true }))).toBe(0);
    expect(activeFilterCount(filters({ category: 'ai' }))).toBe(1);
    expect(
      activeFilterCount(filters({ category: 'ai', topics: ['a', 'b'], languages: ['English'], tech: ['React'] }))
    ).toBe(5);
  });
  it('lists the values in panel order', () => {
    expect(activeFilterValues(filters({ tech: ['React'], category: 'viz', topics: ['Gemara'] }))).toEqual([
      { key: 'category', value: 'viz' },
      { key: 'topics', value: 'Gemara' },
      { key: 'tech', value: 'React' },
    ]);
  });
});
