/**
 * Runtime schemas for everything that arrives from outside (a room, a postMessage peer, a recording file): it is parsed, never cast. Types
 * are erased at runtime, so without these a peer could hand the reader any shape at all.
 *
 * Two layers: a whole-input walk refuses anything that is not plain JSON or carries a `__proto__` / `constructor` / `prototype` key at any
 * depth (slice ids included), then zod checks the shape. Slice values stay `unknown` here; each slice validates its own.
 */
import { z } from "zod";
import type { Recording, ReaderSnapshot, SnapshotChange, StreamMessage } from "./types";
import { isJsonSafe } from "./json";

const json = z.unknown().refine((x) => isJsonSafe(x), { message: "not plain JSON" });
const count = z.number().int().nonnegative();
const ms = z.number().finite().nonnegative();

export const sliceValueSchema = z.object({ v: count, value: json });

export const snapshotSchema = z.object({
  v: z.literal(1),
  url: z.string(),
  nav: json.optional(),
  slices: z.record(z.string(), sliceValueSchema),
});

export const snapshotChangeSchema = z.object({
  url: z.string().optional(),
  nav: json.optional(),
  slices: z.record(z.string(), sliceValueSchema.nullable()).optional(),
});

export const streamMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("keyframe"), seq: count, t: ms, snapshot: snapshotSchema }),
  z.object({ type: z.literal("change"), seq: count, t: ms, change: snapshotChangeSchema }),
]);

export const recordingSchema = z.object({
  v: z.literal(1),
  startedAt: z.string(),
  duration: ms,
  client: z.string().optional(),
  messages: z.array(streamMessageSchema),
});

function parseWith<T>(schema: z.ZodType, x: unknown): T | null {
  if (!isJsonSafe(x)) return null;
  const result = schema.safeParse(x);
  return result.success ? (result.data as T) : null;
}

/** zod drops an absent optional key but keeps `nav: undefined` as a present key; a change must not claim nav changed when it did not. */
function dropUndefinedNav<T extends { nav?: unknown }>(x: T): T {
  if ("nav" in x && x.nav === undefined) {
    const { nav: _nav, ...rest } = x;
    return rest as T;
  }
  return x;
}

function normalizeMessage(m: StreamMessage): StreamMessage {
  return m.type === "change" ? { ...m, change: dropUndefinedNav(m.change) } : m;
}

export function parseSnapshot(x: unknown): ReaderSnapshot | null {
  return parseWith<ReaderSnapshot>(snapshotSchema, x);
}

export function parseSnapshotChange(x: unknown): SnapshotChange | null {
  const c = parseWith<SnapshotChange>(snapshotChangeSchema, x);
  return c ? dropUndefinedNav(c) : null;
}

export function parseStreamMessage(x: unknown): StreamMessage | null {
  const m = parseWith<StreamMessage>(streamMessageSchema, x);
  return m ? normalizeMessage(m) : null;
}

export function parseRecording(x: unknown): Recording | null {
  const r = parseWith<Recording>(recordingSchema, x);
  if (!r) return null;
  return { ...r, messages: r.messages.map(normalizeMessage) };
}
