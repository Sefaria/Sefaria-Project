import type { Project } from './project';

export type SortOption = 'new' | 'az';
export const DEFAULT_SORT: SortOption = 'new';

export const SORT_LABELS: Record<SortOption, string> = { new: 'Newest', az: 'A–Z' };

const byName = (a: Project, b: Project) => a.name.localeCompare(b.name);

/** Newest first with undated projects last (A–Z among themselves), or A–Z. Pure. */
export function sortProjects(projects: readonly Project[], sort: SortOption): Project[] {
  if (sort === 'az') return [...projects].sort(byName);
  return [...projects].sort((a, b) => {
    if (a.submittedAt && b.submittedAt) {
      return b.submittedAt.getTime() - a.submittedAt.getTime() || byName(a, b);
    }
    if (a.submittedAt) return -1;
    if (b.submittedAt) return 1;
    return byName(a, b);
  });
}
