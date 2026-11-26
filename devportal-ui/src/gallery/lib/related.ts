import { sortProjects } from './sort';
import type { Project } from './project';

export const MAX_RELATED = 3;

/** Same primary category, newest first, never the project itself or one with known issues. */
export function getRelatedProjects(project: Project, all: readonly Project[]): Project[] {
  const primary = project.categories[0] ?? 'none';
  const pool = all.filter((p) => p.id !== project.id && !p.isBuggy && (p.categories[0] ?? 'none') === primary);
  return sortProjects(pool, 'new').slice(0, MAX_RELATED);
}
