import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { bookTitleOf, sameTitle } from "~/lib/book/book-page";
import { indexDetailsQueryOptions } from "~/lib/catalog/index-details";
import { isSplatOf, refToUrl, urlToRef } from "~/lib/ref/url";
import { bookVersionsQueryOptions } from "~/lib/versions/book-versions";

export interface BookRouteData {
  /** The index title: "Genesis". */
  title: string;
  /** For the page's title and description (PLT-006). */
  heTitle?: string;
  enDesc?: string;
  heDesc?: string;
}

/**
 * Is this URL a book's own page (`/Genesis`, `/Rashi_on_Genesis`) rather than a text? The old server's `is_book_level` rule:
 * a ref with no section. Loads what the page shows (details, versions) so it renders from the cache on the server and
 * client alike; redirects to the canonical title when spelled otherwise (`/genesis`, `/Gen`).
 *
 * @feature BOK-001 Book page (text table of contents)
 * @feature BOK-023 Book index details data
 */
export async function loadBookRoute(queryClient: QueryClient, splat: string, search: string): Promise<BookRouteData | null> {
  const title = bookTitleOf(urlToRef(splat));
  if (!title) return null;
  let details;
  try {
    details = await queryClient.fetchQuery(indexDetailsQueryOptions(title));
  } catch {
    return null; // not a book: let the reader try (a category, a bad title → its 404)
  }
  if (!details?.title) return null;
  // "Pesach Haggadah, Kadesh" is a node of a book, which the index lookup resolves to the book: that is a text, not the page
  if (!sameTitle(details.title, title) && title.toLowerCase().startsWith(`${details.title.toLowerCase()},`)) return null;
  if (!sameTitle(details.title, title) || !isSplatOf(splat, refToUrl(details.title))) {
    throw redirect({ to: `/${refToUrl(details.title)}` as never, search: Object.fromEntries(new URLSearchParams(search)) as never, statusCode: 301 });
  }
  await queryClient.prefetchQuery(bookVersionsQueryOptions(details.title));
  const d = details as { heTitle?: string; enDesc?: string; heDesc?: string };
  return { title: details.title, heTitle: d.heTitle, enDesc: d.enDesc, heDesc: d.heDesc };
}

/**
 * The book page's description by language. The Hebrew interface falls back to the short Hebrew description when the index has no long
 * one (Berakhot: `heDesc` null, `heShortDesc` set), as legacy's AboutBox (`heDesc || heShortDesc`); BookPage reads `heShort`. Built as a value, not a literal, so it also fits a BookPage that does not declare `heShort` yet.
 */
export function bookDescription(d: { enDesc?: string | null; heDesc?: string | null; heShortDesc?: string | null }): { en?: string | null; he?: string | null; heShort?: string | null } {
  return { en: d.enDesc, he: d.heDesc, heShort: d.heShortDesc };
}
