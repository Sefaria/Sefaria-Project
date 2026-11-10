// @feature NTF-002 @feature NTF-004
import { describe, expect, it } from "vitest";
import type { NotificationRecord } from "~/lib/notifications/notifications";
import type { TocBook } from "~/lib/catalog/toc";
import { toNotificationView } from "./view";

const now = 2_000_000_000;
const books = new Map<string, TocBook>([["Ben Yehuda Dictionary", { title: "Ben Yehuda Dictionary", heTitle: "מילון בן־יהודה", categories: ["Reference"] }]]);
const rec = (type: string, content: NotificationRecord["content"]): NotificationRecord => ({ _id: "x", type, date: now - 21 * 86400, content });

describe("a notification as the list shows it", () => {
  it("a new text: the book's link and Hebrew title, its description sanitised", () => {
    const v = toNotificationView(rec("index", { index: "Ben Yehuda Dictionary", en: 'Dictionary <script>x</script><a href="/Genesis.1">link</a>', he: "מילון" }), "en", books, now);
    expect(v).toMatchObject({ type: "index", href: "/Ben_Yehuda_Dictionary", title: { en: "Ben Yehuda Dictionary", he: "מילון בן־יהודה" }, date: "3 weeks ago" });
    expect(v?.type === "index" && v.text?.en).toBe('Dictionary <a href="/Genesis.1">link</a>');
  });
  it("a new version and a general announcement; the date in Hebrew", () => {
    expect(toNotificationView(rec("version", { index: "Genesis", version: "V", language: "he" }), "he", books, now)).toMatchObject({ type: "version", language: "he", version: "V", date: "לפני 3 שבועות" });
    expect(toNotificationView(rec("general", { en: "<b>Hi</b>", he: "שלום" }), "en", books, now)).toMatchObject({ type: "general", text: { en: "<b>Hi</b>", he: "שלום" } });
    expect(toNotificationView(rec("general", {}), "en", books, now)).toBeNull();
  });
  it("the Voices kinds link to the sheet, profile and collection; an unknown kind is not shown", () => {
    expect(toNotificationView(rec("sheet publish", { name: "Ada", profileUrl: "/profile/ada", sheet_id: 5, sheet_title: "T", summary: "" }), "en", books, now)).toMatchObject({ sheetHref: "/sheets/5", profileUrl: "/profile/ada", summary: undefined });
    expect(toNotificationView(rec("collection add", { name: "Ada", profileUrl: "/profile/ada", collection_slug: "c", collection_name: "C" }), "en", books, now)).toMatchObject({ collectionHref: "/collections/c" });
    expect(toNotificationView(rec("discuss", {}), "en", books, now)).toBeNull();
  });
});
