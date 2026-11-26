import { describe, expect, it } from 'vitest';
import { cleanResources, cleanTopics, detailTopics, normalizeProjects, safeUrl, splitTags } from '../project';
import { resourceGroup } from '../endpoints';
import { resourcesUsed } from '../../features/charts/selectors';
import { fixtureProjects, fixtureRaw, makeProject, makeRaw } from '../../test/factories';

describe('normalizeProjects visibility', () => {
  it('keeps only published projects, whatever their consent flag', () => {
    const raw = [
      makeRaw({ id: 1 }),
      makeRaw({ id: 2, is_published: false }),
      makeRaw({ id: 3, consent_to_display: false }),
    ];
    expect(normalizeProjects(raw).map((p) => p.id)).toEqual([1, 3]);
  });

  it('yields 134 visible projects from the production fixture', () => {
    expect(fixtureProjects).toHaveLength(134);
    expect(fixtureRaw.length).toBeGreaterThanOrEqual(134);
  });
});

describe('normalizeProject', () => {
  it('maps core fields and derives the domain without www.', () => {
    const p = makeProject({ project_name: '  Name ', project_why: ' Because ' });
    expect(p).toMatchObject({
      name: 'Name',
      backstory: 'Because',
      url: 'https://www.example.com/app',
      domain: 'example.com',
    });
  });

  it('nulls unsafe or missing URLs', () => {
    const p = makeProject({ project_link: 'javascript:alert(1)', project_source_code: 'ftp://x' });
    expect(p.url).toBeNull();
    expect(p.domain).toBeNull();
    expect(p.sourceUrl).toBeNull();
    expect(makeProject({ project_link: null }).url).toBeNull();
  });

  it('accepts http(s) source URLs', () => {
    expect(makeProject({ project_source_code: 'https://github.com/a/b' }).sourceUrl).toBe('https://github.com/a/b');
  });

  it('treats blank backstory, builtWith and null description as empty', () => {
    const p = makeProject({ project_why: '  ', tech_used_raw: '', project_desc: null });
    expect(p.backstory).toBeNull();
    expect(p.builtWith).toBeNull();
    expect(p.description).toBe('');
  });

  it('parses categories (comma, no comma, legacy, none)', () => {
    const cat = (project_category: string | null) => makeProject({ project_category }).categories;
    expect(cat('Learning & Study Tools AI Projects, Apps, & Other Tools')).toEqual(['learn', 'ai']);
    expect(cat('AI Projects, Apps, & Other Tools,Learning & Study Tools')).toEqual(['ai', 'learn']);
    expect(cat('Extensions and API Integrations')).toEqual(['ext']);
    expect(cat('')).toEqual(['none']);
    expect(cat(null)).toEqual(['none']);
    expect(cat('Something else')).toEqual(['none']);
  });

  it('parses reach, experience, vibe-coded and tech', () => {
    const p = makeProject({
      project_reach: '~100',
      technical_experience: '<5 years',
      vibe_coded: true,
      tech_used_raw: 'React and Claude Code',
    });
    expect(p).toMatchObject({ reach: '100', experience: 'beginner', vibeCoded: true });
    expect(p.techMentions).toEqual(['Claude Code', 'React']);
  });

  it('parses submittedAt and tolerates garbage', () => {
    expect(makeProject({ submission_date: '2026-07-19T14:54:00+00:00' }).submittedAt).toEqual(
      new Date('2026-07-19T14:54:00Z')
    );
    expect(makeProject({ submission_date: null }).submittedAt).toBeNull();
    expect(makeProject({ submission_date: 'nope' }).submittedAt).toBeNull();
  });
});

describe('cleanTopics', () => {
  it('trims, dedupes case-insensitively and aliases Kaballah', () => {
    expect(cleanTopics([' AI ', 'ai', 'Kaballah', 'Kabbalah', 'kaballah'])).toEqual(['AI', 'Kabbalah']);
  });

  it('drops dates and meta tags', () => {
    expect(
      cleanTopics(['May 2026', 'february 2026', 'not vibe-coded', 'No Experience', 'Experience Unspecified', 'Gemara'])
    ).toEqual(['Gemara']);
  });

  it('splits language tags out of topics; the detail view falls back to them when alone', () => {
    const both = makeProject({ tags: ['English', 'Gemara'] });
    expect(both.topics).toEqual(['Gemara']);
    expect(both.languages).toEqual(['English']);
    expect(detailTopics(both)).toEqual(['Gemara']);
    const only = makeProject({ tags: ['English'] });
    expect(only.topics).toEqual([]);
    expect(detailTopics(only)).toEqual(['English']);
  });
});

describe('splitTags', () => {
  it('separates languages (any case) from topics, in first-seen order', () => {
    expect(splitTags(['english', 'AI', 'Hebrew', 'French', 'Gemara', 'Korean', 'German'])).toEqual({
      topics: ['AI', 'Gemara'],
      languages: ['English', 'Hebrew', 'French', 'Korean', 'German'],
    });
  });
  it('recognises other language names and drops junk tags first', () => {
    expect(splitTags(['Yiddish', 'Russian', 'May 2026', 'not vibe-coded', 'Spanish'])).toEqual({
      topics: [],
      languages: ['Yiddish', 'Russian', 'Spanish'],
    });
  });
  it('keeps tags that merely contain a language word as topics', () => {
    expect(splitTags(['Hebrew grammar']).topics).toEqual(['Hebrew grammar']);
  });
  it('splits every tag of the production fixture exactly once', () => {
    for (const p of fixtureProjects) {
      expect(new Set([...p.topics, ...p.languages]).size).toBe(p.topics.length + p.languages.length);
    }
    const languages = new Set(fixtureProjects.flatMap((p) => p.languages));
    expect([...languages].sort()).toEqual(['English', 'French', 'German', 'Hebrew', 'Korean', 'Spanish'].sort());
  });
});

describe('resourceGroups', () => {
  it('maps endpoints and names to groups, dropping "Sefaria API" and unmapped values', () => {
    const p = makeProject({
      sefaria_tools_used: ['/api/texts/', '/api/v3/texts', 'Sefaria API', 'Documentation', '/api/zzz'],
    });
    expect(p.resourceGroups).toEqual(['Texts', 'Documentation']);
  });
  it('matches the /charts "Sefaria resources used" grouping on the fixture', () => {
    const counts = new Map<string, number>();
    for (const p of fixtureProjects) {
      expect(p.resourceGroups).toEqual([...new Set(p.resources.map(resourceGroup).filter((g) => g !== null))]);
      for (const group of p.resourceGroups) counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    const chart = Object.fromEntries(resourcesUsed(fixtureProjects).map((r) => [r.label, r.count]));
    expect(Object.fromEntries(counts)).toEqual(chart);
  });
});

describe('featured and buggy flags', () => {
  it('carries featured and isBuggy from the raw flags', () => {
    expect(makeProject({ featured: true, is_buggy: true })).toMatchObject({
      featured: true,
      isBuggy: true,
    });
    expect(makeProject()).toMatchObject({ featured: false, isBuggy: false });
  });
  it('has 12 buggy and no featured projects in the production fixture', () => {
    expect(fixtureProjects.filter((p) => p.isBuggy)).toHaveLength(12);
    expect(fixtureProjects.filter((p) => p.featured)).toHaveLength(0);
  });
});

describe('cleanResources', () => {
  it('keeps strings only, trims, dedupes and removes trailing slashes', () => {
    expect(cleanResources(['/api/texts/', ' /api/texts ', 'Sefaria API', null, 42, { a: 1 }, '', '/'])).toEqual([
      '/api/texts',
      'Sefaria API',
      '/',
    ]);
  });
});

describe('safeUrl', () => {
  it('only allows http and https', () => {
    expect(safeUrl('https://a.org')).not.toBeNull();
    expect(safeUrl('http://a.org')).not.toBeNull();
    expect(safeUrl('mailto:a@b.c')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
  });
});
