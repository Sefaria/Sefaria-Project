import { createFileRoute } from "@tanstack/react-router";
import { requireSignIn, UserHistoryRoute, userHistoryHead } from "~/features/user-history/UserHistoryRoute";

/** /texts/notes: the reader's notes (reader/views.py notes, @login_required); matched before the /texts/$ category pages. */
export const Route = createFileRoute("/texts/notes")({
  beforeLoad: ({ context, location }) => requireSignIn(context.queryClient, location.href),
  head: () => userHistoryHead("notes"),
  component: () => <UserHistoryRoute tab="notes" />,
});
