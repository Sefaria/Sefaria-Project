// build-spec.ts (PLAN §2.7, §2.8). W3.
//
// Runs before `vite build`. Writes public/spec/index.json (contract C3, operation-index.schema.json) and one
// public/spec/<operationId>.json per operation (operation-spec.schema.json), dereferenced. Vite copies public/
// into dist/, so Django serves them at /static/bundles/devportal/spec/. public/spec/ is generated and
// git-ignored. The transformation itself lives in src/reference/spec/buildSpec.ts, which Vitest tests.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSpec } from '../src/reference/spec/buildSpec.ts';

const PACKAGE = resolve(import.meta.dirname, '..');
// In the repo and in the Docker stage alike, the spec sits at ../docs/openAPI.json (PLAN §2.8).
const SPEC = resolve(PACKAGE, '..', 'docs', 'openAPI.json');
const OUT = resolve(PACKAGE, 'public', 'spec');

if (!existsSync(SPEC)) {
  console.error(`build-spec: ${SPEC} not found`);
  process.exit(1);
}
const bytes = readFileSync(SPEC);
const specSha = createHash('sha256').update(bytes).digest('hex');
const { index, operations } = buildSpec(bytes.toString('utf8'), specSha);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const op of operations) {
  writeFileSync(resolve(OUT, `${op.operationId}.json`), `${JSON.stringify(op)}\n`);
}
writeFileSync(resolve(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`build-spec: wrote public/spec/ (spec ${specSha.slice(0, 12)}, ${operations.length} operations)`);
