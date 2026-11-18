// Reading the dereferenced Schema Objects of the C3 spec files the way live's reference shows them:
// type labels ("array of objects"), allOf merged, unions (oneOf/anyOf) as variants.
import type { SchemaObject } from '../../contracts';

export type Schema = SchemaObject;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asSchema(value: unknown): Schema {
  return isRecord(value) ? value : {};
}

/** Merges `allOf` members into one schema: properties united (later members win), `required` united. */
export function mergeAllOf(schema: Schema): Schema {
  const parts = Array.isArray(schema.allOf) ? schema.allOf.map(asSchema).map(mergeAllOf) : [];
  if (parts.length === 0) return schema;
  const rest = { ...schema };
  delete rest.allOf;
  const merged: Schema = {};
  const properties: Record<string, Schema> = {};
  const required = new Set<string>();
  for (const part of [...parts, rest]) {
    for (const [key, value] of Object.entries(part)) {
      if (key === 'properties' && isRecord(value)) {
        for (const [name, prop] of Object.entries(value)) properties[name] = asSchema(prop);
      } else if (key === 'required' && Array.isArray(value)) {
        for (const name of value) if (typeof name === 'string') required.add(name);
      } else if (key === 'description' || key === 'title') {
        if (typeof value === 'string' && value !== '') merged[key] = value;
      } else {
        merged[key] = value;
      }
    }
  }
  if (Object.keys(properties).length > 0) merged.properties = properties;
  if (required.size > 0) merged.required = [...required];
  return merged;
}

/** The alternatives of a union (`oneOf`, `anyOf`, or a `type` array), or null when the schema is not one. */
export function unionVariants(schema: Schema): Schema[] | null {
  const s = mergeAllOf(schema);
  for (const key of ['oneOf', 'anyOf'] as const) {
    const list = s[key];
    if (Array.isArray(list) && list.length > 0) {
      const base = Object.fromEntries(Object.entries(s).filter(([k]) => k !== key));
      return list.map((v) => ({ ...base, ...mergeAllOf(asSchema(v)) }));
    }
  }
  if (Array.isArray(s.type) && s.type.length > 1) return s.type.map((t) => ({ ...s, type: t }));
  return null;
}

/** The schema's own type, inferred from `properties` / `items` when `type` is absent. */
export function schemaType(schema: Schema): string | null {
  const s = mergeAllOf(schema);
  if (typeof s.type === 'string') return s.type;
  if (Array.isArray(s.type) && typeof s.type[0] === 'string') return s.type[0];
  if (isRecord(s.properties)) return 'object';
  if (isRecord(s.items)) return 'array';
  return null;
}

const PLURAL: Record<string, string> = {
  object: 'objects',
  string: 'strings',
  number: 'numbers',
  integer: 'integers',
  boolean: 'booleans',
  array: 'arrays',
};

/** Live's type label: "string", "date", "number", "object", "array of objects", "array of strings"… */
export function typeLabel(schema: Schema): string {
  const s = mergeAllOf(schema);
  const type = schemaType(s);
  if (type === 'array') {
    const items = asSchema(s.items);
    if (unionVariants(items) !== null) return 'array';
    const itemType = schemaType(items);
    return itemType !== null && PLURAL[itemType] !== undefined ? `array of ${PLURAL[itemType]}` : 'array';
  }
  if (type === 'string' && typeof s.format === 'string' && s.format !== '') return s.format;
  if (type === null) return 'string';
  return type;
}

/** Short label of a union variant as live's union select shows it ("string", "number", "array"). */
export function variantLabel(schema: Schema): string {
  const type = schemaType(schema);
  if (type === 'array') return typeLabel(schema);
  return type ?? 'string';
}

export interface PropertyEntry {
  name: string;
  schema: Schema;
  required: boolean;
}

/** The properties of an object schema (allOf merged), in document order. */
export function objectProperties(schema: Schema): PropertyEntry[] {
  const s = mergeAllOf(schema);
  const required = new Set(Array.isArray(s.required) ? s.required.filter((r) => typeof r === 'string') : []);
  if (!isRecord(s.properties)) return [];
  return Object.entries(s.properties).map(([name, prop]) => ({
    name,
    schema: mergeAllOf(asSchema(prop)),
    required: required.has(name),
  }));
}

export function enumValues(schema: Schema): string[] | null {
  const s = mergeAllOf(schema);
  return Array.isArray(s.enum) ? s.enum.map((v) => String(v)) : null;
}

export function description(schema: Schema): string {
  const value = mergeAllOf(schema).description;
  return typeof value === 'string' ? value : '';
}

/** Whether a value renders as live's "Defaults to X": scalars only. */
export function defaultText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
