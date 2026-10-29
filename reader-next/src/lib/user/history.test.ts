// @feature USL-010 @feature USL-011 @feature USL-001
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findSaved, legacyVersions, MAX_ANON_HISTORY_BYTES, saveAnonHistory, setSaved, syncHistory, trimForCookie, versionsEqual, type HistoryItem } from "./history";

const NONE = { en: null, he: null };
const KOREN = { en: { versionTitle: "The Koren Jerusalem Bible", languageFamilyName: "english" }, he: null };

describe("versions and saved items (getSavedItem / areVersionsEqual)", () => {
  it("maps this client's versions to the old currVersions (he = source, en = translation)", () => {
    expect(legacyVersions({})).toEqual(NONE);
    expect(legacyVersions({ translation: "english|The Koren Jerusalem Bible" })).toEqual(KOREN);
  });
  it("treats missing as empty, and an old-style string as a title", () => {
    expect(versionsEqual({}, NONE)).toBe(true);
    expect(versionsEqual({ en: "The Koren Jerusalem Bible" }, KOREN)).toBe(false); // family differs ("" vs english)
    expect(versionsEqual(KOREN, { en: { versionTitle: "The Koren Jerusalem Bible", languageFamilyName: "english" } })).toBe(true);
  });
  it("finds the record for this ref in these versions only", () => {
    const saved = [{ ref: "Genesis 1", versions: {} }, { ref: "Genesis 2", versions: KOREN }];
    expect(findSaved(saved, { ref: "Genesis 1", versions: NONE })).toBeTruthy();
    expect(findSaved(saved, { ref: "Genesis 1", versions: KOREN })).toBeUndefined();
    expect(findSaved(saved, { ref: "Genesis 2", versions: KOREN })).toBeTruthy();
  });
});

describe("requests (profile_sync_api)", () => {
  let calls: { url: string; body: string; headers: Record<string, string> }[];
  beforeEach(() => {
    calls = [];
    document.cookie = "csrftoken=tok123; path=/";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body), headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify({ created: [{ ref: "Genesis 1", versions: {}, saved: true }] }), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("history: POST /api/profile/sync?no_return=1&annotate=1 with user_history JSON, CSRF header, no client field", async () => {
    await syncHistory([{ ref: "Genesis 1", versions: NONE, book: "Genesis", language: "bilingual" }]);
    expect(calls[0]!.url).toMatch(/\/api\/profile\/sync\?no_return=1&annotate=1$/);
    expect(calls[0]!.headers["X-CSRFToken"]).toBe("tok123");
    const form = new URLSearchParams(calls[0]!.body);
    expect([...form.keys()]).toEqual(["user_history"]);
    const [item] = JSON.parse(form.get("user_history")!);
    expect(item).toMatchObject({ ref: "Genesis 1", versions: NONE, book: "Genesis", language: "bilingual" });
    expect(typeof item.time_stamp).toBe("number");
  });
  it("save: action add_saved with client=web, returns the created record; remove: delete_saved", async () => {
    const created = await setSaved({ ref: "Genesis 1", versions: NONE }, true);
    expect(created).toMatchObject({ ref: "Genesis 1", saved: true });
    const form = new URLSearchParams(calls[0]!.body);
    expect(calls[0]!.url).toMatch(/\/api\/profile\/sync\?no_return=1$/);
    expect(form.get("client")).toBe("web");
    expect(JSON.parse(form.get("user_history")!)[0]).toMatchObject({ ref: "Genesis 1", versions: NONE, action: "add_saved" });
    await setSaved({ ref: "Genesis 1", versions: NONE }, false);
    expect(JSON.parse(new URLSearchParams(calls[1]!.body).get("user_history")!)[0].action).toBe("delete_saved");
  });
  it("an error answer (signed out on the server) is a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "You must be logged in to update your profile." }), { status: 200 })));
    await expect(setSaved({ ref: "Genesis 1", versions: NONE }, true)).rejects.toThrow(/logged in/);
  });
});

describe("signed out: the user_history cookie (_trimUserHistoryForCookie)", () => {
  afterEach(() => (document.cookie = "user_history=; path=/; max-age=0"));
  it("keeps the newest first within 3000 encoded bytes, and drops sidebar (secondary) items", () => {
    for (let i = 1; i <= 60; i++) saveAnonHistory([{ ref: `Genesis ${i}`, he_ref: `בראשית ${i}`, versions: NONE, book: "Genesis" }]);
    saveAnonHistory([{ ref: "Rashi on Genesis 1:1:1", versions: NONE, secondary: true }]);
    const raw = document.cookie.split("; ").find((c) => c.startsWith("user_history="))!.slice("user_history=".length);
    expect(raw.length).toBeLessThanOrEqual(MAX_ANON_HISTORY_BYTES);
    const items = JSON.parse(decodeURIComponent(raw)) as HistoryItem[];
    expect(items[0]!.ref).toBe("Genesis 60");
    expect(items.some((x) => x.ref === "Genesis 1")).toBe(false);
    expect(items.some((x) => x.secondary)).toBe(false);
  });
  it("trimForCookie keeps the longest prefix that fits", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ ref: `Exodus ${i}`, versions: NONE }));
    const kept = trimForCookie(many);
    expect(encodeURIComponent(JSON.stringify(kept)).length).toBeLessThanOrEqual(MAX_ANON_HISTORY_BYTES);
    expect(encodeURIComponent(JSON.stringify(many.slice(0, kept.length + 1))).length).toBeGreaterThan(MAX_ANON_HISTORY_BYTES);
  });
});
