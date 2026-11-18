// prerender.ts (PLAN §2.5, §2.8). Phase 0 stub; W3 owns it from Phase 2 (header: W2, Phase 1).
//
// Runs after `vite build`. Will render the header (one file per active tab) and the 61 endpoint articles
// with react-dom/server into dist/prerender/ and write dist/prerender/manifest.json, which
// {% devportal_prerendered %} reads. Until then Django uses its plain semantic fallback.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');

if (!existsSync(resolve(DIST, '.vite', 'manifest.json'))) {
  console.error('prerender: dist/.vite/manifest.json not found; run vite build first');
  process.exit(1);
}
console.log('prerender: stub, nothing to prerender yet');
