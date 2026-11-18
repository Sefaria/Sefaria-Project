import { describe, expect, it } from 'vitest';
import { parseQueryState } from '../url';
import { SORT_LABELS, sortProjects } from '../sort';
import { makeProject } from '../../test/factories';

const a = makeProject({ id: 1, project_name: 'Alpha', submission_date: '2025-01-01T00:00:00Z' });
const b = makeProject({ id: 2, project_name: 'Beta', submission_date: '2026-01-01T00:00:00Z' });
const zUndated = makeProject({ id: 3, project_name: 'Zeta', submission_date: null });
const cUndated = makeProject({ id: 4, project_name: 'Charlie', submission_date: null });
const input = [zUndated, a, cUndated, b];

describe('sortProjects', () => {
  it('newest puts dated projects first, newest to oldest, undated last A–Z', () => {
    expect(sortProjects(input, 'new').map((p) => p.name)).toEqual(['Beta', 'Alpha', 'Charlie', 'Zeta']);
  });

  it('A–Z uses locale compare regardless of dates', () => {
    expect(sortProjects(input, 'az').map((p) => p.name)).toEqual(['Alpha', 'Beta', 'Charlie', 'Zeta']);
  });

  it('does not mutate its input', () => {
    const copy = [...input];
    sortProjects(input, 'az');
    expect(input).toEqual(copy);
  });

  it('offers only Newest and A–Z', () => {
    expect(Object.keys(SORT_LABELS)).toEqual(['new', 'az']);
  });

  it.each(['users', 'popular', 'bogus'])('falls back to newest for ?sort=%s', (sort) => {
    expect(parseQueryState(`sort=${sort}`).sort).toBe('new');
  });
});
