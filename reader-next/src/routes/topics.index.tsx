import { createFileRoute } from "@tanstack/react-router";
import { loadTopicsLanding, TopicsLandingRoute } from "~/features/topics/TopicsLandingRoute";

/** /topics: the Library's topics landing page (the Voices host's /topics stays Django's: src/lib/routing/django-paths.ts). */
export const Route = createFileRoute("/topics/")({
  loader: async ({ context }) => {
    const lang = context.interfaceLang === "hebrew" ? ("he" as const) : ("en" as const);
    await loadTopicsLanding(context.queryClient, lang, context.diaspora);
    return { lang };
  },
  // reader/views.py topics_page: get_page_title("Topics") and its description
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.lang === "he" ? "נושאים | האוסף של ספריא" : "Topics | The Sefaria Library" },
      { name: "description", content: "Explore Jewish Texts by Topic on Sefaria" },
    ],
  }),
  component: TopicsLandingRoute,
});
