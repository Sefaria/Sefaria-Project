import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useViewer } from "~/features/auth/viewer";
import { toNotificationView } from "~/features/notifications/view";
import { useInAppLinkClicks } from "~/features/notifications/in-app-links";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { LIBRARY } from "~/lib/shell/links";
import { deleteUpdate, postUpdate, updatePayload, updatesQuery, validateUpdate, type UpdateDraft } from "~/lib/updates/updates";
import { categoryColor } from "~/ui/tokens/category-color";
import { NotificationItem } from "~/ui/Notification/Notification";
import { AboutSidebar, UpdateForm, UpdateItem, UpdatesPage } from "~/ui/UpdatesPage/UpdatesPage";

/** The page's head (templates/static/updates.html, the same in both interface languages but for the title's translation). */
export const UPDATES_HEAD = {
  english: { title: "New Additions to the Sefaria Library", description: "See texts, translations and connections that have been recently added to Sefaria." },
  hebrew: { title: "חידושים בארון הספרים של ספריא", description: "See texts, translations and connections that have been recently added to Sefaria." },
} as const;

/**
 * `/updates`: New Additions, so a reader who follows the account menu's "New Additions" stays in this client. The first ten come with
 * the page; more as the reader nears the end. Moderators get the old form to add one and a delete button on each.
 *
 * @feature LIB-022 New Additions to the Library page
 * @feature NTF-004 Global notifications and site updates
 */
export function UpdatesRoute() {
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const viewer = useViewer();
  const moderator = !!viewer?.isStaff;
  const qc = useQueryClient();
  const q = useInfiniteQuery(updatesQuery());
  const books = useQuery(tocQueryOptions()).data?.books;
  const onClick = useInAppLinkClicks();
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  const [added, setAdded] = useState<{ id: string; draft: UpdateDraft; at: number }[]>([]);
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // the old handleScroll: the next page when the end of the list comes within 600px
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    return (q.data?.pages.flat() ?? []).filter((n) => !deleted.has(n._id) && !seen.has(n._id) && seen.add(n._id));
  }, [q.data, deleted]);

  const remove = async (id: string) => {
    if (await deleteUpdate(id)) setDeleted((d) => new Set(d).add(id));
  };
  const submit = async (draft: UpdateDraft) => {
    setSubmitting(true);
    const error = await postUpdate(updatePayload(draft));
    setSubmitting(false);
    if (!error) {
      // the old page put the new one on top of the list with the time now; the list is read again on the next visit
      setAdded((a) => [{ id: `new-${Date.now()}`, draft, at: Date.now() / 1000 }, ...a]);
      void qc.invalidateQueries({ queryKey: updatesQuery().queryKey, refetchType: "none" });
    }
    return error;
  };

  const code = langCode(lang);
  const fresh = added.map(({ id, draft, at }) => ({ _id: id, type: draft.type, date: at, content: updatePayload(draft).content }));
  return (
    <UpdatesPage
      he={he}
      sidebar={<AboutSidebar current="updates" href={(p) => `${LIBRARY}${p}`} />}
      form={moderator ? <UpdateForm validate={validateUpdate} submitting={submitting} onSubmit={submit} /> : undefined}
    >
      <div onClick={onClick}>
        {[...fresh, ...items].map((n) => {
          const view = toNotificationView(n, code, books);
          if (!view) return null;
          return (
            <UpdateItem key={n._id} onDelete={moderator && !n._id.startsWith("new-") ? () => void remove(n._id) : undefined}>
              <NotificationItem n={view} he={he} imageAlt={he ? "תמונת התראה" : "Notification image"} voicesColor={categoryColor("Midrash")} />
            </UpdateItem>
          );
        })}
      </div>
      <div ref={sentinel} aria-hidden="true" data-load-more="" />
    </UpdatesPage>
  );
}
