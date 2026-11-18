import { describe, expect, it } from 'vitest';
import {
  builtWith,
  cumulativeByYear,
  experienceByMonth,
  mostRecentCompletedMonth,
  reachBuckets,
  resourcesUsed,
  submissionsByYear,
  topTags,
  vibeCodedByMonth,
} from '../selectors';
import { FIXTURE_NOW, fixtureProjects, makeProject } from '../../../test/factories';

describe('mostRecentCompletedMonth', () => {
  it('is the month before today in UTC', () => {
    expect(mostRecentCompletedMonth(new Date('2026-10-08T12:00:00Z'))).toEqual({
      year: 2026,
      monthIndex: 8,
    });
    expect(mostRecentCompletedMonth(new Date('2026-01-01T00:00:00Z'))).toEqual({
      year: 2025,
      monthIndex: 11,
    });
  });
});

describe('submissionsByYear', () => {
  it('matches the production fixture', () => {
    const { rows, total, undated } = submissionsByYear(fixtureProjects, FIXTURE_NOW);
    expect(total).toBe(134);
    expect(undated).toBe(24);
    expect(rows.find((r) => r.year === 2026)?.count).toBe(58);
    expect(rows.at(-1)?.year).toBe(2026);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(134 - 24);
  });

  it('includes zero years between the earliest and the current year', () => {
    const projects = [
      makeProject({ id: 1, submission_date: '2022-05-01T00:00:00Z' }),
      makeProject({ id: 2, submission_date: '2024-05-01T00:00:00Z' }),
    ];
    expect(submissionsByYear(projects, new Date('2025-02-01T00:00:00Z')).rows).toEqual([
      { year: 2022, count: 1 },
      { year: 2023, count: 0 },
      { year: 2024, count: 1 },
      { year: 2025, count: 0 },
    ]);
  });

  it('handles no dated projects', () => {
    const rows = submissionsByYear([makeProject({ submission_date: null })], FIXTURE_NOW).rows;
    expect(rows).toEqual([{ year: 2026, count: 0 }]);
  });
});

describe('cumulativeByYear', () => {
  it('is a running total of dated projects ending at the dated count', () => {
    const rows = cumulativeByYear(fixtureProjects, FIXTURE_NOW);
    expect(rows.at(-1)?.total).toBe(110);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.total).toBeGreaterThanOrEqual(rows[i - 1]!.total);
  });
});

describe('experienceByMonth', () => {
  it('reports 34 dated projects with experience in the fixture (up to the last completed month)', () => {
    const { rows, n } = experienceByMonth(fixtureProjects, FIXTURE_NOW);
    expect(n).toBeLessThanOrEqual(34);
    expect(n).toBeGreaterThan(30);
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(n);
    expect(rows.at(-1)?.month).toBe('Sep 2026');
  });

  it('starts at the earliest month with a known level and zero-fills gaps', () => {
    const projects = [
      makeProject({
        id: 1,
        submission_date: '2026-05-10T00:00:00Z',
        technical_experience: '10+ years',
      }),
      makeProject({ id: 2, submission_date: '2026-07-10T00:00:00Z', technical_experience: 'None' }),
      makeProject({ id: 3, submission_date: '2026-01-10T00:00:00Z', technical_experience: '' }),
    ];
    const { rows, n } = experienceByMonth(projects, new Date('2026-08-15T00:00:00Z'));
    expect(n).toBe(2);
    expect(rows.map((r) => r.month)).toEqual(['May 2026', 'Jun 2026', 'Jul 2026']);
    expect(rows[1]).toMatchObject({ none: 0, beginner: 0, intermediate: 0, advanced: 0, total: 0 });
    expect(rows[0]).toMatchObject({ advanced: 1, total: 1 });
    expect(rows[2]).toMatchObject({ none: 1, total: 1 });
  });

  it('returns nothing when no dated project has a level', () => {
    expect(experienceByMonth([makeProject({ technical_experience: '' })], FIXTURE_NOW)).toEqual({
      rows: [],
      n: 0,
    });
  });
});

describe('vibeCodedByMonth', () => {
  it('covers the trailing 12 completed months', () => {
    const rows = vibeCodedByMonth(fixtureProjects, FIXTURE_NOW);
    expect(rows).toHaveLength(12);
    expect(rows[0]!.month).toBe('Oct 2025');
    expect(rows.at(-1)!.month).toBe('Sep 2026');
  });

  it('splits vibe-coded from not and ignores out-of-window months', () => {
    const projects = [
      makeProject({ id: 1, submission_date: '2026-09-02T00:00:00Z', vibe_coded: true }),
      makeProject({ id: 2, submission_date: '2026-09-20T00:00:00Z', vibe_coded: false }),
      makeProject({ id: 3, submission_date: '2026-10-02T00:00:00Z', vibe_coded: true }),
      makeProject({ id: 4, submission_date: '2020-01-02T00:00:00Z', vibe_coded: true }),
      makeProject({ id: 5, submission_date: null, vibe_coded: true }),
    ];
    const last = vibeCodedByMonth(projects, FIXTURE_NOW).at(-1);
    expect(last).toMatchObject({ vibe: 1, notVibe: 1, total: 2 });
    expect(vibeCodedByMonth(projects, FIXTURE_NOW).reduce((s, r) => s + r.total, 0)).toBe(2);
  });
});

describe('topTags', () => {
  it('matches the production fixture and hides English', () => {
    const { rows, englishCount } = topTags(fixtureProjects);
    expect(rows).toHaveLength(10);
    expect(rows.find((r) => r.label === 'English')).toBeUndefined();
    expect(englishCount).toBeGreaterThan(100);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.count]));
    expect(byLabel).toMatchObject({ AI: 36, Gemara: 18, Tanakh: 13, Hebrew: 13 });
    expect(rows[0]).toEqual({ label: 'AI', count: 36 });
  });
  it('counts the Kabbalah alias together', () => {
    const projects = [makeProject({ tags: ['Kaballah'] }), makeProject({ id: 2, tags: ['Kabbalah'] })];
    expect(topTags(projects).rows).toEqual([{ label: 'Kabbalah', count: 2 }]);
  });
});

describe('resourcesUsed', () => {
  it('groups the Texts bucket at 38 on the fixture and has no Other/Sefaria API bar', () => {
    const rows = resourcesUsed(fixtureProjects);
    expect(rows.find((r) => r.label === 'Texts')?.count).toBe(38);
    expect(rows[0]?.label).toBe('Texts');
    expect(rows.map((r) => r.label)).not.toContain('Other');
    expect(rows.map((r) => r.label)).not.toContain('Sefaria API');
  });
  it('counts a project once per group even with several endpoints', () => {
    const p = makeProject({ sefaria_tools_used: ['/api/texts', '/api/v3/texts/', 'Text'] });
    expect(resourcesUsed([p])).toEqual([{ label: 'Texts', count: 1 }]);
  });
});

describe('builtWith', () => {
  it('returns at most 8 rows from the projects that described a stack', () => {
    const { rows, n } = builtWith(fixtureProjects);
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(n).toBeGreaterThan(0);
    expect(rows.map((r) => r.label)).not.toContain('Sefaria MCP');
  });
  it('counts Claude Code separately and each project once per technology', () => {
    const projects = [
      makeProject({ id: 1, tech_used_raw: 'Claude Code, React, react-dom' }),
      makeProject({ id: 2, tech_used_raw: 'React' }),
      makeProject({ id: 3, tech_used_raw: null }),
    ];
    const { rows, n } = builtWith(projects);
    expect(n).toBe(2);
    expect(rows).toEqual([
      { label: 'React', count: 2 },
      { label: 'Claude Code', count: 1 },
    ]);
  });
});

describe('reachBuckets', () => {
  it('is reported by 11 projects in the fixture, in bucket order', () => {
    const { rows, reported, total } = reachBuckets(fixtureProjects);
    expect(reported).toBe(11);
    expect(total).toBe(134);
    expect(rows.map((r) => r.bucket)).toEqual(['poc', 'lt10', '10', '100', '1000']);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(11);
  });
});
