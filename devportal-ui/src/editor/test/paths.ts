// Repository paths for the editor's corpus tests (Vitest runs in Node, so `node:fs` is available).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Vitest and the scripts run from devportal-ui/.
export const REPO_ROOT = resolve(process.cwd(), '..');
export const CONTRACTS = join(REPO_ROOT, 'devportal/contracts');
export const MIGRATION_SOURCE = join(REPO_ROOT, 'devportal/migration_source');

export function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** Every Markdown file under `dir`, sorted, as `[relative path, absolute path]`. */
export function markdownFiles(dir: string): [string, string][] {
  const out: [string, string][] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.md')) out.push([relative(dir, path), path]);
    }
  };
  walk(dir);
  return out;
}
