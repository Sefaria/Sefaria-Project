// @feature LIB-022 @feature NTF-004
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteUpdate, postUpdate, updatePayload, updatesQuery, updatesUrl, validateUpdate, UPDATES_PAGE_SIZE, type UpdateDraft } from "./updates";
import type { NotificationRecord } from "~/lib/notifications/notifications";

const draft = (d: Partial<UpdateDraft>): UpdateDraft => ({ type: "index", index: "", version: "", language: "en", en: "", he: "", ...d });
const rec = (id: string): NotificationRecord => ({ _id: id, type: "index", date: 1, content: { index: "Genesis" } });

afterEach(() => vi.unstubAllGlobals());

describe("New Additions' data", () => {
  it("asks for the updates a page at a time; a short page is the last (no endless empty pages at the end)", () => {
    expect(updatesUrl(0)).toBe("/api/updates?page=0");
    const next = updatesQuery().getNextPageParam!;
    const full = Array.from({ length: UPDATES_PAGE_SIZE }, (_, i) => rec(String(i)));
    expect(next(full, [full], 0, [0])).toBe(1);
    expect(next([], [full, []], 1, [0, 1])).toBeUndefined();
  });
  it("checks the moderators' form as the old one did", () => {
    expect(validateUpdate(draft({ type: "general", en: "a" }))).toBe("Both Hebrew and English are required");
    expect(validateUpdate(draft({ type: "general", en: "a", he: "b" }))).toBeNull();
    expect(validateUpdate(draft({ type: "index" }))).toBe("Index is required");
    expect(validateUpdate(draft({ type: "version", index: "Genesis" }))).toBe("Version is required");
    expect(validateUpdate(draft({ type: "version", index: "Genesis", version: "V" }))).toBeNull();
  });
  it("sends what the old form sent, trimmed", () => {
    expect(updatePayload(draft({ type: "general", en: " a ", he: " b " }))).toEqual({ type: "general", content: { en: "a", he: "b" } });
    expect(updatePayload(draft({ type: "version", index: " Genesis ", version: " V ", language: "he" }))).toEqual({ type: "version", content: { en: "", he: "", index: "Genesis", version: "V", language: "he" } });
  });
  it("posts json=<payload> and deletes by id, with CSRF; the server's error is shown as the old page did", async () => {
    document.cookie = "csrftoken=tok";
    const calls: { url: string; init: RequestInit }[] = [];
    let answer: unknown = { status: "ok" };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(answer), { status: 200 });
    }));
    expect(await postUpdate({ type: "general", content: { en: "a", he: "b" } })).toBeNull();
    expect(JSON.parse(new URLSearchParams(String(calls[0]!.init.body)).get("json")!)).toEqual({ type: "general", content: { en: "a", he: "b" } });
    answer = { error: "Unauthorized" };
    expect(await postUpdate({ type: "general", content: { en: "a", he: "b" } })).toBe("Error - Unauthorized");
    answer = { status: "ok" };
    expect(await deleteUpdate("abc")).toBe(true);
    expect(calls[2]!.url).toMatch(/\/api\/updates\/abc$/);
    expect(calls[2]!.init.method).toBe("DELETE");
    expect((calls[2]!.init.headers as Record<string, string>)["X-CSRFToken"]).toBe("tok");
  });
});
