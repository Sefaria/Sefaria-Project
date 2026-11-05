import { createFileRoute } from "@tanstack/react-router";
import { TopicPageRoute } from "~/features/topics/TopicPageRoute";
import { topicPageRoute } from "~/features/topics/topic-page-route";

/** /topics/b/<slug>: the topic page's "b" test version (reader/views.py topic_page_b): the same page, its address kept under /topics/b/. */
export const Route = createFileRoute("/topics/b/$")({
  ...topicPageRoute("b/"),
  component: function TopicPageB() {
    const { slug, transLangPref } = Route.useLoaderData();
    return <TopicPageRoute slug={slug} prefix="b/" search={Route.useSearch()} {...(transLangPref ? { transLangPref } : {})} />;
  },
});
