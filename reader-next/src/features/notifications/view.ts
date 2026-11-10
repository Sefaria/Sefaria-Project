import type { TocBook } from "~/lib/catalog/toc";
import { sanitizeHtml } from "~/lib/html/sanitize";
import { timeAgo } from "~/lib/notifications/natural-time";
import { bookHref, type NotificationRecord } from "~/lib/notifications/notifications";
import { PUBLIC_CONFIG } from "~/lib/config";
import type { BilingualHtml, NotificationView } from "~/ui/Notification/Notification";

const html = (t: { en?: string; he?: string }): BilingualHtml | undefined => {
  const en = t.en ? sanitizeHtml(t.en) : undefined;
  const he = t.he ? sanitizeHtml(t.he) : undefined;
  return en || he ? { en, he } : undefined;
};

/**
 * A Voices page (a sheet, a profile, a collection): the Voices site's own address (PUBLIC_CONFIG.voicesOrigin), as the old page sent
 * it there (data-target-module="voices"); an address that is already absolute is kept. An accepted exit.
 */
export const voicesHref = (path: string, origin: string = PUBLIC_CONFIG.voicesOrigin): string =>
  /^https?:\/\//i.test(path) ? path : `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

/**
 * The API's record as the list shows it, or null for a kind the old page did not show. A book's Hebrew title comes from the catalog
 * (the old Sefaria.index(title).heTitle); the date is "<time> ago" in the interface language.
 *
 * @feature NTF-002 Notification types and rendering
 */
export function toNotificationView(n: NotificationRecord, lang: "en" | "he", books: ReadonlyMap<string, TocBook> | undefined, now?: number, voicesOrigin?: string): NotificationView | null {
  const voices = (path: string) => voicesHref(path, voicesOrigin);
  const base = { id: n._id, date: timeAgo(n.date, lang, now) };
  const c = n.content ?? {};
  const person = { name: c.name ?? "", profileUrl: voices(c.profileUrl ?? "/"), imageUrl: c.imageUrl };
  switch (n.type) {
    case "index":
    case "version": {
      const title = c.index ?? "";
      const t = { en: title, he: books?.get(title)?.heTitle };
      if (n.type === "index") return { ...base, type: "index", href: bookHref(title), title: t, text: html(c) };
      return { ...base, type: "version", href: bookHref(title), title: t, language: c.language === "he" ? "he" : "en", version: c.version ?? "", text: html(c) };
    }
    case "general": {
      const text = html(c);
      return text ? { ...base, type: "general", text } : null;
    }
    case "sheet publish":
      return { ...base, ...person, type: "sheet publish", sheetHref: voices(`/sheets/${c.sheet_id}`), sheetTitle: c.sheet_title ?? "", summary: c.summary || undefined };
    case "sheet like":
      return { ...base, ...person, type: "sheet like", sheetHref: voices(`/sheets/${c.sheet_id}`), sheetTitle: c.sheet_title ?? "" };
    case "follow":
      return { ...base, ...person, type: "follow" };
    case "collection add":
      return { ...base, ...person, type: "collection add", collectionHref: voices(`/collections/${c.collection_slug}`), collectionName: c.collection_name ?? "" };
    default:
      return null;
  }
}
