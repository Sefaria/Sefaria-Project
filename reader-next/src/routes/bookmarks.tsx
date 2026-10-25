import { createFileRoute } from "@tanstack/react-router";
import { BookmarksPage } from "~/features/bookmarks/BookmarksPage";

/** /bookmarks: the reader's per-book bookmarks, kept in this browser. */
export const Route = createFileRoute("/bookmarks")({
  head: () => ({ meta: [{ title: "Bookmarks | Sefaria Reader" }] }),
  component: BookmarksPage,
});
