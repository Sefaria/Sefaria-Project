import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Bookmark } from "~/lib/bookmarks";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { encodeHebrewDaf, encodeHebrewNumeral } from "~/lib/ref/hebrew-numerals";
import { bookColor } from "~/ui/tokens/category-color";

export interface BookmarkLabels {
  /** The book's name in the interface language (English when the catalog has no Hebrew title or is not loaded yet). */
  title: string;
  titleLang: "en" | "he";
  /** Where in the book: "12:4", "5a:2" (or in Hebrew numerals), without the book's name. */
  place: string;
  /** The book's category colour, as the library pages use it. */
  color: string;
  /** "2 days ago", in the interface language. */
  lastRead: string;
}

/** "12:4" → "י״ב:ד׳", "5a:2" → "ה. ב׳": the address part of a ref in Hebrew numerals. */
export function hebrewPlace(place: string): string {
  const parts = place.split(":");
  return parts
    .map((p, i) => {
      if (/^\d+[ab]$/.test(p)) return encodeHebrewDaf(p) + (i < parts.length - 1 ? " " : "");
      if (/^\d+$/.test(p) && Number(p) > 0) return encodeHebrewNumeral(Number(p)) + (i < parts.length - 1 ? ":" : "");
      return p + (i < parts.length - 1 ? ":" : "");
    })
    .join("");
}

export function placeOf(b: Pick<Bookmark, "book" | "ref">): string {
  return b.ref.startsWith(`${b.book} `) ? b.ref.slice(b.book.length + 1) : b.ref;
}

const DAY = 86_400_000;
export function relativeDay(updated: number, now: number, lang: "en" | "he"): string {
  const fmt = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  // Hebrew dual forms come out as "לפני שבועיים (2)"
  const rtf = { format: (n: number, unit: Intl.RelativeTimeFormatUnit) => fmt.format(n, unit).replace(/\s*\(\d+\)$/, "") };
  const days = Math.max(0, Math.floor((now - updated) / DAY));
  if (days < 7) return rtf.format(-days, "day");
  if (days < 30) return rtf.format(-Math.floor(days / 7), "week");
  if (days < 365) return rtf.format(-Math.floor(days / 30), "month");
  return rtf.format(-Math.floor(days / 365), "year");
}

/** Display labels for bookmarks: the book's name and place in the interface language, its colour, and when it was last read. */
export function useBookmarkLabels(): (b: Bookmark) => BookmarkLabels {
  const catalog = useQuery(tocQueryOptions()).data;
  const he = useInterfaceLang() === "hebrew";
  return useCallback(
    (b: Bookmark) => {
      const book = catalog?.books.get(b.book);
      const heTitle = he ? book?.heTitle : undefined;
      const place = placeOf(b);
      return {
        title: heTitle || b.book,
        titleLang: heTitle ? "he" : "en",
        place: heTitle && place !== b.ref ? hebrewPlace(place) : place,
        color: bookColor(book),
        lastRead: relativeDay(b.updated, Date.now(), he ? "he" : "en"),
      };
    },
    [catalog, he],
  );
}
