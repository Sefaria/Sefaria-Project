import { describe, expect, it, vi } from "vitest";
import { createReaderStateApi } from "./api";
import { fakeHost, fakeSlice, flushPromises } from "./test-utils";
import { WARNING, type ApplyContext, type ReaderSnapshot } from "./types";

const ctx: ApplyContext = { origin: "follow", persist: false };

function setup() {
  const h = fakeHost("/Genesis.1", { nav: "go" });
  const settings = fakeSlice("sefaria.settings", { fontSize: 62 }, { scope: "personal" });
  const scroll = fakeSlice("sefaria.scroll", { p1: { ref: "Genesis 1:1", offset: 0 } }, { applyOrder: 100 });
  const focus = fakeSlice("sefaria.focus", "p1");
  h.slices.register(settings);
  h.slices.register(scroll);
  h.slices.register(focus);
  const api = createReaderStateApi(h.host);
  return { ...h, api, settings, scroll, focus };
}

describe("getSnapshot", () => {
  it("reads location and every slice as {v, value}", () => {
    const { api } = setup();
    expect(api.getSnapshot()).toEqual({
      v: 1,
      url: "/Genesis.1",
      nav: { nav: "go" },
      slices: {
        "sefaria.settings": { v: 1, value: { fontSize: 62 } },
        "sefaria.scroll": { v: 1, value: { p1: { ref: "Genesis 1:1", offset: 0 } } },
        "sefaria.focus": { v: 1, value: "p1" },
      },
    });
  });

  it("filters: moment scope, include, exclude", () => {
    const { api } = setup();
    expect(Object.keys(api.getSnapshot({ scope: "moment" }).slices)).toEqual(["sefaria.scroll", "sefaria.focus"]);
    expect(Object.keys(api.getSnapshot({ include: ["sefaria.focus"] }).slices)).toEqual(["sefaria.focus"]);
    expect(Object.keys(api.getSnapshot({ exclude: ["sefaria.scroll"] }).slices)).toEqual(["sefaria.settings", "sefaria.focus"]);
  });

  it("takes a detached copy of each value", () => {
    const h = fakeHost();
    const live = { list: [1] };
    h.slices.register(fakeSlice("s", live));
    const snap = createReaderStateApi(h.host).getSnapshot();
    live.list.push(2);
    expect(snap.slices.s!.value).toEqual({ list: [1] });
  });

  it("skips a slice whose get throws", () => {
    const h = fakeHost();
    const broken = { ...fakeSlice("bad", 1), get: () => { throw new Error("boom"); } };
    h.slices.register(broken);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(createReaderStateApi(h.host).getSnapshot().slices).toEqual({});
  });
});

describe("applySnapshot", () => {
  const target = (over: Partial<ReaderSnapshot> = {}): ReaderSnapshot => ({
    v: 1,
    url: "/Exodus.2",
    nav: { nav: "go", panelKeys: ["k9"] },
    slices: {
      "sefaria.scroll": { v: 1, value: { p1: { ref: "Exodus 2:3", offset: 0.5 } } },
      "sefaria.settings": { v: 1, value: { fontSize: 80 } },
    },
    ...over,
  });

  it("navigates with replace, waits for settled, then applies slices by applyOrder", async () => {
    const { api, navigate, settled, settings, scroll } = setup();
    const order: string[] = [];
    navigate.mockImplementationOnce(async () => void order.push("navigate"));
    settled.mockImplementationOnce(async () => void order.push("settled"));
    const origSettings = settings.apply.bind(settings);
    const origScroll = scroll.apply.bind(scroll);
    settings.apply = async (v, c) => { order.push("settings"); await origSettings(v, c); };
    scroll.apply = async (v, c) => { order.push("scroll"); await origScroll(v, c); };

    const result = await api.applySnapshot(target(), ctx);
    expect(result.warnings).toEqual([]);
    expect(navigate).toHaveBeenCalledWith("/Exodus.2", { nav: "go", panelKeys: ["k9"] }, "replace");
    expect(order).toEqual(["navigate", "settled", "settings", "scroll"]); // scroll (applyOrder 100) last
  });

  it("does not navigate when url and nav are already current", async () => {
    const { api, navigate, settled } = setup();
    await api.applySnapshot(target({ url: "/Genesis.1", nav: { nav: "go" } }), ctx);
    expect(navigate).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalled();
  });

  it("refuses a url the host does not accept (103) but still applies slices", async () => {
    const { api, navigate, settings } = setup();
    const result = await api.applySnapshot(target({ url: "//evil.example/x" }), ctx);
    expect(navigate).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([{ code: WARNING.URL_REFUSED, detail: "//evil.example/x" }]);
    expect(settings.applied).toEqual([{ fontSize: 80 }]);
  });

  it("an invalid snapshot applies nothing and only warns", async () => {
    const { api, navigate, settings } = setup();
    const bad = JSON.parse('{"v":1,"url":"/x","nav":null,"slices":{"__proto__":{"v":1,"value":1}}}');
    const result = await api.applySnapshot(bad, ctx);
    expect(result.warnings).toHaveLength(1);
    expect(navigate).not.toHaveBeenCalled();
    expect(settings.applied).toEqual([]);
    expect(api.applying).toBe(false);
    expect(await api.applySnapshot({ v: 1, url: 5 } as unknown as ReaderSnapshot, ctx)).toMatchObject({ warnings: [{ code: WARNING.URL_REFUSED }] });
  });

  it("warns 200 for an unknown slice, 201 for newer / invalid / declined, 202 when apply throws", async () => {
    const h = fakeHost();
    h.slices.register(fakeSlice("newer", 1, { version: 1 }));
    h.slices.register(fakeSlice("invalid", 1, { validate: (v): v is number => typeof v === "number" }));
    h.slices.register(fakeSlice("declined", 1, { version: 2, migrate: () => undefined }));
    h.slices.register(fakeSlice("nomigrate", 1, { version: 2 }));
    const migrated = fakeSlice("migrated", 0, { version: 2, migrate: (v, from) => (from === 1 ? (v as number) * 10 : undefined) });
    h.slices.register(migrated);
    h.slices.register(fakeSlice("throws", 1, { apply: () => { throw new Error("nope"); } }));
    h.slices.register(fakeSlice("rejects", 1, { apply: async () => { throw new Error("async nope"); } }));
    const api = createReaderStateApi(h.host);
    const result = await api.applySnapshot(
      {
        v: 1,
        url: "/Genesis.1",
        nav: null,
        slices: {
          unknown: { v: 1, value: 1 },
          newer: { v: 2, value: 1 },
          invalid: { v: 1, value: "str" },
          declined: { v: 1, value: 1 },
          nomigrate: { v: 1, value: 1 },
          migrated: { v: 1, value: 4 },
          throws: { v: 1, value: 2 },
          rejects: { v: 1, value: 2 },
        },
      },
      ctx,
    );
    expect(result.warnings.map((w) => [w.code, w.slice])).toEqual([
      [200, "unknown"],
      [201, "newer"],
      [201, "invalid"],
      [201, "declined"],
      [201, "nomigrate"],
      [202, "throws"],
      [202, "rejects"],
    ]);
    expect(migrated.applied).toEqual([40]);
  });

  it("passes the apply context to slices and is `applying` until one tick after the last apply", async () => {
    const { api, settings, tick } = setup();
    const spy = vi.spyOn(settings, "apply");
    const p = api.applySnapshot(target(), ctx);
    expect(api.applying).toBe(true);
    await p;
    expect(spy).toHaveBeenCalledWith({ fontSize: 80 }, { ...ctx, signal: expect.any(AbortSignal) });
    expect(api.applying).toBe(true);
    tick();
    expect(api.applying).toBe(false);
  });

  it("never throws, even when the host does", async () => {
    const { api, navigate, settled, tick } = setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    navigate.mockRejectedValueOnce(new Error("router down"));
    settled.mockRejectedValueOnce(new Error("load failed"));
    const result = await api.applySnapshot(target(), ctx);
    expect(result.warnings).toEqual([{ code: WARNING.URL_REFUSED, detail: "navigation failed: router down" }]);
    tick();
    expect(api.applying).toBe(false);
  });
});

describe("subscribe", () => {
  it("reports a local change, coalesced to one call per tick, with the filtered snapshot after it", () => {
    const { api, go, focus, scroll, tick } = setup();
    const cb = vi.fn();
    api.subscribe(cb, { scope: "moment" });
    go("/Genesis.2");
    focus.set("p2");
    scroll.set({ p1: { ref: "Genesis 2:1", offset: 0.1 } });
    scroll.set({ p1: { ref: "Genesis 2:4", offset: 0.3 } });
    expect(cb).not.toHaveBeenCalled();
    tick();
    expect(cb).toHaveBeenCalledTimes(1);
    const [change, snapshot] = cb.mock.calls[0]!;
    expect(change).toEqual({
      url: "/Genesis.2",
      slices: { "sefaria.focus": { v: 1, value: "p2" }, "sefaria.scroll": { v: 1, value: { p1: { ref: "Genesis 2:4", offset: 0.3 } } } },
    });
    expect(Object.keys(snapshot.slices)).toEqual(["sefaria.scroll", "sefaria.focus"]);
  });

  it("ignores changes to filtered-out slices and no-op notifications", () => {
    const { api, settings, focus, tick } = setup();
    const cb = vi.fn();
    api.subscribe(cb, { scope: "moment" });
    settings.set({ fontSize: 99 }); // personal: not in a moment stream
    focus.set("p1"); // same value
    tick();
    expect(cb).not.toHaveBeenCalled();
  });

  it("never reports what applySnapshot did (echo suppression), and re-baselines after the window", async () => {
    const { api, focus, tick, input } = setup();
    const cb = vi.fn();
    api.subscribe(cb);
    await api.applySnapshot(
      { v: 1, url: "/Exodus.2", nav: { nav: "go" }, slices: { "sefaria.focus": { v: 1, value: "p3" } } },
      ctx,
    );
    // A late notification from the apply (a re-render) still inside the window:
    focus.set("p3");
    tick(); // closes the window
    tick();
    expect(cb).not.toHaveBeenCalled();
    expect(api.applying).toBe(false);
    // A later local change (it starts with the person's input) is reported against the applied state, not the old one:
    input();
    focus.set("p4");
    tick();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0]).toEqual({ slices: { "sefaria.focus": { v: 1, value: "p4" } } });
  });

  it("local input during the window aborts it: remaining slices are skipped and later changes count as local", async () => {
    const h = fakeHost();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = fakeSlice("first", 0, { apply: () => gate });
    const second = fakeSlice("second", 0, { applyOrder: 10 });
    h.slices.register(first);
    h.slices.register(second);
    const api = createReaderStateApi(h.host);
    const cb = vi.fn();
    const inputs = vi.fn();
    api.subscribe(cb);
    api.onLocalInput(inputs);

    const p = api.applySnapshot({ v: 1, url: "/Genesis.1", nav: null, slices: { first: { v: 1, value: 1 }, second: { v: 1, value: 1 } } }, ctx);
    await flushPromises();
    expect(api.applying).toBe(true);
    h.input();
    expect(inputs).toHaveBeenCalledTimes(1);
    expect(api.applying).toBe(false);
    h.go("/Genesis.5"); // the person's own navigation
    release();
    await p;
    expect(second.applied).toEqual([]); // the person took over
    h.tickAll();
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls.at(-1)![0]).toMatchObject({ url: "/Genesis.5" });
  });

  it("aborts the slices' signal on local input, so a slice still working (scroll retrying) stops", async () => {
    const h = fakeHost();
    let seen: AbortSignal | undefined;
    const slow = fakeSlice("slow", 0);
    slow.apply = (_v, c) => {
      seen = c.signal;
      return new Promise<void>((resolve) => c.signal?.addEventListener("abort", () => resolve()));
    };
    h.slices.register(slow);
    const api = createReaderStateApi(h.host);
    const p = api.applySnapshot({ v: 1, url: "/Genesis.1", nav: null, slices: { slow: { v: 1, value: 1 } } }, ctx);
    await flushPromises();
    expect(seen?.aborted).toBe(false);
    h.input();
    expect(seen?.aborted).toBe(true);
    await p;
  });

  it("a newer apply supersedes one still running: the older stops, its signal fires, and the window closes after both", async () => {
    const h = fakeHost();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const signals: AbortSignal[] = [];
    const first = fakeSlice("first", 0);
    first.apply = (_v, c) => {
      signals.push(c.signal!);
      return signals.length === 1 ? gate : undefined;
    };
    const second = fakeSlice("second", 0, { applyOrder: 10 });
    h.slices.register(first);
    h.slices.register(second);
    const api = createReaderStateApi(h.host);
    const older = api.applySnapshot({ v: 1, url: "/Genesis.1", nav: null, slices: { first: { v: 1, value: 1 }, second: { v: 1, value: 1 } } }, ctx);
    await flushPromises();
    const newer = api.applySnapshot({ v: 1, url: "/Genesis.1", nav: null, slices: { first: { v: 1, value: 2 }, second: { v: 1, value: 2 } } }, ctx);
    expect(signals[0]!.aborted).toBe(true);
    await newer;
    expect(second.applied).toEqual([2]);
    release();
    await older;
    expect(second.applied).toEqual([2]); // the older one never reached `second`
    expect(api.applying).toBe(true);
    h.tickAll();
    expect(api.applying).toBe(false);
  });

  it("absorbs the apply's echo after the window (the settling tail) until the person's input", async () => {
    const { api, focus, tick, input } = setup();
    const cb = vi.fn();
    api.subscribe(cb);
    await api.applySnapshot({ v: 1, url: "/Exodus.2", nav: { nav: "go" }, slices: { "sefaria.focus": { v: 1, value: "p3" } } }, ctx);
    tick();
    tick();
    expect(api.applying).toBe(false);
    focus.set("p5"); // the reader settling after the apply (no input): absorbed
    tick();
    expect(cb).not.toHaveBeenCalled();
    input();
    focus.set("p6");
    tick();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0]).toEqual({ slices: { "sefaria.focus": { v: 1, value: "p6" } } });
  });

  it("follows the registry: a slice registered later is reported, an unregistered one stops", () => {
    const { api, slices, tick } = setup();
    const cb = vi.fn();
    api.subscribe(cb);
    const late = fakeSlice("late", 1);
    const off = slices.register(late);
    tick();
    expect(cb.mock.calls.at(-1)![0]).toEqual({ slices: { late: { v: 1, value: 1 } } });
    late.set(2);
    tick();
    expect(cb.mock.calls.at(-1)![0]).toEqual({ slices: { late: { v: 1, value: 2 } } });
    off();
    tick();
    expect(cb.mock.calls.at(-1)![0]).toEqual({ slices: { late: null } });
    const calls = cb.mock.calls.length;
    late.set(3);
    tick();
    expect(cb).toHaveBeenCalledTimes(calls);
  });

  it("unsubscribe stops reports and releases the slice subscriptions", () => {
    const { api, focus, tick } = setup();
    const cb = vi.fn();
    const off = api.subscribe(cb);
    off();
    focus.set("p9");
    tick();
    expect(cb).not.toHaveBeenCalled();
  });

  it("forwards history input (back/forward) to onLocalInput too", () => {
    const { api, input } = setup();
    const cb = vi.fn();
    const off = api.onLocalInput(cb);
    input("history");
    off();
    input();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
