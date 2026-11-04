import { useQuery } from "@tanstack/react-query";
import { ABOUT_TRANSLATED_TEXT, TRANSLATION_LANGUAGES, translationsPageQueryOptions } from "~/lib/translations/translations-page";
import { AboutTranslatedText } from "~/ui/NavSidebar/AboutTranslatedText";
import { PromoSlot, SidebarFooter } from "~/ui/NavSidebar/NavSidebar";
import { TranslationsPage } from "~/ui/TranslationsPage/TranslationsPage";
import { LinkProvider } from "~/ui/Link/Link";
import { VerbatimRouterLink } from "../shared/RouterLink";

/**
 * `/translations/<lang>`: a translation language's page. The list comes from the query the loader filled (or, on the client, loads
 * after the page is up, as the old page loaded it); an API failure leaves the tab empty, as the old page did.
 *
 * @feature LIB-020 Translations by language page
 * @feature LIB-029 Sidebar module: About translated text
 */
export function TranslationsRoute({ slug }: { slug: string }) {
  const model = useQuery(translationsPageQueryOptions(slug)).data;
  const language = TRANSLATION_LANGUAGES[slug]!;
  // the texts' addresses are the server's, written as sefaria.org writes them (`ven=german%7CDie+f%C3%BCnf…`), and open in the app
  return (
    <LinkProvider value={VerbatimRouterLink}>
      <TranslationsPage
        key={slug}
        title={language.title}
        titleLang={slug}
        titleDir={language.dir}
        sections={model?.slug === slug ? model.sections : undefined}
        collapsed={slug === "en"}
        sidebar={
          <>
            <AboutTranslatedText about={ABOUT_TRANSLATED_TEXT[slug]} lang={slug} dir={language.dir} />
            {/* the old sidebar-ad slot (pageType "translations"): empty unless the CMS has a promotion (LIB-026) */}
            <PromoSlot />
          </>
        }
        footer={<SidebarFooter />}
      />
    </LinkProvider>
  );
}
