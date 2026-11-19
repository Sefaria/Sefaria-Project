import { galleryPath } from './paths';
import type { Project } from './project';

/** Lowercase ASCII words joined by "-". Accents are folded; anything else is dropped. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `141-torah-mcp`. Only the leading id is used for lookup, so renames never break links. */
export function projectSlug(project: Pick<Project, 'id' | 'name'>): string {
  const text = slugify(project.name);
  return text ? `${project.id}-${text}` : String(project.id);
}

export function projectPath(project: Pick<Project, 'id' | 'name'>): string {
  return galleryPath(`projects/${projectSlug(project)}`);
}

/** The id and name part of a slug, or null when it doesn't start with a positive integer. */
export function parseSlug(slug: string | undefined): { id: number; text: string } | null {
  const match = /^(\d+)(?:-(.*))?$/.exec(slug ?? '');
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? { id, text: match[2] ?? '' } : null;
}

/** The path to redirect to when the slug's name part is stale, or null when it is canonical. */
export function canonicalPath(slug: string | undefined, project: Pick<Project, 'id' | 'name'>) {
  return slug === projectSlug(project) ? null : projectPath(project);
}

/** Router state for links from the browse page, so the project page's Back can go back to it. */
export const FROM_BROWSE = { fromBrowse: true } as const;
