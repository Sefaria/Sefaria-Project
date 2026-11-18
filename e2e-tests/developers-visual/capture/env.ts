/**
 * The rendering environment fingerprint (PLAN.md §6.1.1). The capture writes it to
 * `baselines/ENV.json`; V-pixel compares the current environment with it and refuses to run when
 * the fingerprint differs.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type { Browser } from 'playwright';
import { resolveChromium } from './browser.ts';

const require = createRequire(import.meta.url);

export interface EnvFingerprint {
  playwrightVersion: string;
  chromiumVersion: string;
  /** Revision directory of the Chromium build used (e.g. `chromium_headless_shell-1243`). */
  chromiumRevision: string;
  chromiumExecutable: string;
  osImage: string;
  kernel: string;
  /** sha256 of the sorted `fc-list : family style file` output (installed system fonts). */
  fontListHash: string;
  fontCount: number;
  /** sha256 of the injected Roboto/Heebo font files, by file name. */
  injectedFonts: Record<string, string>;
  deviceScaleFactor: 1;
}

function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function osImage(): string {
  try {
    const rel = fs.readFileSync('/etc/os-release', 'utf8');
    return /^PRETTY_NAME="?([^"\n]+)"?/m.exec(rel)?.[1] ?? os.type();
  } catch {
    return `${os.type()} ${os.release()}`;
  }
}

export function fontList(): string[] {
  try {
    const out = execFileSync('fc-list', [':', 'family', 'style', 'file'], { encoding: 'utf8' });
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

export function injectedFontHashes(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fs.readdirSync(dir).sort())
    if (f.endsWith('.woff2')) out[f] = sha256(fs.readFileSync(path.join(dir, f)));
  return out;
}

export async function currentEnv(browser: Browser, fontDir: string): Promise<EnvFingerprint> {
  const exe = resolveChromium() ?? require('playwright').chromium.executablePath();
  const fonts = fontList();
  return {
    playwrightVersion: require('playwright/package.json').version,
    chromiumVersion: browser.version(),
    chromiumRevision: /chromium[^/]*-\d+/.exec(exe)?.[0] ?? 'unknown',
    chromiumExecutable: exe,
    osImage: osImage(),
    kernel: os.release(),
    fontListHash: sha256(fonts.join('\n')),
    fontCount: fonts.length,
    injectedFonts: injectedFontHashes(fontDir),
    deviceScaleFactor: 1,
  };
}

/** Fields that must match for a comparison to be valid (kernel and executable path may differ). */
export const FINGERPRINT_FIELDS = ['chromiumVersion', 'osImage', 'fontListHash', 'injectedFonts'] as const;

export function envDifferences(recorded: EnvFingerprint, current: EnvFingerprint): string[] {
  const diffs: string[] = [];
  for (const f of FINGERPRINT_FIELDS) {
    const a = JSON.stringify(recorded[f]);
    const b = JSON.stringify(current[f]);
    if (a !== b) diffs.push(`${f}: baseline ${a}, here ${b}`);
  }
  return diffs;
}
