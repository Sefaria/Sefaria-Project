import { normalizeProjects, type Project, type RawProject } from './project';

/** Same origin: the developers host serves `powered_by.views.powered_by_api` (PLAN §2.14 item 2, C9 powered-by-api). */
export const PROJECTS_URL = '/api/powered-by';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The single API client: one request, normalised into domain projects. */
export async function fetchProjects(
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  url: string = PROJECTS_URL
): Promise<Project[]> {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new ApiError(`Failed to load projects (${response.status})`, response.status);
  const body = (await response.json()) as { projects?: RawProject[] };
  if (!Array.isArray(body.projects)) throw new ApiError('Unexpected response shape');
  return normalizeProjects(body.projects);
}
