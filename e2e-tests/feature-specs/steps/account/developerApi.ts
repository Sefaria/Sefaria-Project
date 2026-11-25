// Test data for the Developer Settings stories, set up through the app's own developer API
// (powered_by/developer_views.py) as the logged-in test account. No step here clicks through
// the UI: Given-steps use this to put the account in a known state, fast.
//
// The developer test account (PLAYWRIGHT_DEV_USER_*) belongs to these stories alone: reset()
// deletes every project and key it has.
import { APIRequestContext, Page, expect } from '@playwright/test';

export type DevKey = {
  id: string;
  label: string;
  prefix?: string;
  restrictToWebsite?: boolean;
};

export type DevProject = {
  id: string;
  name: string;
  description?: string;
  websiteUrl?: string;
  purpose?: string | null;
  visibility?: string;
  keys: DevKey[];
  [field: string]: unknown;
};

export type DevState = {
  developerEnabled: boolean;
  emailVerified: boolean;
  confirmationSentAt: string | null;
  profile: Record<string, unknown> | null;
  projects: DevProject[];
  maxKeysPerProject: number;
  maxProjects: number;
};

export type NewProject = {
  name: string;
  description?: string;
  purpose?: string | null;
  websiteUrl?: string;
  organization?: string;
};

/** The API takes a full address; stories write bare domains ("example.com"). */
export const fullUrl = (site?: string) => (!site ? '' : /^https?:\/\//.test(site) ? site : `https://${site}`);

/** The developer API, called with the browser context's session (cookies) and CSRF token. */
export class DeveloperApi {
  constructor(private readonly page: Page) {}

  private get request(): APIRequestContext {
    return this.page.request;
  }

  private origin(): string {
    return new URL(this.page.url()).origin;
  }

  private async csrf(): Promise<string> {
    const cookies = await this.page.context().cookies(this.origin());
    const token = cookies.find((c) => c.name === 'csrftoken')?.value;
    if (!token) throw new Error('No csrftoken cookie: open a Sefaria page before calling the developer API.');
    return token;
  }

  private async call(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) {
    const url = `${this.origin()}/api/developer/${path}`;
    const headers: Record<string, string> = { Referer: this.origin() + '/settings/developer' };
    if (method !== 'GET') headers['X-CSRFToken'] = await this.csrf();
    const response = await this.request.fetch(url, {
      method,
      headers,
      data: body === undefined ? undefined : body,
    });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    return { status: response.status(), json, text };
  }

  async state(): Promise<DevState> {
    const r = await this.call('GET', 'state');
    expect(r.status, `GET /api/developer/state: ${r.text.slice(0, 200)}`).toBe(200);
    return r.json as DevState;
  }

  /** Deletes every project (and so every key) the account has. */
  async reset(): Promise<void> {
    const { projects } = await this.state();
    for (const p of projects) {
      const r = await this.call('DELETE', `projects/${p.id}`);
      expect(r.status, `DELETE project ${p.name}: ${r.text.slice(0, 200)}`).toBe(200);
    }
  }

  async createProject(project: NewProject): Promise<DevProject> {
    const body = {
      project: {
        description: `What ${project.name} does`,
        purpose: 'personal',
        organization: '',
        websiteUrl: '',
        aiAssisted: false,
        visibility: 'private',
        ...project,
        websiteUrl: fullUrl(project.websiteUrl),
      },
    };
    const r = await this.call('POST', 'projects', body);
    expect(r.status, `POST /api/developer/projects: ${r.text.slice(0, 300)}`).toBe(200);
    const created = (r.json as DevState).projects.find((p) => String(p.id) === String(r.json.projectId));
    if (!created) throw new Error(`Created project ${project.name} is missing from the state`);
    return created;
  }

  async updateProject(id: string, fields: Partial<NewProject> & Record<string, unknown>): Promise<DevState> {
    const current = (await this.state()).projects.find((p) => String(p.id) === String(id));
    if (!current) throw new Error(`No project ${id}`);
    const r = await this.call('POST', `projects/${id}`, {
      project: {
        name: current.name,
        description: current.description,
        organization: (current as any).organization ?? '',
        websiteUrl: current.websiteUrl ?? '',
        aiAssisted: (current as any).aiAssisted ?? false,
        visibility: current.visibility ?? 'private',
        ...fields,
        websiteUrl: fullUrl((fields.websiteUrl as string | undefined) ?? (current.websiteUrl as string | undefined)),
      },
    });
    expect(r.status, `POST project ${id}: ${r.text.slice(0, 300)}`).toBe(200);
    return r.json as DevState;
  }

  /** Creates a key and returns it with its full value (the only response that carries one). */
  async createKey(projectId: string, label: string): Promise<DevKey & { value: string }> {
    const r = await this.call('POST', `projects/${projectId}/keys`, { label });
    expect(r.status, `POST key ${label}: ${r.text.slice(0, 300)}`).toBe(200);
    const project = (r.json as DevState).projects.find((p) => String(p.id) === String(projectId))!;
    const key = project.keys.find((k) => String(k.id) === String(r.json.keyId))!;
    return { ...key, value: r.json.keyValue };
  }

  async restrictKey(keyId: string, on: boolean): Promise<void> {
    const r = await this.call('POST', `keys/${keyId}`, { restrictToWebsite: on });
    expect(r.status, `POST key restriction: ${r.text.slice(0, 200)}`).toBe(200);
  }

  async deleteKey(keyId: string): Promise<void> {
    const r = await this.call('DELETE', `keys/${keyId}`);
    expect(r.status, `DELETE key: ${r.text.slice(0, 200)}`).toBe(200);
  }

  async keyValue(keyId: string): Promise<string> {
    const r = await this.call('POST', `keys/${keyId}/value`);
    expect(r.status, `POST key value: ${r.text.slice(0, 200)}`).toBe(200);
    return r.json.value;
  }

  /** Stops waiting for a confirmation link (the "new developer" account starts clean). */
  async cancelConfirmation(): Promise<void> {
    const r = await this.call('DELETE', 'confirmation');
    expect([200, 403, 404], `DELETE confirmation: ${r.text.slice(0, 200)}`).toContain(r.status);
  }
}
