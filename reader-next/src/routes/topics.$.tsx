import { createFileRoute } from "@tanstack/react-router";
import { TopicPageRoute } from "~/features/topics/TopicPageRoute";
import { topicPageRoute } from "~/features/topics/topic-page-route";

/** /topics/<slug>: a single topic (reader/views.py topic_page). A topic that is not the Library's is a 404, which the server hands to Django. */
export const Route = createFileRoute("/topics/$")({
  ...topicPageRoute(""),
  component: function TopicPage() {
    const { slug, transLangPref } = Route.useLoaderData();
    return <TopicPageRoute slug={slug} prefix="" search={Route.useSearch()} {...(transLangPref ? { transLangPref } : {})} />;
  },
});
