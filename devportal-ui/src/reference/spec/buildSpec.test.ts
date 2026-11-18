// @vitest-environment node
// build-spec (PLAN §2.7): the C3 files for all 61 operations, the title and description rules, the merged
// parameters, and agreement with the golden operations.json that the Python spec layer also asserts.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { buildSpec, dereference, parseJsonPreservingOrder } from './buildSpec';
import type { OperationSpec } from '../../contracts';

const ROOT = resolve(import.meta.dirname, '../../../..');
const SPEC_PATH = join(ROOT, 'docs/openAPI.json');
const CONTRACTS = join(ROOT, 'devportal/contracts');
const GOLDEN = join(CONTRACTS, 'golden/operations.json');

const bytes = readFileSync(SPEC_PATH);
const raw = JSON.parse(bytes.toString('utf8'));
const sha = createHash('sha256').update(bytes).digest('hex');
const built = buildSpec(bytes.toString('utf8'), sha);
const byId = new Map(built.operations.map((op) => [op.operationId, op]));

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats.default(ajv);
for (const file of readdirSync(join(CONTRACTS, 'schemas'))) {
  ajv.addSchema(JSON.parse(readFileSync(join(CONTRACTS, 'schemas', file), 'utf8')));
}
const PREFIX = 'https://developers.sefaria.org/_contracts/';

describe('buildSpec', () => {
  it('writes all 61 operations, each valid against operation-spec.schema.json', () => {
    expect(built.operations).toHaveLength(61);
    const validate = ajv.getSchema(`${PREFIX}operation-spec.schema.json`)!;
    for (const op of built.operations) {
      expect(validate(op), `${op.operationId}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(JSON.stringify(op)).not.toContain('"$ref"');
    }
  });

  it('writes an index valid against operation-index.schema.json', () => {
    const validate = ajv.getSchema(`${PREFIX}operation-index.schema.json`)!;
    expect(validate(built.index), JSON.stringify(validate.errors)).toBe(true);
    expect(built.index.operations.map((o) => o.file)).toEqual(built.operations.map((o) => `${o.operationId}.json`));
    expect(built.index.specSha).toBe(sha);
  });

  it('takes the title from operation.summary, else the path item summary (33 + 28)', () => {
    let fromOperation = 0;
    let fromPath = 0;
    for (const [, item] of Object.entries<Record<string, Record<string, unknown>>>(raw.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const op = item[method];
        if (op === undefined) continue;
        const spec = byId.get(op.operationId as string)!;
        if (typeof op.summary === 'string') {
          fromOperation += 1;
          expect(spec.title).toBe(op.summary);
        } else {
          fromPath += 1;
          expect(spec.title).toBe(item.summary);
        }
        expect(spec.description).toBe(typeof op.description === 'string' ? op.description : '');
      }
    }
    expect([fromOperation, fromPath]).toEqual([33, 28]);
    expect(byId.get('get-v3-texts')!.title).toBe('Texts (v3)');
    expect(byId.get('post-find-refs')!.title).toBe('Find Refs');
  });

  it('merges path-level and operation-level parameters', () => {
    let pathLevel = 0;
    for (const item of Object.values<Record<string, unknown>>(raw.paths)) {
      const params = (item.parameters ?? []) as { name: string; in: string }[];
      pathLevel += params.length;
      for (const method of ['get', 'post']) {
        const op = item[method] as { operationId: string } | undefined;
        if (op === undefined) continue;
        const merged = byId.get(op.operationId)!.parameters;
        for (const p of params) expect(merged.some((m) => m.name === p.name && m.in === p.in)).toBe(true);
      }
    }
    expect(pathLevel).toBe(40);
    expect(byId.get('get-v3-texts')!.parameters.map((p) => `${p.in}:${p.name}`)).toEqual([
      'query:version',
      'path:tref',
      'query:fill_in_missing_segments',
      'query:return_format',
    ]);
  });

  it('marks exactly the two deprecated operations', () => {
    expect(built.operations.filter((op) => op.deprecated).map((op) => op.operationId)).toEqual([
      'get-v1-texts',
      'get-topic-slug',
    ]);
  });

  it('agrees with the hand-written C3 fixtures on identity and parameters', () => {
    const dir = join(CONTRACTS, 'fixtures/shapes/operation-spec');
    for (const file of readdirSync(dir)) {
      const fixture = JSON.parse(readFileSync(join(dir, file), 'utf8')) as OperationSpec;
      const op = byId.get(fixture.operationId)!;
      expect(op.specSha).toBe(fixture.specSha);
      expect([op.method, op.path, op.server, op.title, op.description, op.deprecated]).toEqual([
        fixture.method,
        fixture.path,
        fixture.server,
        fixture.title,
        fixture.description,
        fixture.deprecated,
      ]);
      expect(op.tags).toEqual(fixture.tags);
      expect(op.parameters.map((p) => [p.name, p.in, p.required, p.schema])).toEqual(
        fixture.parameters.map((p) => [p.name, p.in, p.required, p.schema])
      );
      expect(op.responses.map((r) => [r.status, r.description])).toEqual(
        fixture.responses.map((r) => [r.status, r.description])
      );
      // The fixtures abbreviate schemas (examples trimmed), so compare the structure, not every keyword.
      const shape = (schema: Record<string, unknown> | undefined) =>
        schema === undefined ? null : [schema.required, Object.keys((schema.properties ?? {}) as object)];
      expect(shape(op.requestBody?.content['application/json']?.schema)).toEqual(
        shape(fixture.requestBody?.content['application/json']?.schema)
      );
    }
  });

  it('keeps responses in the spec order, including integer-like status keys', () => {
    expect(byId.get('post-find-refs')!.responses.map((r) => r.status)).toEqual(['202', '200']);
    expect(byId.get('get-async-task-status')!.responses.map((r) => r.status)).toEqual(['202', '200', '500']);
  });

  it('parses JSON exactly as JSON.parse does', () => {
    const text = bytes.toString('utf8');
    expect(parseJsonPreservingOrder(text)).toEqual(JSON.parse(text));
    const sample = String.raw`{"a":[1,-2.5e3,true,null,"x\"y\\"],"b":{}, "c" : [ ] }`;
    expect(parseJsonPreservingOrder(sample)).toEqual(JSON.parse(sample));
  });

  it('replaces a recursive $ref with x-dp-circular', () => {
    const root = {
      components: {
        schemas: { Node: { type: 'object', properties: { child: { $ref: '#/components/schemas/Node' } } } },
      },
    };
    expect(dereference(root, { $ref: '#/components/schemas/Node' })).toEqual({
      type: 'object',
      properties: { child: { 'x-dp-circular': 'Node' } },
    });
  });

  const goldenExists = existsSync(GOLDEN);
  it.skipIf(!goldenExists)('equals the golden operations.json (titles, descriptions, method, path)', () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as unknown;
    const entries = (Array.isArray(golden) ? golden : (golden as { operations: unknown[] }).operations) as Record<
      string,
      unknown
    >[];
    expect(entries).toHaveLength(61);
    for (const entry of entries) {
      const op = byId.get(entry.operationId as string);
      expect(op, String(entry.operationId)).toBeDefined();
      expect(op!.title).toBe(entry.title);
      expect(op!.description).toBe(entry.description);
      if ('method' in entry) expect(op!.method).toBe(String(entry.method).toLowerCase());
      if ('path' in entry) expect(op!.path).toBe(entry.path);
      if ('deprecated' in entry) expect(op!.deprecated).toBe(entry.deprecated);
      if ('tag' in entry) expect(op!.tags[0]).toBe(entry.tag);
    }
  });
  if (!goldenExists) {
    it('notes that the golden operations.json is absent', () => {
      console.warn(`buildSpec.test: ${GOLDEN} is absent on this branch (W4 writes it); the golden check is skipped.`);
    });
  }
});
