import { DjangoHandoff } from "~/features/topics/DjangoHandoff";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { AllTopicsRoute, loadAllTopics } from "~/features/topics/AllTopicsRoute";

/** /topics/all/<letter>: All Topics A–Z. One character only (sefaria/urls_shared.py `topics/all/(?P<letter>.)`); more is Django's 404. */
export const Route = createFileRoute("/topics/all/$letter")({
  notFoundComponent: DjangoHandoff,
  loader: async ({ context, params }) => {
    if ([...params.letter].length !== 1) throw notFound();
    const lang = context.interfaceLang === "hebrew" ? ("he" as const) : ("en" as const);
    await loadAllTopics(context.queryClient, params.letter, lang);
    return { lang, letter: params.letter };
  },
  // the old ReaderApp's title for the page ("Explore Jewish Texts by Topic - <letter>") with get_page_title's suffix
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.lang === "he" ? `עיון בארון הספרים היהודי לפי נושא - ${loaderData.letter} | האוסף של ספריא` : `Explore Jewish Texts by Topic - ${loaderData?.letter ?? ""} | The Sefaria Library` },
      { name: "description", content: "Explore Jewish texts related to traditional and contemporary topics, coming from Torah, Talmud, and more." },
    ],
  }),
  component: function AllTopics() {
    const { letter } = Route.useParams();
    return <AllTopicsRoute letter={letter} />;
  },
});
