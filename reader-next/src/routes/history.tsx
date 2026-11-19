import { createFileRoute } from "@tanstack/react-router";
import { requireSignIn, UserHistoryRoute, userHistoryHead } from "~/features/user-history/UserHistoryRoute";

/** /history: the reader's history reading history (reader/views.py user_history_content, @login_required). Library host only. */
export const Route = createFileRoute("/history")({
  beforeLoad: ({ context, location }) => requireSignIn(context.queryClient, location.href),
  head: () => userHistoryHead("history"),
  component: () => <UserHistoryRoute tab="history" />,
});
