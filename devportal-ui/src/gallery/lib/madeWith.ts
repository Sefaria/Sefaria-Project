import type { Project } from './project';

export const MADE_WITH_FALLBACK = 'Sefaria texts';

/** The first two Sefaria resources, for the featured card's "Made with" tag. */
export function madeWithResources(project: Pick<Project, 'resources'>): string[] {
  return project.resources.length > 0 ? project.resources.slice(0, 2) : [MADE_WITH_FALLBACK];
}

export function madeWithText(project: Pick<Project, 'resources'>): string {
  return `Made with ${madeWithResources(project).join(' · ')}`;
}
