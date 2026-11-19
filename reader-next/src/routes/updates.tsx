import { createFileRoute } from "@tanstack/react-router";
import { UPDATES_HEAD, UpdatesRoute } from "~/features/updates/UpdatesRoute";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { updatesQuery } from "~/lib/updates/updates";

/**
 * /updates: New Additions (sites/sefaria/urls.py static page "updates" with the old UpdatesPanel). Public. Library host only (the
 * Voices host keeps Django's, django-paths.ts LIBRARY_ONLY_PREFIXES).
 *
 * @feature LIB-022 New Additions to the Library page
 */
export const Route = createFileRoute("/updates")({
  loader: async ({ context }) => {
    const qc = context.queryClient;
    // the first ten with the page (the old one showed "Loading..." until its script asked); book titles for the Hebrew interface
    await Promise.all([qc.ensureInfiniteQueryData(updatesQuery()).catch(() => undefined), qc.ensureQueryData(tocQueryOptions()).catch(() => undefined)]);
    return { lang: context.interfaceLang === "hebrew" ? ("hebrew" as const) : ("english" as const) };
  },
  head: ({ loaderData }) => {
    const h = UPDATES_HEAD[loaderData?.lang ?? "english"];
    return { meta: [{ title: h.title }, { name: "description", content: h.description }] };
  },
  component: UpdatesRoute,
});
