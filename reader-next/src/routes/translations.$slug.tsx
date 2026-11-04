import { createFileRoute, notFound } from "@tanstack/react-router";
import { TranslationsRoute } from "~/features/library/TranslationsRoute";
import { ErrorState } from "~/ui/Feedback/Feedback";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { TRANSLATION_LANGUAGES, isTranslationSlug, translationsPageQueryOptions } from "~/lib/translations/translations-page";

/**
 * /translations/<lang>: texts available in one translation language. Only the languages Django accepts have a page; any other slug
 * is a 404 (passed to Django in the cluster, whose own 404 page answers, as before). The title and description are the old page's,
 * in that language.
 *
 * @feature RTE-011 Translations page URLs
 * @feature LIB-021 Translations page backend and SEO
 */
export const Route = createFileRoute("/translations/$slug")({
  loader: async ({ context, params }) => {
    if (!isTranslationSlug(params.slug)) throw notFound();
    // the list in the server's page when the API answers; when it fails the tab stays empty (and the client asks once more)
    await context.queryClient.ensureQueryData(translationsPageQueryOptions(params.slug)).catch(() => undefined);
  },
  head: ({ params }) => {
    const language = TRANSLATION_LANGUAGES[params.slug];
    if (!language) return {};
    return {
      meta: [
        { title: language.title },
        { name: "description", content: language.desc },
        { property: "og:title", content: language.title },
        { property: "og:description", content: language.desc },
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
