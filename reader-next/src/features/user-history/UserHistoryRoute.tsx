import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useViewer, viewerQuery } from "~/features/auth/viewer";
import { withNext } from "~/lib/auth/utils";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { sanitizeHtml } from "~/lib/html/sanitize";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { deleteNote } from "~/lib/user/notes";
import {
  TAB_HREF,
  allNotesQuery,
  dedupeItems,
  naturalTimeShort,
  noteHref,
  passageHref,
  readingHistoryQuery,
  userHistoryQuery,
  type NoteEntry,
  type UserHistoryEntry,
  type UserHistoryTab,
} from "~/lib/user/user-history-page";
import { PromoSlot, SidebarFooter, SupportSefaria } from "~/ui/NavSidebar/NavSidebar";
import { GetTheApp } from "~/ui/NavSidebar/TopicModules";
import { bookColor } from "~/ui/tokens/category-color";
import { NoteListing, NotesList, SheetItem, TextPassageItem, UserHistoryList, UserHistoryPage } from "~/ui/UserHistoryPage/UserHistoryPage";
import { SaveTextButton } from "~/ui/ReaderControls/ReaderControls";
import { useSaved, type PanelPlace } from "~/features/reader/use-reader-history";
import type { LegacyVersions } from "~/lib/user/history";

/** The pages' heads (reader/views.py saved_content, user_history_content, notes: get_page_title(<title>, module=library) and desc). */
export const USER_HISTORY_HEAD: Record<UserHistoryTab, { title: string; description: string }> = {
  saved: { title: "My Saved Content | Sefaria Library", description: "See your saved content on Sefaria" },
  history: { title: "My User History | Sefaria Library", description: "See your user history on Sefaria" },
  notes: { title: "My Notes | Sefaria Library", description: "See your notes on Sefaria" },
};

export const userHistoryHead = (tab: UserHistoryTab) => ({
  meta: [{ title: USER_HISTORY_HEAD[tab].title }, { name: "description", content: USER_HISTORY_HEAD[tab].description }],
});

/**
 * The pages are `@login_required` on sefaria.org: signed out, the reader goes to sign in and comes back (`/login?next=<path>`).
 *
 * @feature RTE-031 Saved, history and notifications URLs
 * @feature RTE-015 Torah tracker and notes URLs
 */
export async function requireSignIn(queryClient: QueryClient, path: string): Promise<void> {
  const viewer = await queryClient.ensureQueryData(viewerQuery).catch(() => null);
  if (!viewer) throw redirect({ href: withNext("/login", path), statusCode: 302 });
}

const SIDEBAR = (
  <>
    <PromoSlot />
    <GetTheApp />
    <SupportSefaria />
  </>
);

/**
 * `/saved`, `/history` and `/texts/notes`: the reader's saved items, reading history and notes (the old UserHistoryPanel), so an
 * opted-in reader who follows the header's bookmark, the account menu or the Notes tool's "Go to My Notes" stays in this client.
 *
 * @feature USL-008 Saved items and reading history pages
 * @feature USL-003 My Notes page
 * @feature USL-004 Note listing with delete and sheet-aware links
 * @feature USL-005 Private notes list
 */
export function UserHistoryRoute({ tab }: { tab: UserHistoryTab }) {
  const lang = useInterfaceLang();
  return (
    <UserHistoryPage tab={tab} hrefs={TAB_HREF} sidebar={SIDEBAR} footer={<SidebarFooter />}>
      {tab === "notes" ? <NotesTab /> : <ItemsTab key={tab} tab={tab} lang={langCode(lang)} />}
    </UserHistoryPage>
  );
}

function ItemsTab({ tab, lang }: { tab: "saved" | "history"; lang: "en" | "he" }) {
  const viewer = useViewer();
  const uid = viewer?.id ?? null;
  const enabled = useQuery({ ...readingHistoryQuery(viewer?.profileUrl), enabled: tab === "history" && !!viewer }).data;
  const q = useInfiniteQuery({ ...userHistoryQuery(uid, tab), enabled: uid !== null && !(tab === "history" && enabled === false) });
  const books = useQuery(tocQueryOptions()).data?.books;
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;

  // the old useScrollToLoad: the next page when the end of the list comes near
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: "500px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = useMemo(() => {
    if (!q.data) return undefined;
    const raw = q.data.pages.flat();
    const list = tab === "saved" ? raw : dedupeItems(raw);
    return list.map((item, i) => renderItem(item, `${item.ref}|${item.time_stamp}|${i}`, tab, lang, books));
  }, [q.data, tab, lang, books]);

  return (
    <UserHistoryList
      tab={tab}
      disabled={tab === "history" && enabled === false}
      settingsHref="/settings/account"
      items={items?.filter((x) => x !== null)}
      sentinel={<div ref={sentinel} aria-hidden="true" data-load-more="" />}
    />
  );
}

/** An item's versions as the old currVersions (a version given only as a string has no family: it is not a choice). */
function itemVersions(item: UserHistoryEntry): LegacyVersions {
  const one = (v: NonNullable<UserHistoryEntry["versions"]>["en"]) =>
    v && typeof v === "object" && v.versionTitle ? { versionTitle: v.versionTitle, languageFamilyName: v.languageFamilyName ?? "" } : null;
  return { en: one(item.versions?.en), he: one(item.versions?.he) };
}

/**
 * Each item's bookmark (the old SaveLine's SaveButton): filled while the item is saved; a click removes or saves it again. The item
 * stays on the list until the page is reloaded, as on sefaria.org.
 *
 * @feature USL-008 @feature USL-011
 */
export function ItemSave({ item, label }: { item: UserHistoryEntry; label: string }) {
  const viewer = useViewer();
  const place: PanelPlace = { ref: item.ref, versions: item.is_sheet ? { en: null, he: null } : itemVersions(item), book: item.book ?? "", language: "bilingual" };
  const save = useSaved(viewer, place, () => undefined);
  return <SaveTextButton saved={save.isSaved} label={save.isSaved ? `Remove "${label}"` : `Save "${label}"`} onClick={save.click} />;
}

function renderItem(item: UserHistoryEntry, key: string, tab: "saved" | "history", lang: "en" | "he", books: ReadonlyMap<string, { primary_category?: string; categories: string[] }> | undefined) {
  const timeStamp = tab === "history" && item.time_stamp ? naturalTimeShort(item.time_stamp, lang) : undefined;
  if (item.is_sheet) {
    const title = item.title ?? item.ref;
    return <SheetItem key={key} href={`/sheets/${item.sheet_id}`} title={title} ownerName={item.ownerName} ownerHref={item.ownerProfileUrl} timeStamp={timeStamp} save={<ItemSave item={item} label={title.replace(/<[^>]*>/g, "")} />} />;
  }
  if (!item.text) return null;
  return (
    <TextPassageItem
      key={key}
      href={passageHref(item)}
      citation={{ en: item.ref, he: item.he_ref }}
      text={{ en: item.text.en ? sanitizeHtml(item.text.en) : undefined, he: item.text.he ? sanitizeHtml(item.text.he) : undefined }}
      color={bookColor(item.book ? books?.get(item.book) : undefined)}
      timeStamp={timeStamp}
      save={<ItemSave item={item} label={lang === "he" && item.he_ref ? item.he_ref : item.ref} />}
    />
  );
}

function NotesTab() {
  const viewer = useViewer();
  const uid = viewer?.id ?? null;
  const he = useInterfaceLang() === "hebrew";
  const qc = useQueryClient();
  const notes = useQuery(allNotesQuery(uid)).data;
  const remove = async (n: NoteEntry) => {
    // the old NoteListing's confirm (common.are_you_sure_you_want_to_delete_this)
    if (!window.confirm(he ? "האם אתם בטוחים שברצונכם למחוק?" : "Are you sure you want to delete this note?")) return;
    await deleteNote(n._id);
    qc.setQueryData<NoteEntry[]>(allNotesQuery(uid).queryKey, (old) => old?.filter((x) => x._id !== n._id));
    // the sidebar's notes on that verse are stale now
    void qc.invalidateQueries({ queryKey: ["user", "notes"] });
  };
  return <NotesList notes={notes?.map((n) => <NoteListing key={n._id} citation={n.ref} href={noteHref(n.ref)} text={n.text} onDelete={() => void remove(n)} />)} />;
}
