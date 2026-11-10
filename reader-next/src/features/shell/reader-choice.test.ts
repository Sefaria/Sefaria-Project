import { afterEach, describe, expect, it, vi } from "vitest";
import { applyKillSwitch, backToClassic, cookieDomains, killSwitchOn, optedIn, READER_CHOICE_URL } from "./reader-choice";

const fakeDoc = (cookie: string) => {
  const writes: string[] = [];
  return { doc: { get cookie() { return cookie; }, set cookie(v: string) { writes.push(v); } } as unknown as Document, writes };
};
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

afterEach(() => vi.restoreAllMocks());

// @feature ACC-003
describe("kill switch (remote config feature.reader.next.disabled)", () => {
  it("reads the switch", () => {
    expect([killSwitchOn(undefined), killSwitchOn({}), killSwitchOn({ "feature.reader.next.disabled": false }), killSwitchOn({ "feature.reader.next.disabled": true }), killSwitchOn({ "feature.reader.next.disabled": 1 })]).toEqual([false, false, false, true, true]);
  });

  it("on, with the opt-in cookie: clears reader_version on the host and its parent domains, reloads, once per session", () => {
    const { doc, writes } = fakeDoc("a=1; reader_version=next");
    const reload = vi.fn();
    const storage = memory();
    expect(applyKillSwitch({ "feature.reader.next.disabled": true }, { doc, hostname: "www.sefaria.org", reload, storage })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([
      "reader_version=; path=/; max-age=0; samesite=lax",
      "reader_version=; path=/; max-age=0; samesite=lax; domain=www.sefaria.org",
      "reader_version=; path=/; max-age=0; samesite=lax; domain=sefaria.org",
    ]);
    // the same session again (this client served without the cookie): no reload loop
    expect(applyKillSwitch({ "feature.reader.next.disabled": true }, { doc, hostname: "www.sefaria.org", reload, storage })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("off, or no cookie: nothing happens", () => {
    const reload = vi.fn();
    expect(applyKillSwitch({ "feature.reader.next.disabled": false }, { ...fakeDoc("reader_version=next"), hostname: "x.org", reload, storage: memory() })).toBe(false);
    expect(applyKillSwitch({ "feature.reader.next.disabled": true }, { ...fakeDoc("a=1"), hostname: "x.org", reload, storage: memory() })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("cookie domains", () => {
    expect(cookieDomains("localhost")).toEqual([]);
    expect(cookieDomains("127.0.0.1")).toEqual([]);
    expect(cookieDomains("www.sefaria.org.il")).toEqual(["www.sefaria.org.il", "sefaria.org.il", "org.il"]);
  });
});

describe("back to the classic reader", () => {
  it("posts {reader: legacy} to the reader-choice endpoint, clears the cookie and reloads (even if the endpoint fails)", async () => {
    const post = vi.fn(async () => ({ ok: false, status: 404, data: {}, networkError: false }));
    const reload = vi.fn();
    const { doc, writes } = fakeDoc("reader_version=next");
    expect(await backToClassic({ post, reload, doc, hostname: "localhost" })).toEqual({ ok: false, status: 404, timedOut: false });
    expect(post).toHaveBeenCalledWith(READER_CHOICE_URL, { reader: "legacy" });
    expect(writes).toEqual(["reader_version=; path=/; max-age=0; samesite=lax"]);
    expect(reload).toHaveBeenCalled();
  });
  it("the opt-in is the cookie", () => {
    expect([optedIn("reader_version=next"), optedIn("reader_version=classic"), optedIn("x=reader_version=next")]).toEqual([true, false, false]);
  });
});

describe("rework: interval and timeout", () => {
  it("the kill switch may reload again after ten minutes", () => {
    const reload = vi.fn();
    const storage = memory();
    let now = 1_000_000;
    const run = () => applyKillSwitch({ "feature.reader.next.disabled": true }, { ...fakeDoc("reader_version=next"), hostname: "x.org", reload, storage, now: () => now });
    expect(run()).toBe(true);
    now += 9 * 60_000;
    expect(run()).toBe(false);
    now += 2 * 60_000;
    expect(run()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
  it("back to classic goes anyway when Django does not answer in time", async () => {
    const post = vi.fn(() => new Promise<never>(() => {}));
    const reload = vi.fn();
    const { doc, writes } = fakeDoc("reader_version=next");
    expect(await backToClassic({ post: post as never, reload, doc, hostname: "localhost", timeoutMs: 20 })).toEqual({ ok: false, status: 0, timedOut: true });
    expect(writes).toEqual(["reader_version=; path=/; max-age=0; samesite=lax"]);
    expect(reload).toHaveBeenCalled();
  });
});
