/**
 * Content language: which side of bilingual library data (titles, refs, descriptions, texts) a region of the page shows. Separate
 * from the interface language: an English interface can show a Hebrew sidebar (`lang2=he`), and the library pages' aleph toggle
 * turns their content Hebrew. The old client's ContentLanguageContext / useContentLang; ContentText reads it.
 *
 * Bilingual reader text is not one language, so the reader column does not provide one: its segments carry each version's own
 * language. Where nothing provides a content language, ContentText follows the interface language.
 *
 * @feature I18-010 Interface and content language resolution
 */
import { createContext, useContext, type ReactNode } from "react";
import type { InterfaceLang } from "./interface-lang";

export type ContentLang = InterfaceLang;

const ContentLangContext = createContext<ContentLang | null>(null);

/** The content language provided above, or null when none is. */
export const useContentLang = (): ContentLang | null => useContext(ContentLangContext);

/** Sets the content language for the subtree. Adds no element: the ContentText runs it governs carry their own `lang` and `dir`. */
export function ContentLangProvider({ lang, children }: { lang: ContentLang; children: ReactNode }) {
  return <ContentLangContext.Provider value={lang}>{children}</ContentLangContext.Provider>;
}
