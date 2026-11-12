import { createFileRoute } from "@tanstack/react-router";
import { NOTIFICATIONS_HEAD, NotificationsRoute } from "~/features/notifications/NotificationsRoute";
import { requireSignIn } from "~/features/user-history/UserHistoryRoute";

/**
 * /notifications: the reader's notifications (reader/views.py notifications, @login_required). Library host only: the Voices host
 * keeps Django's page, its notifications being the Voices ones (django-paths.ts LIBRARY_ONLY_PREFIXES).
 *
 * @feature NTF-001 Notifications page
 * @feature RTE-031 Saved, history and notifications URLs
 */
export const Route = createFileRoute("/notifications")({
  beforeLoad: ({ context, location }) => requireSignIn(context.queryClient, location.href),
  head: () => ({ meta: [{ title: NOTIFICATIONS_HEAD.title }] }),
  component: NotificationsRoute,
});
