import { sortProjects } from './sort';
import type { Project } from './project';

export const MAX_FEATURED = 3;

const orderOf = (p: Project) => p.featuredOrder ?? Number.POSITIVE_INFINITY;

/**
 * Projects an admin has flagged `featured`, by `featured_order` and then newest, at most
 * three. Never backfilled, and never a project with known issues.
 */
export function getFeaturedProjects(projects: readonly Project[]): Project[] {
  const featured = sortProjects(
    projects.filter((p) => p.featured && !p.isBuggy),
    'new'
  );
  // Array.sort is stable, so the newest-first order survives within one featured_order.
  return featured.sort((a, b) => orderOf(a) - orderOf(b)).slice(0, MAX_FEATURED);
}
