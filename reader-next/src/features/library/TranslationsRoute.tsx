import { useQuery } from "@tanstack/react-query";
import { ABOUT_TRANSLATED_TEXT, translationLanguage, translationsPageQueryOptions } from "~/lib/translations/translations-page";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
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
 * @feature LIB-037 Sidebar module: Translations languages list
 */
export function TranslationsRoute({ slug }: { slug: string }) {
  const model = useQuery(translationsPageQueryOptions(slug)).data;
  // the route let this slug in: one of Django's languages, or (navigating in the app) one of ISOMap's others
  const language = translationLanguage(slug, true)!;
  // the old ReaderPanel's data-anl-batch for a menu page: panel 1; content_lang "hebrew" in the Hebrew interface, else "english"
  // (its bilingual default read as English; a reader who chose Hebrew-only text got "hebrew" there — not carried here)
  const contentLang = useInterfaceLang() === "hebrew" ? "hebrew" : "english";
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
        anlBatch={{ panel_number: 1, content_lang: contentLang }}
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
