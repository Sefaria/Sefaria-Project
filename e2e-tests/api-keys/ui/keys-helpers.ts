import { Locator, Page, Response, expect, test } from '@playwright/test';
import { DeveloperSettingsPage } from '../../pages/developerSettingsPage';
import { Target, pageFetch } from '../fixtures';
import { Gateway, GatewayResult, describe } from '../gateway';
import { t } from '../../globals';

/**
 * Shared steps for the developer-settings key suites: driving the key and project UI, and asking
 * the gateway whether a key made or changed there is accepted. Key values stay in memory only;
 * anything printed goes through describe() or names the key by its label.
 */

export const SITE_A = 'https://site-a.example.com';
export const SITE_B = 'https://site-b.example.com';
export const GATED_PATH = '/api/knn-search';
const DENY_CODES = ['api_key_required', 'api_key_invalid', 'origin_not_allowed'];

export type Probe = { allowed: boolean; status: number; code?: string; result: GatewayResult };

/**
 * Sends the key on the gated path, so the answer does not depend on how ungated paths treat
 * unknown keys. Locally the echo upstream proves the gateway's own verdict; on the cauldron
 * anything that is not a gateway denial counts as allowed.
 */
export async function probeKey(gw: Gateway, target: Target, value: string, origin?: string): Promise<Probe> {
  const result = await gw.get(GATED_PATH, { key: value, origin, host: target.hasEcho ? 'echo' : 'www', retryInfra: false });
  const allowed = target.hasEcho
    ? result.status === 200 && result.echoHeaders?.['x-sefaria-auth-result'] === 'ok'
    : result.status < 500 && result.status !== 401 && result.status !== 403 && !DENY_CODES.includes(result.code ?? '');
  return { allowed, status: result.status, code: result.code, result };
}

/** Polls until `accept` holds or the time runs out; elapsed is undefined when it never held. */
export async function poll<T>(
  attempt: () => Promise<T>,
  accept: (value: T) => boolean,
  { timeoutMs = 5000, intervalMs = 25, startedAt = Date.now() }: { timeoutMs?: number; intervalMs?: number; startedAt?: number } = {},
): Promise<{ elapsedMs?: number; last: T }> {
  const deadline = startedAt + timeoutMs;
  let last = await attempt();
  while (!accept(last)) {
    if (Date.now() > deadline) return { last };
    await new Promise(r => setTimeout(r, intervalMs));
    last = await attempt();
  }
  return { elapsedMs: Date.now() - startedAt, last };
}

export const isDenied = (code: string) => (p: Probe) => p.status === (code === 'origin_not_allowed' ? 403 : 401) && p.code === code;
export const isAllowed = (p: Probe) => p.allowed;

export function probeSummary(p: Probe): string {
  return `${describe(p.result)} allowed=${p.allowed}`;
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function annotate(type: string, description: string) {
  test.info().annotations.push({ type, description });
}

/**
 * The page object's wait is 30 s; the shared local Django can take longer than that under the
 * parallel suites, and a slow answer is not what these tests measure.
 */
export function waitForDeveloperApi(page: Page, path: RegExp, method = 'POST'): Promise<Response> {
  return page.waitForResponse(r => r.request().method() === method && path.test(new URL(r.url()).pathname), { timeout: t(120000) });
}

export async function openDeveloperSettings(page: Page): Promise<DeveloperSettingsPage> {
  const dev = new DeveloperSettingsPage(page, 'english');
  await dev.goto();
  await expect(page.getByRole('heading', { name: 'Developer settings', level: 1 })).toBeVisible({ timeout: t(30000) });
  return dev;
}

/** Creates a private project through the form and returns its id; the new card opens expanded. */
export async function createProjectInUi(dev: DeveloperSettingsPage, name: string, website?: string): Promise<string> {
  await dev.newProjectButton().first().click();
  await dev.fillNewProject({ name, description: 'Temporary project made by the api-keys e2e suite.', website, visibility: 'private' });
  const pending = waitForDeveloperApi(dev.page, /\/api\/developer\/projects$/);
  await dev.action('create-project', dev.newProjectPanel()).click();
  if (!website) await dev.action('save-without-website').click();
  const response = await pending;
  expect(response.status(), `create project ${name}`).toBe(200);
  const body = await response.json();
  await expect(dev.projectCard(name)).toBeVisible();
  await dev.expandProject(name);
  return String(body.projectId);
}

export type CreatedKey = { id: string; value: string; label: string; respondedAt: number; response: Response };

/** Creates a key through the form; resolves when the API answers, before the "Ready to use" message. */
export async function startKeyInUi(dev: DeveloperSettingsPage, card: Locator, label: string): Promise<CreatedKey> {
  await dev.action('new-key', card).first().click();
  await card.locator('#devPocKeyLabel').fill(label);
  const pending = waitForDeveloperApi(dev.page, /\/api\/developer\/projects\/[^/]+\/keys$/);
  await dev.action('create-key', card).click();
  const response = await pending;
  const respondedAt = Date.now();
  expect(response.status(), `create key ${label}`).toBe(200);
  const body = await response.json();
  const project = body.projects.find((p: any) => p.keys.some((k: any) => k.id === body.keyId));
  const key = project.keys.find((k: any) => k.id === body.keyId);
  return { id: String(body.keyId), value: key.value, label, respondedAt, response };
}

export function readyMessage(card: Locator): Locator {
  return card.locator('article.devPocKey.devPocKeyNew .devPocKeyReady');
}

export async function createKeyInUi(dev: DeveloperSettingsPage, card: Locator, label: string): Promise<CreatedKey> {
  const created = await startKeyInUi(dev, card, label);
  await expect(readyMessage(card)).toBeVisible({ timeout: t(20000) });
  return created;
}

export function keyRow(card: Locator, label: string): Locator {
  return card.locator('article.devPocKey').filter({ has: card.page().locator('strong', { hasText: new RegExp(`^${escapeRegExp(label)}$`) }) });
}

/** Revokes a key with its Delete button and the confirm dialog; resolves when the API answers. */
export async function revokeKeyInUi(dev: DeveloperSettingsPage, card: Locator, label: string): Promise<{ clickedAt: number; respondedAt: number }> {
  await keyRow(card, label).getByRole('button', { name: 'Delete key' }).click();
  const dialog = dev.page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: `Delete “${label}”?` })).toBeVisible();
  const pending = waitForDeveloperApi(dev.page, /\/api\/developer\/keys\/[^/]+$/, 'DELETE');
  const clickedAt = Date.now();
  await dialog.getByRole('button', { name: 'Delete key' }).click();
  const response = await pending;
  const respondedAt = Date.now();
  expect(response.status(), `revoke key ${label}`).toBe(200);
  return { clickedAt, respondedAt };
}

export async function openProjectEditor(card: Locator) {
  const toggle = card.getByRole('button', { name: /^(Edit project|Close editor)$/ });
  if ((await toggle.textContent())?.trim() === 'Edit project') await toggle.click();
  await expect(card.locator('#devPocProjectUrl')).toBeVisible();
}

/** Saves the open project editor with a new website ('' clears it). */
export async function saveWebsite(dev: DeveloperSettingsPage, card: Locator, website: string): Promise<{ respondedAt: number }> {
  await openProjectEditor(card);
  await card.locator('#devPocProjectUrl').fill(website);
  const pending = waitForDeveloperApi(dev.page, /\/api\/developer\/projects\/[^/]+$/);
  await dev.action('save-project', card).click();
  if (!website) await dev.action('save-without-website').click();
  const response = await pending;
  const respondedAt = Date.now();
  expect(response.status(), `save website "${website}"`).toBe(200);
  return { respondedAt };
}

export async function deleteProjectInUi(dev: DeveloperSettingsPage, card: Locator, name: string): Promise<{ respondedAt: number }> {
  await openProjectEditor(card);
  await card.getByRole('button', { name: 'Delete project' }).click();
  const dialog = dev.page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: `Delete ${name}?` })).toBeVisible();
  const pending = waitForDeveloperApi(dev.page, /\/api\/developer\/projects\/[^/]+$/, 'DELETE');
  await dialog.getByRole('button', { name: 'Delete project' }).click();
  const response = await pending;
  const respondedAt = Date.now();
  expect(response.status(), `delete project ${name}`).toBe(200);
  return { respondedAt };
}

/** Best-effort cleanup through the API; a project already deleted answers 404, which is fine. */
export async function deleteProjectQuietly(page: Page, projectId: string | undefined) {
  if (!projectId || page.isClosed()) return;
  try {
    await pageFetch(page, `/api/developer/projects/${projectId}`, { method: 'DELETE' });
  } catch { /* page gone */ }
}

export async function developerState(page: Page): Promise<any> {
  const state = await pageFetch(page, '/api/developer/state');
  expect(state.status, 'GET /api/developer/state').toBe(200);
  return state.json;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
