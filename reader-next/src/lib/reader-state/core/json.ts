/**
 * JSON helpers for snapshot values. Snapshots travel between tabs, devices and files, so every value in them is plain JSON; these helpers
 * keep it that way and refuse the keys that would let an incoming value reach an object's prototype.
 */

/** Keys never written while copying or folding, and rejected anywhere in incoming data. */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

export function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(key);
}

/** Deeper than this is not a reader state, it is an attack (or a bug); refusing it keeps the recursive checks bounded. */
const MAX_DEPTH = 64;

function isPlainObject(x: object): boolean {
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

/**
 * Is `x` plain JSON (null, booleans, finite numbers, strings, arrays, plain objects) with no forbidden key at any depth? `undefined` is
 * accepted where JSON would drop it (an object property or the value itself), so a host's `nav: undefined` passes.
 */
export function isJsonSafe(x: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (x === null || x === undefined) return true;
  switch (typeof x) {
    case "boolean":
    case "string":
      return true;
    case "number":
      return Number.isFinite(x);
    case "object": {
      if (Array.isArray(x)) return x.every((item) => item !== undefined && isJsonSafe(item, depth + 1));
      if (!isPlainObject(x)) return false;
      for (const key of Object.keys(x)) {
        if (isForbiddenKey(key)) return false;
        if (!isJsonSafe((x as Record<string, unknown>)[key], depth + 1)) return false;
      }
      return true;
    }
    default:
      return false;
  }
}

/**
 * A detached JSON copy: a slice's `get()` may hand out a live object it later mutates, and a snapshot must not change after it was taken.
 * Forbidden keys are dropped. Throws on what JSON cannot hold (cycles, BigInt).
 */
export function cloneJson<T>(x: T): T {
  if (x === undefined) return x;
  const text = JSON.stringify(x);
  if (text === undefined) return undefined as T; // a function or symbol: JSON has nothing for it
  return JSON.parse(text, (key, value) => (isForbiddenKey(key) ? undefined : value)) as T;
}

/** Structural equality of JSON values (key order ignored; undefined properties count as absent). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((item, i) => jsonEqual(item, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && jsonEqual(ao[k], bo[k]));
}
