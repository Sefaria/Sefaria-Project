/**
 * The two pure operations streams are made of: `diff` turns two snapshots into the change between them (what a writer sends), and `fold`
 * puts a change onto a snapshot (what a reader or a player does). `fold(a, diff(a, b))` equals `b`.
 */
import type { ReaderSnapshot, SliceId, SliceValue, SnapshotChange } from "./types";
import { isForbiddenKey, jsonEqual } from "./json";

const has = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

function sliceEqual(a: SliceValue, b: SliceValue): boolean {
  return a.v === b.v && jsonEqual(a.value, b.value);
}

export function diff(a: ReaderSnapshot, b: ReaderSnapshot): SnapshotChange {
  const change: SnapshotChange = {};
  if (a.url !== b.url) change.url = b.url;
  if (!jsonEqual(a.nav, b.nav)) change.nav = b.nav;

  const slices: Record<SliceId, SliceValue | null> = {};
  let any = false;
  for (const id of Object.keys(b.slices)) {
    if (isForbiddenKey(id)) continue;
    const next = b.slices[id]!;
    const prev = has(a.slices, id) ? a.slices[id] : undefined;
    if (!prev || !sliceEqual(prev, next)) {
      slices[id] = next;
      any = true;
    }
  }
  for (const id of Object.keys(a.slices)) {
    if (isForbiddenKey(id) || has(b.slices, id)) continue;
    slices[id] = null;
    any = true;
  }
  if (any) change.slices = slices;
  return change;
}

/** True when the change says nothing changed (what `subscribe` and the stream writer drop). */
export function isEmptyChange(c: SnapshotChange): boolean {
  return c.url === undefined && !has(c, "nav") && (c.slices === undefined || Object.keys(c.slices).length === 0);
}

/**
 * A new snapshot: `s` with `c` applied. Never mutates either, and never writes a `__proto__`, `constructor` or `prototype` key, whatever
 * the change holds (it may come straight off the wire).
 */
export function fold(s: ReaderSnapshot, c: SnapshotChange): ReaderSnapshot {
  const slices: Record<SliceId, SliceValue> = {};
  for (const id of Object.keys(s.slices)) {
    if (!isForbiddenKey(id)) slices[id] = s.slices[id]!;
  }
  if (c.slices) {
    for (const id of Object.keys(c.slices)) {
      if (isForbiddenKey(id)) continue;
      const next = c.slices[id];
      if (next === null) delete slices[id];
      else if (next !== undefined) slices[id] = next;
    }
  }
  return {
    v: 1,
    url: typeof c.url === "string" ? c.url : s.url,
    nav: has(c, "nav") ? c.nav : s.nav,
    slices,
  };
}
