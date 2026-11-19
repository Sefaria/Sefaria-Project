// The request form of an endpoint page: one field per parameter (path, query, header) and per body property,
// with the values live shows: type label, "required", "Defaults to X", placeholder, example values, enum.
import type { OperationParameter, OperationSpec } from '../../contracts';
import {
  asSchema,
  defaultText,
  description as schemaDescription,
  enumValues,
  mergeAllOf,
  objectProperties,
  schemaType,
  typeLabel,
  type Schema,
} from './schema';

export type FieldLocation = 'path' | 'query' | 'header' | 'cookie' | 'body';

export interface ExampleValue {
  /** The example's name in the spec (`Tanakh Segment Level Ref`), or null for a bare `example`. */
  label: string | null;
  value: string;
}

export interface FormField {
  /** Key in the form values: `path:tref`, `query:version`, `body:text.body`. */
  key: string;
  location: FieldLocation;
  name: string;
  /** Anchor of the row, as live: `path-params-tref`, `body-params-text`; null for nested body fields. */
  anchorId: string | null;
  /** Id of the input, as live: `path-getV3Texts_tref`, `body-postFindRefs_text_body`. */
  inputId: string;
  /** Id of the name label; the input's accessible name (the URL line's chip is a second `<label for>`). */
  labelId: string;
  required: boolean;
  deprecated: boolean;
  /** Schema type ("string", "object"…) used to serialize the value. */
  type: string | null;
  typeLabel: string;
  enumValues: string[] | null;
  /** "Defaults to X" text, or null. */
  defaultValue: string | null;
  placeholder: string;
  examples: ExampleValue[];
  /** Markdown. */
  description: string;
  /** Fields of an object-typed body property, shown behind the "<NAME> OBJECT" expander. */
  children: FormField[] | null;
}

export interface EndpointForm {
  path: FormField[];
  query: FormField[];
  header: FormField[];
  cookie: FormField[];
  body: FormField[];
  /** The request body schema's description (shown above the body fields), Markdown. */
  bodyDescription: string;
  /** Content type of the request body, or null when the operation has none. */
  bodyContentType: string | null;
}

export type FormValues = Record<string, string>;

/** `get-v3-texts` → `getV3Texts`, the form id stem live uses. */
export function camelOperationId(operationId: string): string {
  return operationId.replace(/[-_ ]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
}

function scalarText(value: unknown): string | null {
  if (value === undefined || value === null || typeof value === 'object') return null;
  return String(value);
}

function examplesOf(param: Pick<OperationParameter, 'example' | 'examples'>, schema: Schema): ExampleValue[] {
  const out: ExampleValue[] = [];
  for (const [label, example] of Object.entries(param.examples ?? {})) {
    const text = scalarText(example.value);
    if (text !== null) out.push({ label, value: text });
  }
  const single = scalarText(param.example ?? schema.example);
  if (single !== null && !out.some((e) => e.value === single)) out.push({ label: null, value: single });
  return out;
}

function parameterField(op: OperationSpec, param: OperationParameter): FormField {
  const schema = mergeAllOf(param.schema);
  const examples = examplesOf(param, schema);
  return {
    key: `${param.in}:${param.name}`,
    location: param.in,
    name: param.name,
    anchorId: `${param.in}-params-${param.name}`,
    inputId: `${param.in}-${camelOperationId(op.operationId)}_${param.name}`,
    labelId: `${param.in}-${camelOperationId(op.operationId)}_${param.name}__label`,
    required: param.required,
    deprecated: param.deprecated,
    type: schemaType(schema),
    typeLabel: typeLabel(schema),
    enumValues: enumValues(schema),
    defaultValue: defaultText(schema.default),
    placeholder: examples[0]?.value ?? '',
    examples,
    description: param.description || schemaDescription(schema),
    children: null,
  };
}

function bodyFields(op: OperationSpec, schema: Schema, parentPath: string[], parentExample: unknown): FormField[] {
  return objectProperties(schema).map(({ name, schema: prop, required }) => {
    const path = [...parentPath, name];
    const exampleFromParent =
      typeof parentExample === 'object' && parentExample !== null
        ? (parentExample as Record<string, unknown>)[name]
        : undefined;
    const examples = examplesOf({ example: prop.example ?? exampleFromParent }, prop);
    const type = schemaType(prop);
    const isObject = type === 'object' && objectProperties(prop).length > 0;
    return {
      key: `body:${path.join('.')}`,
      location: 'body',
      name,
      anchorId: parentPath.length === 0 ? `body-params-${name}` : null,
      inputId: `body-${camelOperationId(op.operationId)}_${path.join('_')}`,
      labelId: `body-${camelOperationId(op.operationId)}_${path.join('_')}__label`,
      required,
      deprecated: prop.deprecated === true,
      type,
      typeLabel: typeLabel(prop),
      enumValues: enumValues(prop),
      defaultValue: defaultText(prop.default),
      placeholder: examples[0]?.value ?? '',
      examples,
      description: schemaDescription(prop),
      children: isObject ? bodyFields(op, prop, path, prop.example ?? exampleFromParent) : null,
    };
  });
}

/** Builds the form of `op`: parameters grouped by location in spec order, then the JSON body's properties. */
export function endpointForm(op: OperationSpec): EndpointForm {
  const fields = op.parameters.map((p) => parameterField(op, p));
  const byLocation = (location: FieldLocation) => fields.filter((f) => f.location === location);
  const contentTypes = Object.keys(op.requestBody?.content ?? {});
  const bodyContentType = contentTypes[0] ?? null;
  const media = bodyContentType === null ? undefined : op.requestBody?.content[bodyContentType];
  const bodySchema = mergeAllOf(asSchema(media?.schema));
  return {
    path: byLocation('path'),
    query: byLocation('query'),
    header: byLocation('header'),
    cookie: byLocation('cookie'),
    body: media === undefined ? [] : bodyFields(op, bodySchema, [], bodySchema.example ?? media.example),
    bodyDescription: media === undefined ? '' : schemaDescription(bodySchema),
    bodyContentType,
  };
}

export function allFields(form: EndpointForm): FormField[] {
  const flat: FormField[] = [];
  const walk = (list: FormField[]) => {
    for (const f of list) {
      flat.push(f);
      if (f.children !== null) walk(f.children);
    }
  };
  walk([...form.path, ...form.query, ...form.header, ...form.cookie, ...form.body]);
  return flat;
}

/**
 * Initial values as live: a required parameter is prefilled with its default; an optional one starts empty and
 * only shows its default as "Defaults to X".
 */
export function initialValues(form: EndpointForm): FormValues {
  const values: FormValues = {};
  for (const field of allFields(form)) {
    if (field.children !== null) continue;
    values[field.key] = field.required && field.defaultValue !== null ? field.defaultValue : '';
  }
  return values;
}

function typedValue(field: FormField, raw: string): unknown {
  if (field.type === 'integer' || field.type === 'number') {
    const n = Number(raw);
    return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
  }
  if (field.type === 'boolean') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  }
  return raw;
}

/**
 * The JSON body the form describes, as live builds it: filled fields with their typed values, and every
 * required object present (possibly empty), so find-refs starts as `{"text":{}}`. Undefined when empty.
 */
export function bodyValue(form: EndpointForm, values: FormValues): Record<string, unknown> | undefined {
  const build = (fields: FormField[]): Record<string, unknown> | undefined => {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.children !== null) {
        const child = build(field.children);
        if (child !== undefined) out[field.name] = child;
        else if (field.required) out[field.name] = {};
        continue;
      }
      const raw = values[field.key] ?? '';
      if (raw !== '') out[field.name] = typedValue(field, raw);
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };
  if (form.bodyContentType === null) return undefined;
  return build(form.body);
}
