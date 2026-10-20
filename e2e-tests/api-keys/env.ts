import fs from 'fs';
import path from 'path';

/**
 * Target resolution, manifest access and secret masking for the api-keys suites.
 *
 * Imported by playwright.config.ts, so it must stay free of side effects at import time:
 * nothing here reads the manifest or throws until a function is called.
 * The names, ports and formats come from CONTRACT.md.
 */

export type TargetName = 'local' | 'cauldron';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const SUITE_DIR = __dirname;
/** Logged-in storage states. APIKEYS_AUTH_DIR gives a run its own directory, so runs against different targets never share one. */
export const AUTH_DIR = process.env.APIKEYS_AUTH_DIR
  ? path.resolve(REPO_ROOT, process.env.APIKEYS_AUTH_DIR)
  : path.join(SUITE_DIR, '.auth');
export const RESULTS_DIR = path.join(SUITE_DIR, 'results');

export const LOCAL_PORTS = {
  envoyStrip: 10080,
  envoyNoStrip: 10081,
  nginxDirect: 18088,
  authHttp: 18080,
  mailpit: 18025,
} as const;

export const CAULDRON_NAME = process.env.APIKEYS_CAULDRON || 'apikeys-pipeline';
export const CAULDRON_HOST = `www.${CAULDRON_NAME}.cauldron.sefaria.org`;
export const CAULDRON_KUBE_CONTEXT = 'gke_development-205018_us-east1-b_cluster-1';

const BASE_URLS: Record<TargetName, string> = {
  local: `http://www.gateway.test:${LOCAL_PORTS.envoyStrip}`,
  cauldron: `https://${CAULDRON_HOST}`,
};

const ALLOWED_BROWSER_HOSTS = [/^([a-z]+\.)?gateway\.test$/, new RegExp(`^${CAULDRON_HOST.replace(/\./g, '\\.')}$`)];
const ALLOWED_API_HOSTS = [/^127\.0\.0\.1$/, ...ALLOWED_BROWSER_HOSTS];

export function isTargetName(value: string | undefined): value is TargetName {
  return value === 'local' || value === 'cauldron';
}

/** The target named by APIKEYS_TARGET, or undefined when unset. Throws on any other value. */
export function requestedTarget(): TargetName | undefined {
  const raw = process.env.APIKEYS_TARGET;
  if (raw === undefined || raw === '') return undefined;
  if (!isTargetName(raw)) {
    throw new Error(
      `APIKEYS_TARGET=${raw} is not a target. Only "local" (the Docker stack on *.gateway.test) and ` +
      `"cauldron" (${CAULDRON_HOST}) exist; live and staging hosts are refused.`
    );
  }
  return raw;
}

export function baseURLFor(target: TargetName): string {
  return BASE_URLS[target];
}

export function workersFor(target: TargetName): number {
  const requested = Number(process.env.APIKEYS_WORKERS || (target === 'local' ? 4 : 2));
  const cap = target === 'local' ? 4 : 2;
  if (!Number.isFinite(requested) || requested < 1) return 1;
  return Math.min(Math.floor(requested), cap);
}

/** Refuses any URL whose host is not part of the two targets. */
export function assertAllowedUrl(url: string, kind: 'browser' | 'api' = 'api') {
  const host = new URL(url).hostname;
  const allowed = kind === 'browser' ? ALLOWED_BROWSER_HOSTS : ALLOWED_API_HOSTS;
  if (!allowed.some(re => re.test(host))) {
    throw new Error(`Refusing to send an api-keys test request to ${host}: not the local stack or the ${CAULDRON_NAME} cauldron.`);
  }
}

export function manifestPath(): string {
  const override = process.env.APIKEYS_MANIFEST;
  if (override) return path.isAbsolute(override) ? override : path.resolve(REPO_ROOT, override);
  return path.join(REPO_ROOT, 'e2e-tests', '.apikeys-e2e.json');
}

export function manifestExists(): boolean {
  return fs.existsSync(manifestPath());
}

export type ManifestAccount = {
  suite: string;
  role: string;
  id: number;
  email: string;
  state: string;
  why: string;
};

export type ManifestProject = {
  suite: string;
  role: string;
  id: number;
  name: string;
  kind: 'developer' | 'listing';
  deleted: boolean;
};

export type ManifestKey = {
  suite: string;
  name: string;
  id: number;
  projectId: number;
  value: string;
  allowedOrigins: string[];
  revoked: boolean;
};

export type ManifestLegacyKey = {
  suite: string;
  role: string;
  value: string;
  mongoId: string;
};

export type Manifest = {
  schemaVersion: number;
  target: TargetName;
  baseURL: string;
  runId: string;
  marker: string;
  createdAt: string;
  passwordFile: string;
  accounts: ManifestAccount[];
  projects: ManifestProject[];
  keys: ManifestKey[];
  legacyKeys: ManifestLegacyKey[];
};

let cachedManifest: Manifest | undefined;

export function loadManifest(): Manifest {
  if (cachedManifest) return cachedManifest;
  const file = manifestPath();
  if (!fs.existsSync(file)) {
    throw new Error(
      `No api-keys fixture manifest at ${file}. Seed first: ` +
      `python scripts/dev/seed_api_keys_e2e.py --target <local|cauldron> --reset --manifest-stdout > ${file}`
    );
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Manifest;
  if (parsed.schemaVersion !== 1) {
    throw new Error(`Manifest ${file} has schemaVersion ${parsed.schemaVersion}; this scaffold reads version 1.`);
  }
  for (const field of ['accounts', 'projects', 'keys', 'legacyKeys'] as const) {
    if (!Array.isArray(parsed[field])) (parsed as any)[field] = [];
  }
  cachedManifest = parsed;
  return parsed;
}

/**
 * The effective target: APIKEYS_TARGET, which must agree with the manifest. A manifest seeded on
 * one target holds ids and key values that mean nothing on the other.
 */
export function resolveTarget(): TargetName {
  const manifest = loadManifest();
  const requested = requestedTarget();
  if (!requested) {
    throw new Error('APIKEYS_TARGET is required (local or cauldron).');
  }
  if (manifest.target !== requested) {
    throw new Error(
      `APIKEYS_TARGET=${requested} but the manifest at ${manifestPath()} was seeded for "${manifest.target}". ` +
      `Re-seed for ${requested}, or point APIKEYS_MANIFEST at the matching file.`
    );
  }
  return requested;
}

export function passwordFilePath(): string {
  const fromEnv = process.env.APIKEYS_E2E_PASSWORD_FILE;
  if (fromEnv) return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(REPO_ROOT, fromEnv);
  if (cachedManifest?.passwordFile) return cachedManifest.passwordFile;
  return path.join(REPO_ROOT, '.claude', 'scratch', 'api-keys-e2e', 'password');
}

export function readPassword(): string {
  const file = passwordFilePath();
  if (!fs.existsSync(file)) {
    throw new Error(`Password file ${file} does not exist. Set APIKEYS_E2E_PASSWORD_FILE to the file the seed script used.`);
  }
  const value = fs.readFileSync(file, 'utf-8').trim();
  if (!value) throw new Error(`Password file ${file} is empty.`);
  return value;
}

export function findAccount(suite: string, role: string): ManifestAccount {
  const account = loadManifest().accounts.find(a => a.suite === suite && a.role === role);
  if (!account) throw new Error(`The manifest has no account ${suite}.${role}. Check CONTRACT.md §3 and re-seed.`);
  return account;
}

export function findKey(suite: string, name: string): ManifestKey {
  const key = loadManifest().keys.find(k => k.suite === suite && k.name === name);
  if (!key) throw new Error(`The manifest has no key ${suite}.${name}.`);
  return key;
}

export function accountKey(account: Pick<ManifestAccount, 'suite' | 'role'>): string {
  return `${account.suite}.${account.role}`;
}

export function authFile(suite: string, role: string): string {
  return path.join(AUTH_DIR, `${suite}.${role}.json`);
}

export const AUTH_STATUS_FILE = path.join(AUTH_DIR, '_status.json');

/** First four characters only, as the safety rules require for any key in output. */
export function maskKey(value: string | undefined | null): string {
  if (!value) return String(value);
  return value.length <= 4 ? '****' : `${value.slice(0, 4)}…`;
}

const KEY_PATTERN = /sfr_[A-Za-z0-9_-]{1,}/g;

/** Masks every manifest key value and anything shaped like an sfr_ key inside free text. */
export function maskSecrets(text: string): string {
  let out = text;
  if (cachedManifest) {
    for (const k of [...cachedManifest.keys, ...cachedManifest.legacyKeys]) {
      if (k.value) out = out.split(k.value).join(maskKey(k.value));
    }
  }
  return out.replace(KEY_PATTERN, m => maskKey(m));
}
