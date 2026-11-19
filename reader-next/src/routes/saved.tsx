import { createFileRoute } from "@tanstack/react-router";
import { requireSignIn, UserHistoryRoute, userHistoryHead } from "~/features/user-history/UserHistoryRoute";

/** /saved: the reader's saved items (reader/views.py saved_content, @login_required). Library host only. */
export const Route = createFileRoute("/saved")({
  beforeLoad: ({ context, location }) => requireSignIn(context.queryClient, location.href),
  head: () => userHistoryHead("saved"),
  component: () => <UserHistoryRoute tab="saved" />,
});
