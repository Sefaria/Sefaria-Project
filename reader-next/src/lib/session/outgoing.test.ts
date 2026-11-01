import { describe, expect, it, vi } from "vitest";
import type { ReaderSnapshot, ReaderStateApi, SnapshotChange } from "~/lib/reader-state/core/types";
import { isPrivateUrl, publicView } from "./outgoing";

function fakeApi(url: string, nav: unknown = null) {
  let current: ReaderSnapshot = { v: 1, url, nav, slices: { "sefaria.focus": { v: 1, value: "p1" } } };
  const subs = new Set<(c: SnapshotChange, s: ReaderSnapshot) => void>();
  const api: ReaderStateApi = {
    getSnapshot: () => current,
    applySnapshot: async () => ({ warnings: [] }),
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    onLocalInput: () => () => {},
    applying: false,
  };
  const go = (next: Partial<ReaderSnapshot>) => {
    current = { ...current, ...next };
    subs.forEach((cb) => cb({}, current));
  };
  return { api, go };
}

describe("isPrivateUrl", () => {
  it("names search, sign-in and password pages, and nothing else", () => {
    for (const u of ["/search?q=secret", "/login", "/register?next=/x", "/password/reset/confirm/abc/tok", "/%73earch?q=x", "/Search"]) {
      expect(isPrivateUrl(u)).toBe(true);
    }
    for (const u of ["/Genesis.1", "/searching-for-meaning", "/texts", "/"]) expect(isPrivateUrl(u)).toBe(false);
  });
});

describe("publicView", () => {
  it("drops the search words from history state", () => {
    const { api } = fakeApi("/Genesis.1", { nav: "go", terms: ["light"], panelKeys: ["k1"] });
    expect(publicView(api).getSnapshot().nav).toEqual({ nav: "go", panelKeys: ["k1"] });
  });

  it("sends nothing while the person is on a private page, and resumes after", () => {
    const { api, go } = fakeApi("/Genesis.1");
    const view = publicView(api);
    const cb = vi.fn();
    view.subscribe(cb);
    go({ url: "/search?q=my+question", nav: { terms: ["my", "question"] }, slices: {} });
    expect(cb).not.toHaveBeenCalled();
    expect(view.getSnapshot().url).toBe("/Genesis.1");
    go({ url: "/Exodus.3", nav: null, slices: { "sefaria.focus": { v: 1, value: "p1" } } });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0]).toEqual({ url: "/Exodus.3" });
  });

  it("shows a neutral page when the session starts on a private one", () => {
    const { api } = fakeApi("/password/reset/confirm/uid/token");
    expect(publicView(api).getSnapshot()).toEqual({ v: 1, url: "/", nav: undefined, slices: {} });
  });
});
