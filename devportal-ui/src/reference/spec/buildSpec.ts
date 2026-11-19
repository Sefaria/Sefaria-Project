// Contract C3: turns docs/openAPI.json into one dereferenced spec file per operation plus an index (PLAN §2.7).
// Pure (no imports with side effects, only type imports) so that scripts/build-spec.ts can run it under plain
// Node type stripping and Vitest can test it.
import type {
  ExampleObject,
  HttpMethod,
  MediaTypeObject,
  OperationIndex,
  OperationParameter,
  OperationRequestBody,
  OperationResponse,
  OperationSpec,
  SchemaObject,
} from '../../contracts';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];
const PARAM_LOCATIONS = ['path', 'query', 'header', 'cookie'] as const;

/** Key order of objects whose keys JavaScript would reorder (integer-like keys such as "202", "200"). */
const KEY_ORDER = new WeakMap<object, string[]>();

/** Entries in the document's order, even for integer-like keys (C3: responses "in the spec's order"). */
function orderedEntries(obj: JsonObject): [string, Json][] {
  const order = KEY_ORDER.get(obj);
  return order === undefined ? Object.entries(obj) : order.map((key) => [key, obj[key] as Json]);
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);
const SCALAR_END = new Set([',', '}', ']', ' ', '\t', '\n', '\r']);

/**
 * JSON.parse that also records the source order of object keys, which `JSON.parse` loses for integer-like
 * keys. Scalars are decoded by JSON.parse itself on their source text, so values are identical.
 */
export function parseJsonPreservingOrder(text: string): Json {
  let i = 0;
  const ws = () => {
    while (i < text.length && WHITESPACE.has(text.charAt(i))) i += 1;
  };
  const stringEnd = (start: number) => {
    let j = start + 1;
    while (text.charAt(j) !== '"') j += text.charAt(j) === '\\' ? 2 : 1;
    return j + 1;
  };
  const value = (): Json => {
    ws();
    const c = text.charAt(i);
    if (c === '{') {
      i += 1;
      const obj: JsonObject = {};
      const order: string[] = [];
      ws();
      if (text.charAt(i) === '}') {
        i += 1;
        return obj;
      }
      for (;;) {
        ws();
        const end = stringEnd(i);
        const key = JSON.parse(text.slice(i, end)) as string;
        i = end;
        ws();
        i += 1; // the colon
        obj[key] = value();
        order.push(key);
        ws();
        const close = text.charAt(i);
        i += 1;
        if (close === '}') break;
      }
      if (order.some((key) => /^\d+$/.test(key))) KEY_ORDER.set(obj, order);
      return obj;
    }
    if (c === '[') {
      i += 1;
      const arr: Json[] = [];
      ws();
      if (text.charAt(i) === ']') {
        i += 1;
        return arr;
      }
      for (;;) {
        arr.push(value());
        ws();
        const close = text.charAt(i);
        i += 1;
        if (close === ']') break;
      }
      return arr;
    }
    const start = i;
    if (c === '"') i = stringEnd(i);
    else while (i < text.length && !SCALAR_END.has(text.charAt(i))) i += 1;
    return JSON.parse(text.slice(start, i)) as Json;
  };
  const result = value();
  ws();
  if (i !== text.length) throw new Error('build-spec: trailing characters after JSON');
  return result;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Resolves a local JSON pointer (`#/components/schemas/X`). */
function resolvePointer(root: JsonObject, ref: string): Json {
  if (!ref.startsWith('#/')) throw new Error(`build-spec: only local $refs are supported, got ${ref}`);
  let node: Json = root;
  for (const raw of ref.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObject(node) || !(key in node)) throw new Error(`build-spec: unresolvable $ref ${ref}`);
    node = node[key] as Json;
  }
  return node;
}

/**
 * Inlines every `$ref`. A reference to a component already being expanded on the current path is replaced by
 * `{ "x-dp-circular": "<component name>" }` (C3). Siblings of `$ref` are ignored, as OpenAPI 3.0 specifies.
 */
export function dereference(root: JsonObject, node: Json, stack: readonly string[] = []): Json {
  if (Array.isArray(node)) return node.map((item) => dereference(root, item, stack));
  if (!isObject(node)) return node;
  const ref = str(node.$ref);
  if (ref !== undefined) {
    const name = ref.split('/').pop() ?? ref;
    if (stack.includes(ref)) return { 'x-dp-circular': name };
    return dereference(root, resolvePointer(root, ref), [...stack, ref]);
  }
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node)) out[key] = dereference(root, value, stack);
  return out;
}

function examplesOf(root: JsonObject, value: Json | undefined): Record<string, ExampleObject> | undefined {
  if (!isObject(value)) return undefined;
  const out: Record<string, ExampleObject> = {};
  for (const [name, raw] of Object.entries(value)) {
    const example = dereference(root, raw);
    if (!isObject(example)) continue;
    const entry: ExampleObject = { value: example.value ?? null };
    const summary = str(example.summary);
    const description = str(example.description);
    if (summary !== undefined) entry.summary = summary;
    if (description !== undefined) entry.description = description;
    out[name] = entry;
  }
  return out;
}

function mediaTypes(root: JsonObject, content: Json | undefined): Record<string, MediaTypeObject> {
  const out: Record<string, MediaTypeObject> = {};
  if (!isObject(content)) return out;
  for (const [type, raw] of Object.entries(content)) {
    const media = dereference(root, raw);
    if (!isObject(media)) continue;
    const schema = isObject(media.schema) ? (dereference(root, media.schema) as SchemaObject) : {};
    const entry: MediaTypeObject = { schema };
    if ('example' in media) entry.example = media.example;
    const examples = examplesOf(root, media.examples);
    if (examples !== undefined) entry.examples = examples;
    out[type] = entry;
  }
  return out;
}

function parameterOf(root: JsonObject, raw: Json): OperationParameter {
  const p = dereference(root, raw);
  if (!isObject(p)) throw new Error('build-spec: parameter is not an object');
  const location = str(p.in);
  const name = str(p.name);
  if (name === undefined || !PARAM_LOCATIONS.includes(location as (typeof PARAM_LOCATIONS)[number])) {
    throw new Error(`build-spec: invalid parameter ${JSON.stringify(p).slice(0, 120)}`);
  }
  const param: OperationParameter = {
    name,
    in: location as OperationParameter['in'],
    required: typeof p.required === 'boolean' ? p.required : location === 'path',
    description: str(p.description) ?? '',
    deprecated: p.deprecated === true,
    schema: isObject(p.schema) ? (p.schema as SchemaObject) : {},
  };
  if ('example' in p) param.example = p.example;
  const examples = examplesOf(root, p.examples);
  if (examples !== undefined) param.examples = examples;
  return param;
}

/**
 * Parameters merged from the path item and the operation: the path item's come first in their order; an
 * operation parameter with the same `name` and `in` replaces it in place, the others are appended (PLAN §2.7).
 */
export function mergeParameters(root: JsonObject, pathLevel: Json | undefined, opLevel: Json | undefined) {
  const merged: OperationParameter[] = [];
  for (const raw of Array.isArray(pathLevel) ? pathLevel : []) merged.push(parameterOf(root, raw));
  for (const raw of Array.isArray(opLevel) ? opLevel : []) {
    const param = parameterOf(root, raw);
    const index = merged.findIndex((p) => p.name === param.name && p.in === param.in);
    if (index >= 0) merged[index] = param;
    else merged.push(param);
  }
  return merged;
}

function requestBodyOf(root: JsonObject, raw: Json | undefined): OperationRequestBody | null {
  if (raw === undefined) return null;
  const body = dereference(root, raw);
  if (!isObject(body)) return null;
  return {
    required: body.required === true,
    description: str(body.description) ?? '',
    content: mediaTypes(root, body.content),
  };
}

function responsesOf(root: JsonObject, raw: Json | undefined): OperationResponse[] {
  if (!isObject(raw)) return [];
  return orderedEntries(raw).map(([status, value]) => {
    const response = dereference(root, value);
    const obj = isObject(response) ? response : {};
    return { status, description: str(obj.description) ?? '', content: mediaTypes(root, obj.content) };
  });
}

export interface BuiltSpec {
  index: OperationIndex;
  operations: OperationSpec[];
}

/**
 * Builds the C3 files for every operation, in document order. Pass the document's text (so that response
 * order survives integer-like keys) or an already parsed object.
 */
export function buildSpec(source: unknown, specSha: string): BuiltSpec {
  const spec = typeof source === 'string' ? parseJsonPreservingOrder(source) : source;
  if (!isObject(spec) || !isObject(spec.paths)) throw new Error('build-spec: not an OpenAPI document');
  const root = spec;
  const servers = Array.isArray(spec.servers) ? spec.servers : [];
  const server = isObject(servers[0]) ? (str(servers[0].url) ?? '') : '';
  const operations: OperationSpec[] = [];
  const seen = new Set<string>();
  for (const [path, rawItem] of Object.entries(spec.paths)) {
    const item = isObject(rawItem) ? rawItem : {};
    for (const method of METHODS) {
      const op = item[method];
      if (!isObject(op)) continue;
      const operationId = str(op.operationId);
      if (operationId === undefined) throw new Error(`build-spec: ${method} ${path} has no operationId`);
      if (seen.has(operationId)) throw new Error(`build-spec: duplicate operationId ${operationId}`);
      seen.add(operationId);
      const title = str(op.summary) ?? str(item.summary);
      if (title === undefined || title === '') throw new Error(`build-spec: ${operationId} has no title`);
      operations.push({
        contractVersion: 1,
        specSha,
        operationId,
        method,
        path,
        server,
        tags: Array.isArray(op.tags) ? op.tags.filter((t): t is string => typeof t === 'string') : [],
        title,
        description: str(op.description) ?? '',
        deprecated: op.deprecated === true,
        parameters: mergeParameters(root, item.parameters, op.parameters),
        requestBody: requestBodyOf(root, op.requestBody),
        responses: responsesOf(root, op.responses),
      });
    }
  }
  const index: OperationIndex = {
    contractVersion: 1,
    specSha,
    operations: operations.map((op) => ({
      operationId: op.operationId,
      method: op.method,
      path: op.path,
      tags: op.tags,
      title: op.title,
      deprecated: op.deprecated,
      file: `${op.operationId}.json`,
    })),
  };
  return { index, operations };
}
