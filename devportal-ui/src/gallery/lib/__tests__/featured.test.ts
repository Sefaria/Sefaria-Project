import { describe, expect, it } from 'vitest';
import { getFeaturedProjects } from '../featured';
import { fixtureProjects, makeProject } from '../../test/factories';

const featured = (id: number, date: string | null, extra = {}) =>
  makeProject({ id, featured: true, submission_date: date, project_name: `P${id}`, ...extra });

describe('getFeaturedProjects', () => {
  it('returns [] when nothing is featured, and never backfills', () => {
    const projects = [makeProject({ id: 1 }), makeProject({ id: 2 })];
    expect(getFeaturedProjects(projects)).toEqual([]);
    expect(getFeaturedProjects([])).toEqual([]);
    expect(getFeaturedProjects(fixtureProjects)).toEqual([]);
  });

  it('returns only featured projects', () => {
    const projects = [makeProject({ id: 1 }), featured(2, '2026-01-01T00:00:00Z')];
    expect(getFeaturedProjects(projects).map((p) => p.id)).toEqual([2]);
  });

  it('sorts newest first and caps at 3', () => {
    const projects = [
      featured(1, '2026-01-01T00:00:00Z'),
      featured(2, '2026-04-01T00:00:00Z'),
      featured(3, '2026-03-01T00:00:00Z'),
      featured(4, '2026-02-01T00:00:00Z'),
      featured(5, null),
    ];
    expect(getFeaturedProjects(projects).map((p) => p.id)).toEqual([2, 3, 4]);
  });

  it('never features a buggy project, and fills from the next newest', () => {
    const projects = [
      featured(1, '2026-05-01T00:00:00Z', { is_buggy: true }),
      featured(2, '2026-04-01T00:00:00Z'),
      featured(3, '2026-03-01T00:00:00Z'),
      featured(4, '2026-02-01T00:00:00Z'),
    ];
    expect(getFeaturedProjects(projects).map((p) => p.id)).toEqual([2, 3, 4]);
  });

  it('orders by featured_order first, then newest; unordered projects come last', () => {
    const projects = [
      featured(1, '2026-05-01T00:00:00Z'),
      featured(2, '2026-04-01T00:00:00Z', { featured_order: 2 }),
      featured(3, '2026-03-01T00:00:00Z', { featured_order: 1 }),
      featured(4, '2026-02-01T00:00:00Z', { featured_order: 2 }),
    ];
    expect(getFeaturedProjects(projects).map((p) => p.id)).toEqual([3, 2, 4]);
  });

  it('does not mutate its input', () => {
    const projects = [featured(1, '2026-01-01T00:00:00Z'), featured(2, '2026-04-01T00:00:00Z')];
    getFeaturedProjects(projects);
    expect(projects.map((p) => p.id)).toEqual([1, 2]);
  });
});
