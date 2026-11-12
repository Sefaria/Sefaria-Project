import { describe, expect, it, vi } from "vitest";
import { createScrollSlice, isScrollValue, type PanelAnchor, type ScrollPanel } from "./scroll";

const ctx = { origin: "playback", persist: false } as const;

/** A manual clock and frame queue, so retries are stepped by hand. */
function harness(panels: ScrollPanel[]) {
  let t = 0;
  const frames: (() => void)[] = [];
  const moves = new Set<() => void>();
  const slice = createScrollSlice(
    { list: () => panels, onMove: (cb) => (moves.add(cb), () => void moves.delete(cb)) },
    { now: () => t, frame: (cb) => void frames.push(cb), timeoutMs: 3000 },
  );
  const tick = (ms = 16) => {
    t += ms;
    const run = frames.splice(0);
    run.forEach((f) => f());
  };
  return { slice, tick, moves, frames };
}

function panel(key: string, opts: { pos?: PanelAnchor; loadedAfter?: number } = {}) {
  let tries = 0;
  const p = {
    key,
    getPosition: vi.fn(() => opts.pos),
    restorePosition: vi.fn((_: PanelAnchor) => ++tries > (opts.loadedAfter ?? 0)),
    scrollToSegment: vi.fn((_: string) => true),
  };
  return p;
}

describe("sefaria.scroll", () => {
  it("reads every panel's anchor by its key", () => {
    const { slice } = harness([panel("a", { pos: { ref: "Genesis 1:3", offset: 140 } }), panel("b")]);
    expect(slice.get()).toEqual({ a: { ref: "Genesis 1:3", offset: 140 } });
    expect(slice).toMatchObject({ id: "sefaria.scroll", version: 1, scope: "moment", applyOrder: 100 });
  });

  it("validates", () => {
    expect(isScrollValue({ a: { ref: "Genesis 1:1", offset: -20.5 } })).toBe(true);
    expect(isScrollValue({})).toBe(true);
    expect(isScrollValue({ a: { ref: "", offset: 0 } })).toBe(false);
    expect(isScrollValue({ a: { ref: "x", offset: Infinity } })).toBe(false);
    expect(isScrollValue({ a: null })).toBe(false);
    expect(isScrollValue([])).toBe(false);
  });

  it("puts each named panel back at once when its text is there, and leaves the others", async () => {
    const a = panel("a");
    const b = panel("b");
    const { slice } = harness([a, b]);
    await slice.apply({ a: { ref: "Genesis 1:5", offset: 10 } }, ctx);
    expect(a.restorePosition).toHaveBeenCalledWith({ ref: "Genesis 1:5", offset: 10 });
    expect(b.restorePosition).not.toHaveBeenCalled();
  });

  it("stops retrying, without the last-resort scroll, once the API aborts the apply (the person took over)", async () => {
    const a = panel("a", { loadedAfter: 100 });
    const { slice, tick, frames } = harness([a]);
    const controller = new AbortController();
    const done = slice.apply({ a: { ref: "Genesis 1:5", offset: 10 } }, { ...ctx, signal: controller.signal });
    tick();
    const tries = a.restorePosition.mock.calls.length;
    controller.abort();
    tick();
    await done;
    expect(a.restorePosition).toHaveBeenCalledTimes(tries);
    tick(5000);
    expect(frames).toHaveLength(0);
    expect(a.scrollToSegment).not.toHaveBeenCalled();
  });

  it("retries each frame until the text is loaded", async () => {
    const a = panel("a", { loadedAfter: 3 });
    const { slice, tick } = harness([a]);
    const done = slice.apply({ a: { ref: "Genesis 2:1", offset: 0 } }, ctx);
    tick();
    tick();
    tick();
    await done;
    expect(a.restorePosition).toHaveBeenCalledTimes(4);
    expect(a.scrollToSegment).not.toHaveBeenCalled();
  });

  it("falls back to scrollToSegment after the timeout", async () => {
    const a = panel("a", { loadedAfter: Infinity });
    const { slice, tick } = harness([a]);
    const done = slice.apply({ a: { ref: "Genesis 2:1", offset: 0 } }, ctx);
    for (let i = 0; i < 200; i++) tick(20);
    await done;
    expect(a.scrollToSegment).toHaveBeenCalledWith("Genesis 2:1");
  });

  it("waits for a panel that is not mounted yet", async () => {
    const list: ScrollPanel[] = [];
    let t = 0;
    const frames: (() => void)[] = [];
    const slice = createScrollSlice({ list: () => list, onMove: () => () => {} }, { now: () => t, frame: (cb) => void frames.push(cb) });
    const done = slice.apply({ late: { ref: "Exodus 1:1", offset: 5 } }, ctx);
    const late = panel("late");
    list.push(late);
    t += 16;
    frames.splice(0).forEach((f) => f());
    await done;
    expect(late.restorePosition).toHaveBeenCalledOnce();
  });

  it("a newer apply ends the retries of an older one", async () => {
    const a = panel("a", { loadedAfter: Infinity });
    const { slice, tick } = harness([a]);
    const first = slice.apply({ a: { ref: "Genesis 1:1", offset: 0 } }, ctx);
    const second = slice.apply({}, ctx);
    await second;
    tick();
    await first;
    for (let i = 0; i < 200; i++) tick(20);
    expect(a.scrollToSegment).not.toHaveBeenCalled();
  });

  it("subscribes through the panels' movement", () => {
    const { slice, moves } = harness([]);
    const cb = vi.fn();
    const off = slice.subscribe(cb);
    moves.forEach((m) => m());
    expect(cb).toHaveBeenCalledOnce();
    off();
    expect(moves.size).toBe(0);
  });
});
