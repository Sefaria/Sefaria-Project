import { createFileRoute } from "@tanstack/react-router";
import { TORAH_TRACKER_HEAD, TorahTrackerRoute } from "~/features/torahtracker/TorahTrackerRoute";
import { requireSignIn } from "~/features/user-history/UserHistoryRoute";

/**
 * /torahtracker: the reader's Torah Tracker (reader/views.py user_stats, @login_required; urls_library.py). Library host only.
 *
 * @feature PRO-010 Torah Tracker user stats
 * @feature RTE-015 Torah tracker and notes URLs
 */
export const Route = createFileRoute("/torahtracker")({
  beforeLoad: ({ context, location }) => requireSignIn(context.queryClient, location.href),
  head: () => ({ meta: [{ title: TORAH_TRACKER_HEAD.title }] }),
  component: TorahTrackerRoute,
});
