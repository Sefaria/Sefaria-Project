import { createFileRoute, notFound } from "@tanstack/react-router";
import { TranslationsRoute } from "~/features/library/TranslationsRoute";
import { ErrorState } from "~/ui/Feedback/Feedback";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { prefetchTranslationsPage, translationLanguage } from "~/lib/translations/translations-page";

/** Is this load a navigation inside the app (the loader runs in the browser), not the server's page? */
const inApp = () => typeof window !== "undefined";

/**
 * /translations/<lang>: texts available in one translation language. The languages Django accepts have a page however they are
 * reached; ISOMap's others (ro, tr — the sidebar links to them —, lad, jrb) only inside the app, as the old client: from the server
 * they are a 404 (passed to Django in the cluster, whose own 404 page answers, as before). The title and description are the old
 * page's, in that language.
 *
 * @feature RTE-011 Translations page URLs
 * @feature LIB-021 Translations page backend and SEO
 * @feature LIB-037 Sidebar module: Translations languages list
 */
export const Route = createFileRoute("/translations/$slug")({
  loader: async ({ context, params }) => {
    if (!translationLanguage(params.slug, inApp())) throw notFound();
    // the list in the server's page when the API answers quickly; otherwise the page does not wait for it (LIB-021)
    await prefetchTranslationsPage(context.queryClient, params.slug);
  },
  head: ({ params }) => {
    const language = translationLanguage(params.slug, inApp());
    if (!language) return {};
    return {
      meta: [
        { title: language.title },
        ...(language.desc
          ? [
              { name: "description", content: language.desc },
              { property: "og:title", content: language.title },
              { property: "og:description", content: language.desc },
            ]
          : []),
      ],
    };
  },
  // local development only: in the cluster the 404 goes to Django, whose own "Page Not Found" answers
  notFoundComponent: () => (
    <ErrorState title={<InterfaceText en="Page Not Found" he="הדף לא נמצא" />}>
      <InterfaceText en="There is no translations page for that language." he="אין דף תרגומים לשפה זו." />
    </ErrorState>
  ),
  component: function Translations() {
    return <TranslationsRoute slug={Route.useParams().slug} />;
  },
});
