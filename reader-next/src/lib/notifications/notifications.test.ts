// @feature NTF-001 @feature NTF-003
import { afterEach, describe, expect, it, vi } from "vitest";
import { bookHref, markNotificationsRead, notificationsQuery, notificationsUrl, uniqueNotifications, unreadIds, NOTIFICATIONS_PAGE_SIZE, type NotificationRecord } from "./notifications";

const rec = (id: string, read = false): NotificationRecord => ({ _id: id, type: "general", date: 1, read, content: { en: "x" } });

afterEach(() => vi.unstubAllGlobals());

describe("the notifications page's data", () => {
  it("asks for the Library's notifications a page at a time", () => {
    expect(notificationsUrl(0)).toBe("/api/notifications?page=0&scope=library");
    expect(notificationsUrl(3)).toBe("/api/notifications?page=3&scope=library");
  });
  it("asks for the next page while the last was full; a short page is the last", () => {
    const next = notificationsQuery(1).getNextPageParam!;
    const full = Array.from({ length: NOTIFICATIONS_PAGE_SIZE }, (_, i) => rec(String(i)));
    expect(next(full, [full], 0, [0])).toBe(1);
    expect(next(full, [full, full], 1, [0, 1])).toBe(2);
    expect(next([rec("a")], [full, [rec("a")]], 1, [0, 1])).toBeUndefined();
  });
  it("does not ask while nobody is signed in", () => {
    expect(notificationsQuery(null).enabled).toBe(false);
  });
  it("shows a notification once when pages overlap, in order", () => {
    expect(uniqueNotifications([[rec("a"), rec("b")], [rec("b"), rec("c")]]).map((n) => n._id)).toEqual(["a", "b", "c"]);
  });
  it("marks read only what is unread and not already sent", () => {
    expect(unreadIds([rec("a"), rec("b", true), rec("c")], new Set(["c"]))).toEqual(["a"]);
  });
  it("links a book as the old page did ('/' + normRef: underscores, then URI-encoded)", () => {
    expect(bookHref("She Is Life; Halakha and Women at Life's Crossroads")).toBe("/She_Is_Life%3B_Halakha_and_Women_at_Life's_Crossroads");
    expect(bookHref("Ben Yehuda Dictionary")).toBe("/Ben_Yehuda_Dictionary");
  });
  it("posts the ids as JSON with the Library scope and the CSRF token, and answers the unread count", async () => {
    document.cookie = "csrftoken=tok";
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ status: "ok", unreadCount: 2 }), { status: 200 });
    }));
    expect(await markNotificationsRead(["a", "b"])).toBe(2);
    expect(calls[0]!.url).toMatch(/\/api\/notifications\/read$/);
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>)["X-CSRFToken"]).toBe("tok");
    expect(new URLSearchParams(String(calls[0]!.init.body)).get("notifications")).toBe('["a","b"]');
    expect(new URLSearchParams(String(calls[0]!.init.body)).get("scope")).toBe("library");
    expect(await markNotificationsRead([])).toBeNull();
  });
});
