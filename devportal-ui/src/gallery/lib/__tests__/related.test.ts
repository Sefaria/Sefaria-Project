import { describe, expect, it } from 'vitest';
import { getRelatedProjects } from '../related';
import { makeProject } from '../../test/factories';

const learn = 'Learning & Study Tools';
const ai = 'AI Projects, Apps, & Other Tools';
const p = (id: number, category: string, date: string, extra = {}) =>
  makeProject({
    id,
    project_name: `P${id}`,
    project_category: category,
    submission_date: date,
    ...extra,
  });

describe('getRelatedProjects', () => {
  const current = p(1, ai, '2026-01-01T00:00:00Z');

  it('shares the primary category, excludes itself and known-issues projects, newest first', () => {
    const all = [
      current,
      p(2, ai, '2026-02-01T00:00:00Z'),
      p(3, learn, '2026-09-01T00:00:00Z'),
      p(4, ai, '2026-03-01T00:00:00Z', { is_buggy: true }),
      p(5, ai, '2026-05-01T00:00:00Z'),
    ];
    expect(getRelatedProjects(current, all).map((x) => x.id)).toEqual([5, 2]);
  });

  it('returns at most three', () => {
    const all = [current, ...[2, 3, 4, 5, 6].map((id) => p(id, ai, `2026-0${id}-01T00:00:00Z`))];
    expect(getRelatedProjects(current, all).map((x) => x.id)).toEqual([6, 5, 4]);
  });

  it('matches on the primary category only', () => {
    const multi = p(1, `${learn} ${ai}`, '2026-01-01T00:00:00Z');
    const other = p(2, `${ai} ${learn}`, '2026-02-01T00:00:00Z');
    expect(getRelatedProjects(multi, [multi, other])).toEqual([]);
  });

  it('is empty when nothing matches', () => {
    expect(getRelatedProjects(current, [current])).toEqual([]);
  });
});
