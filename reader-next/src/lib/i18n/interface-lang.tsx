/**
 * Interface language (English / Hebrew UI chrome). Content language (what text is shown in the reader) is
 * separate and lives in reader settings.
 *
 * @feature GUI-012 InterfaceText; I18-008 interface language
 */
import { createContext, useContext, type ReactNode } from "react";

export type InterfaceLang = "english" | "hebrew";

const InterfaceLangContext = createContext<InterfaceLang>("english");

export const useInterfaceLang = (): InterfaceLang => useContext(InterfaceLangContext);

export const isHebrew = (lang: InterfaceLang) => lang === "hebrew";
export const langCode = (lang: InterfaceLang): "en" | "he" => (lang === "hebrew" ? "he" : "en");
export const dirOf = (lang: InterfaceLang): "ltr" | "rtl" => (lang === "hebrew" ? "rtl" : "ltr");

/**
 * Provides the interface language to the subtree and sets `lang`/`dir` on a wrapper so inherited
 * text direction and font selection follow it. The wrapper is `display: contents`, so it adds no box.
 */
export function InterfaceLangProvider({ lang, children }: { lang: InterfaceLang; children: ReactNode }) {
  return (
    <InterfaceLangContext.Provider value={lang}>
      <div lang={langCode(lang)} dir={dirOf(lang)} style={{ display: "contents" }}>
        {children}
      </div>
    </InterfaceLangContext.Provider>
  );
}
