import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useViewer } from "~/features/auth/viewer";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { markNotificationsRead, notificationsQuery, uniqueNotifications, unreadIds } from "~/lib/notifications/notifications";
import { isValidEmailAddress, subscribeNewsletter } from "~/lib/user/newsletter";
import { uaEvent } from "~/lib/analytics";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { PromoSlot, SidebarFooter, StayConnected } from "~/ui/NavSidebar/NavSidebar";
import { NewsletterSignUp, type NewsletterSubscription } from "~/ui/NewsletterSignUp/NewsletterSignUp";
import { NotificationItem } from "~/ui/Notification/Notification";
import { NotificationsPage } from "~/ui/NotificationsPage/NotificationsPage";
import { categoryColor } from "~/ui/tokens/category-color";
import { useInAppLinkClicks } from "./in-app-links";
import { toNotificationView } from "./view";

/** The page's head (reader/views.py notifications: get_page_title("Notifications", module=library)). */
export const NOTIFICATIONS_HEAD = { title: "Notifications | Sefaria Library" };
/** The tab title the old app set once it had loaded (ReaderApp: getPageTitle("common.notifications")). */
const CLIENT_TITLE = { english: "Notifications | Sefaria Library", hebrew: "התראות | ספריית ספריא" } as const;

/**
 * `/notifications`: the reader's Library notifications — new texts and versions and the site's announcements — newest first, more as
 * the reader nears the end. Everything the page has loaded is marked read, as the old page did on load and after each page.
 *
 * @feature NTF-001 Notifications page
 * @feature NTF-003 Mark notifications read
 */
export function NotificationsRoute() {
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const viewer = useViewer();
  const q = useInfiniteQuery(notificationsQuery(viewer?.id ?? null));
  const books = useQuery(tocQueryOptions()).data?.books;
  const onClick = useInAppLinkClicks();
  const sentinel = useRef<HTMLDivElement>(null);
  const sent = useRef(new Set<string>());
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;

  useEffect(() => {
    document.title = CLIENT_TITLE[he ? "hebrew" : "english"];
  }, [he]);

  // the old handleScroll: the next page when the end of the list comes within 600px
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const list = useMemo(() => (q.data ? uniqueNotifications(q.data.pages) : undefined), [q.data]);

  // the old markAsRead: everything loaded that is unread, once
  useEffect(() => {
    if (!list) return;
    const ids = unreadIds(list, sent.current);
    if (!ids.length) return;
    ids.forEach((id) => sent.current.add(id));
    void markNotificationsRead(ids);
  }, [list]);

  const subscribe = useCallback((s: NewsletterSubscription) => subscribeNewsletter({ ...s, interfaceLang: lang }), [lang]);
  const code = langCode(lang);
  const items = list
    ?.map((n) => {
      const view = toNotificationView(n, code, books);
      return view ? <NotificationItem key={n._id} n={view} he={he} imageAlt={he ? "תמונת התראה" : "Notification image"} voicesColor={categoryColor("Midrash")} /> : null;
    })
    .filter((x) => x !== null);

  return (
    <NotificationsPage
      he={he}
      onListClick={onClick}
      loading={<LoadingState />}
      footer={<SidebarFooter />}
      sentinel={<div ref={sentinel} aria-hidden="true" data-load-more="" />}
      sidebar={
        <>
          <StayConnected
            newsletter={
              <NewsletterSignUp
                subscribe={subscribe}
                isValidEmail={isValidEmailAddress}
                // the old sidebar passed `context="sidebar"` where the form reads `contextName`: its event says "Subscribe from undefined"
                onSubscribed={() => uaEvent("Newsletter", "Subscribe from undefined", "")}
              />
            }
          />
          <PromoSlot />
        </>
      }
    >
      {q.isError ? [] : items}
    </NotificationsPage>
  );
}
