/**
 * Run-time checks for what a server function receives. A server function is a public endpoint (`/_serverFn/<id>?payload=…`): its
 * input is whatever a caller sends, whatever the TypeScript type says, so every one checks it here before using it. The values
 * these checks pass are safe to put, URL-encoded, into a path on the internal API origin: no `.`/`..` segment (which a URL parser
 * resolves, turning `/api/activity/../../x` into `/x`), no slash or backslash inside a segment, no control character, bounded length.
 */
import { setResponseStatus } from "@tanstack/react-start/server";

/** A server function's input was not what it accepts (a caller's mistake, not the server's). */
export class ServerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerInputError";
  }
}

/**
 * The error to throw for refused input: the server function's answer becomes a 400, not a 500 (Start answers a thrown error with the
 * status set on the response, 500 when none is). Validators run on the server only; outside a request there is no response to set.
 */
export function refuse(message: string): ServerInputError {
  try {
    setResponseStatus(400);
  } catch {
    // no request (a unit test, a direct call)
  }
  return new ServerInputError(message);
}

// a UTF-16 half without its other half: encodeURIComponent throws on one (a 500 where a 400 belongs)
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// C0 controls, DEL and C1 controls (the URL parser drops tab and newline silently)
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/; // eslint-disable-line no-control-regex

/** A string of at most `max` characters (and at least `min`), well-formed (no lone surrogate), with no control character. */
export function isSafeText(v: unknown, max: number, min = 0): v is string {
  return typeof v === "string" && v.length >= min && v.length <= max && !CONTROL.test(v) && !LONE_SURROGATE.test(v);
}

/** One path segment: non-empty, at most `max` characters, no control character, no slash or backslash, and not `.` or `..`. */
export function isSafeSegment(v: unknown, max = 200): v is string {
  return isSafeText(v, max, 1) && !/[/\\]/.test(v) && v !== "." && v !== "..";
}

/** Slash-separated segments, each one a safe segment (so no empty segment either), at most `max` characters in all. */
export function isSafePath(v: unknown, max = 1000): v is string {
  return isSafeText(v, max, 1) && v.split("/").every((s) => isSafeSegment(s, max));
}

/** A plain object (the shape every multi-field input has). */
export function record(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw refuse(`${what}: expected an object`);
  return v as Record<string, unknown>;
}

export function text(v: unknown, what: string, max: number, min = 0): string {
  if (!isSafeText(v, max, min)) throw refuse(`${what}: expected text of ${min} to ${max} characters`);
  return v;
}

export function segment(v: unknown, what: string, max = 200): string {
  if (!isSafeSegment(v, max)) throw refuse(`${what}: expected one path segment`);
  return v;
}

export function path(v: unknown, what: string, max = 1000): string {
  if (!isSafePath(v, max)) throw refuse(`${what}: expected a path without empty, "." or ".." segments`);
  return v;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], what: string): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) throw refuse(`${what}: expected one of ${allowed.join(", ")}`);
  return v as T;
}

export function intIn(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw refuse(`${what}: expected a whole number from ${min} to ${max}`);
  return v;
}
