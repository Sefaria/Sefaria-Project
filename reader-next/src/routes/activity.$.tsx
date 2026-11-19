import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { DjangoHandoff } from "~/features/topics/DjangoHandoff";
import { RevisionHistoryRoute } from "~/features/activity/RevisionHistoryRoute";
import { isActivityFilterType, isSignedOut, parseSegmentHistoryPath, segmentHistoryQueryOptions } from "~/lib/activity/segment-history";

interface ActivitySearch {
  type?: string;
}

/**
 * /activity/<ref>/<lang>/<version>[/<page>]: a text's revision history (reader/views.py segment_history). Only this form is the
 * client's (src/lib/routing/django-paths.ts); the rest of /activity is Django's. A ref or version Django does not know is a 404,
 * passed on to Django as its Http404 was — and so is every history page while the API (this branch's Django) is not deployed.
 *
 * @feature LEG-019 Text edit activity feed (/activity): a text's revision history
 */
export const Route = createFileRoute("/activity/$")({
  notFoundComponent: DjangoHandoff,
  validateSearch: (s: Record<string, unknown>): ActivitySearch => (typeof s.type === "string" && isActivityFilterType(s.type) ? { type: s.type } : {}),
  loaderDeps: ({ search }) => ({ type: search.type }),
  loader: async ({ context, params, deps, location }) => {
    const address = parseSegmentHistoryPath(params._splat ?? "");
    if (!address) throw notFound();
    const history = await context.queryClient.ensureQueryData(segmentHistoryQueryOptions(address, deps.type));
    // signed out (the API's 401): to the login page and back here, as Django's login_required page did
    if (isSignedOut(history)) {
      context.queryClient.removeQueries({ queryKey: segmentHistoryQueryOptions(address, deps.type).queryKey });
      throw redirect({ href: `/login?next=${encodeURIComponent(location.href)}`, statusCode: 302 });
    }
    if (!history) throw notFound();
    return { address, ref: history.ref, version: history.version, lang: context.interfaceLang === "hebrew" ? "he" : "en" };
  },
  // activity.html: "Revision History of <ref> (<version>)", its description, and noindex
  head: ({ loaderData }) => ({
    meta: [
      ...(loaderData
        ? [
            // VERIFIED on sefaria.org and sefaria.org.il 2026-11-05: the ref in English in both, no site suffix
            { title: `${loaderData.lang === "he" ? "היסטורית עריכה של" : "Revision History of"} ${loaderData.ref} (${loaderData.version})` },
            { name: "description", content: loaderData.lang === "he" ? "צפו בהיסטורית העריכה של הטקסט הזה בספריא" : "View the complete revision hisotry of this text on Sefaria." },
          ]
        : []),
      { name: "robots", content: "noindex" },
    ],
  }),
  component: function Activity() {
    const { address } = Route.useLoaderData();
    const { type } = Route.useSearch();
    return <RevisionHistoryRoute address={address} type={type} />;
  },
});
