import { createFileRoute } from "@tanstack/react-router";
import { CalendarsRoute } from "~/features/calendars/CalendarsRoute";
import { textualCustomQuery } from "~/features/calendars/textual-custom";
import { viewerQuery } from "~/features/auth/viewer";
import { SITE_ORIGIN } from "~/lib/config";
import { calendarsQueryOptions } from "~/lib/library/calendars";

/** /calendars (and /calendars/, a page of its own on sefaria.org): Learning Schedules. */
export const Route = createFileRoute("/calendars")({
  loader: async ({ context, location }) => {
    const qc = context.queryClient;
    const viewer = await qc.ensureQueryData(viewerQuery).catch(() => null);
    const custom = await qc.ensureQueryData(textualCustomQuery(viewer?.profileUrl));
    await qc.ensureQueryData(calendarsQueryOptions(context.diaspora, custom));
    // the canonical is the address as asked: sefaria.org's /calendars/ says ".../calendars/"
    return { path: location.pathname };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: "Learning Schedules | Sefaria Library" }, { name: "description", content: "Weekly Torah portions, Daf Yomi, and other schedules for Torah learning." }],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}${loaderData?.path ?? "/calendars"}` }],
  }),
  component: CalendarsRoute,
});
