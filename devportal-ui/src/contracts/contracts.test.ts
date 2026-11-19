// @vitest-environment node
// Contract C3: every fixture satisfies its JSON Schema (ajv) and its TypeScript type (the TypeScript
// compiler, run on each fixture as an object literal). The Python side runs the same fixtures through
// devportal/tests/pure/contracts_test.py.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import ts from 'typescript';
import { CONTRACT_NAMES } from './index';

const HERE = import.meta.dirname;
const CONTRACTS = resolve(HERE, '../../../devportal/contracts');
const SCHEMAS = join(CONTRACTS, 'schemas');
const VALID = join(CONTRACTS, 'fixtures/shapes');
const INVALID = join(CONTRACTS, 'fixtures/shapes-invalid');
const DEFINITIONS_ONLY = new Set(['common', 'editor-common']);
const ID_PREFIX = 'https://developers.sefaria.org/_contracts/';

/** Invalid fixtures whose fault the type system can see; the TypeScript check must reject these too. */
const TYPE_LEVEL_INVALID = [
  'page-payload/unknown-kind',
  'page-payload/doc-without-title',
  'sidebar-tree/endpoint-without-method',
  'operation-spec/numeric-status',
  'operation-spec/uppercase-method',
  'feedback-request/extra-field',
  'error-response/missing-message',
  'editor-page-create-request/endpoint-kind',
  'editor-draft-save-request/missing-base-revision',
  'editor-draft-save-request/client-html',
  'editor-upload-request/svg',
];

interface Fixture {
  schema: string;
  name: string;
  path: string;
}

function listFixtures(base: string): Fixture[] {
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((dir) =>
      readdirSync(join(base, dir.name))
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => ({ schema: dir.name, name: file.slice(0, -'.json'.length), path: join(base, dir.name, file) }))
    );
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const schemaNames = readdirSync(SCHEMAS)
  .filter((file) => file.endsWith('.schema.json'))
  .map((file) => file.slice(0, -'.schema.json'.length))
  .sort();
const shapeNames = schemaNames.filter((name) => !DEFINITIONS_ONLY.has(name));
const validFixtures = listFixtures(VALID);
const invalidFixtures = listFixtures(INVALID);

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats.default(ajv);
for (const name of schemaNames) {
  ajv.addSchema(readJson(join(SCHEMAS, `${name}.schema.json`)) as object);
}

function validator(schema: string) {
  const validate = ajv.getSchema(`${ID_PREFIX}${schema}.schema.json`);
  if (validate === undefined) throw new Error(`no schema ${schema}`);
  return validate;
}

/**
 * Type-checks each fixture as `const value: ContractTypes['<schema>'] = <fixture JSON>;` with the package's
 * compiler options. An object literal gets excess-property checks and literal types, so this is as strict
 * as hand-written code. Returns the diagnostics per fixture key (`<schema>/<name>`).
 */
function typeCheck(fixtures: Fixture[]): Map<string, string[]> {
  const configPath = resolve(HERE, '../../tsconfig.app.json');
  const config = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(HERE, '../..'));
  const options: ts.CompilerOptions = { ...parsed.options, types: [], noEmit: true, noUnusedLocals: false };
  const indexPath = join(HERE, 'index.ts');
  const virtual = new Map<string, string>();
  const keyByFile = new Map<string, string>();
  fixtures.forEach((fixture, i) => {
    const file = join(HERE, `__fixture_check_${i}.ts`);
    const source = readFileSync(fixture.path, 'utf8');
    virtual.set(
      file,
      `import type { ContractTypes } from ${JSON.stringify(indexPath)};\n` +
        `export const value: ContractTypes[${JSON.stringify(fixture.schema)}] = ${source};\n`
    );
    keyByFile.set(file, `${fixture.schema}/${fixture.name}`);
  });
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.fileExists = (file) => virtual.has(file) || fileExists.call(host, file);
  host.readFile = (file) => virtual.get(file) ?? readFile.call(host, file);
  host.getSourceFile = (file, language, onError, shouldCreate) => {
    const text = virtual.get(file);
    return text !== undefined
      ? ts.createSourceFile(file, text, language)
      : getSourceFile.call(host, file, language, onError, shouldCreate);
  };
  const program = ts.createProgram([...virtual.keys()], options, host);
  const result = new Map<string, string[]>();
  for (const [file, key] of keyByFile) {
    const sourceFile = program.getSourceFile(file)!;
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ].map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    result.set(key, diagnostics);
  }
  return result;
}

describe('C3 contract files', () => {
  it('has a TypeScript type for every schema and a schema for every TypeScript type', () => {
    expect([...CONTRACT_NAMES].sort()).toEqual(shapeNames);
  });

  it('has valid fixtures for every schema, and fixture folders only for schemas', () => {
    expect([...new Set(validFixtures.map((f) => f.schema))].sort()).toEqual(shapeNames);
    for (const fixture of invalidFixtures) expect(shapeNames).toContain(fixture.schema);
  });

  it('lists only existing invalid fixtures as type-level', () => {
    const keys = invalidFixtures.map((f) => `${f.schema}/${f.name}`);
    for (const key of TYPE_LEVEL_INVALID) expect(keys).toContain(key);
  });
});

describe('C3 fixtures against the JSON Schemas (ajv)', () => {
  it.each(validFixtures.map((f) => [`${f.schema}/${f.name}`, f] as const))('%s validates', (_key, fixture) => {
    const validate = validator(fixture.schema);
    const ok = validate(readJson(fixture.path));
    expect(ok ? [] : validate.errors).toEqual([]);
  });

  it.each(invalidFixtures.map((f) => [`${f.schema}/${f.name}`, f] as const))('%s is rejected', (_key, fixture) => {
    expect(validator(fixture.schema)(readJson(fixture.path))).toBe(false);
  });
});

describe('C3 fixtures against the TypeScript types', () => {
  it('every valid fixture type-checks', { timeout: 60_000 }, () => {
    const diagnostics = typeCheck(validFixtures);
    const failures = [...diagnostics].filter(([, messages]) => messages.length > 0);
    expect(failures).toEqual([]);
  });

  it('the type-level invalid fixtures do not type-check', { timeout: 60_000 }, () => {
    const fixtures = invalidFixtures.filter((f) => TYPE_LEVEL_INVALID.includes(`${f.schema}/${f.name}`));
    const diagnostics = typeCheck(fixtures);
    const accepted = [...diagnostics].filter(([, messages]) => messages.length === 0).map(([key]) => key);
    expect(accepted).toEqual([]);
  });
});
