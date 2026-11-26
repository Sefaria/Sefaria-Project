// Test helpers for src/docs (imported by *.test.ts* only).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const REPO = resolve(import.meta.dirname, '../../..');

/** The renderer's golden HTML for a construct (devportal/contracts/golden/markdown/<name>.html). */
export function golden(name: string): string {
  return readFileSync(resolve(REPO, 'devportal/contracts/golden/markdown', `${name}.html`), 'utf8');
}

/** Mounts HTML in a .dp-markdown container attached to the document. */
export function mountArticle(html: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'dp-markdown';
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

export function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(resolve(REPO, relative), 'utf8')) as T;
}
