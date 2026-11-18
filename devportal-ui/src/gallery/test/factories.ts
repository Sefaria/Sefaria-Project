import fixture from '../lib/__fixtures__/projects.json';
import { normalizeProject, normalizeProjects, type Project, type RawProject } from '../lib/project';

/** Snapshot of the production API response taken on 2026-10-08. */
export const fixtureRaw = (fixture as unknown as { projects: RawProject[] }).projects;
export const fixtureProjects: Project[] = normalizeProjects(fixtureRaw);
/** Reference "today" the fixture was captured on. */
export const FIXTURE_NOW = new Date('2026-10-08T12:00:00Z');

export function makeRaw(overrides: Partial<RawProject> = {}): RawProject {
  return {
    id: 1,
    project_name: 'Sample Project',
    project_desc: 'A sample description.',
    project_why: null,
    project_link: 'https://www.example.com/app',
    project_source_code: null,
    project_category: 'Learning & Study Tools',
    tags: [],
    sefaria_tools_used: [],
    tech_used_raw: null,
    technical_experience: null,
    project_reach: null,
    vibe_coded: false,
    is_buggy: false,
    status: 'unknown',
    featured: false,
    submission_source: 'manual',
    submission_date: '2026-03-15T10:00:00+00:00',
    created_at: '2026-03-15T10:00:00+00:00',
    image_url: null,
    has_pbs_logo: false,
    is_published: true,
    consent_to_display: true,
    ...overrides,
  };
}

export function makeProject(overrides: Partial<RawProject> = {}): Project {
  return normalizeProject(makeRaw(overrides));
}
