import { DjangoHandoff } from "~/features/topics/DjangoHandoff";
import { createFileRoute } from "@tanstack/react-router";
import { loadTopicCategory, TopicCategoryRoute } from "~/features/topics/TopicCategoryRoute";

/** /topics/category/<slug>: a topic category; any other slug goes on to /topics/<slug> (loadTopicCategory). */
export const Route = createFileRoute("/topics/category/$slug")({
  notFoundComponent: DjangoHandoff,
  loader: async ({ context, params }) => {
    const lang = context.interfaceLang === "hebrew" ? ("he" as const) : ("en" as const);
    return { lang, ...(await loadTopicCategory(context.queryClient, params.slug, lang)) };
  },
  // reader/views.py topics_category_page: get_page_title(<title>, page_type=TOPIC) and its description
  head: ({ loaderData }) => {
    const he = loaderData?.lang === "he";
    const t = loaderData ? (he ? loaderData.title.he : loaderData.title.en) : "";
    return {
      meta: [
        { title: he ? `${t} | מקורות מתוך ספריית ספריא` : `${t} | Texts from the Sefaria Library` },
        { name: "description", content: `Jewish texts and source sheets about ${loaderData?.title.en ?? ""} from Torah, Talmud and other sources in Sefaria's library.` },
      ],
    };
  },
  component: function TopicCategory() {
    const { slug } = Route.useParams();
    return <TopicCategoryRoute slug={slug} />;
  },
});
