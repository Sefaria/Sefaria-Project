// build-spec.ts (PLAN §2.7, §2.8). Phase 0 stub; W3 owns it from Phase 2.
//
// Runs before `vite build`. Writes public/spec/index.json (contract C3, operation-index.schema.json) and,
// once implemented, one public/spec/<operationId>.json per operation (operation-spec.schema.json). Vite
// copies public/ into dist/, so Django serves them at /static/bundles/devportal/spec/. public/spec/ is
// generated and git-ignored.
//
// The stub writes a valid index with no operations, so the build pipeline and the file location are real.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PACKAGE = resolve(import.meta.dirname, '..');
// In the repo and in the Docker stage alike, the spec sits at ../docs/openAPI.json (PLAN §2.8).
const SPEC = resolve(PACKAGE, '..', 'docs', 'openAPI.json');
const OUT = resolve(PACKAGE, 'public', 'spec');

if (!existsSync(SPEC)) {
  console.error(`build-spec: ${SPEC} not found`);
  process.exit(1);
}
const specSha = createHash('sha256').update(readFileSync(SPEC)).digest('hex');
mkdirSync(OUT, { recursive: true });
writeFileSync(
  resolve(OUT, 'index.json'),
  `${JSON.stringify({ contractVersion: 1, specSha, operations: [] }, null, 2)}\n`
);
console.log(`build-spec: stub wrote public/spec/index.json (spec ${specSha.slice(0, 12)}, 0 operations)`);
