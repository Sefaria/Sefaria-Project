import { readerAnalytics } from "~/lib/analytics/reader";
import { useState, type ReactNode } from "react";
import { InterfaceLangProvider, useInterfaceLang } from "~/lib/i18n/interface-lang";
import styles from "./ContentLanguage.module.css";

/**
 * The aleph / ayin button at the corner of the library's pages (home, category, book): it turns that page's content to Hebrew — titles,
 * numerals, order, direction — while the rest of the site stays as it is. (VERIFIED on sefaria.org 2026-10-05: /Berakhot becomes
 * right-to-left with Hebrew titles and "ב. ב: ג." numerals; the address does not change.) Not offered in the Hebrew interface.
 *
 * @feature LIB-002 Library home header and edit buttons
 */
export function ContentLanguage({ children }: { children: ReactNode }) {
  const iface = useInterfaceLang();
  const [hebrew, setHebrew] = useState(false);
  if (iface === "hebrew") return <>{children}</>;
  return (
    <InterfaceLangProvider lang={hebrew ? "hebrew" : "english"}>
      <div className={styles.wrap}>
        <button type="button" className={styles.toggle} aria-pressed={hebrew} aria-label={hebrew ? "English Language Toggle Icon" : "Hebrew Language Toggle Icon"} onClick={() => {
          readerAnalytics.languageToggled(hebrew ? "english" : "hebrew");
          setHebrew((h) => !h);
        }}>
          <img src={hebrew ? "/img/aye.svg" : "/img/aleph.svg"} alt="" width={18} height={18} />
        </button>
        {children}
      </div>
    </InterfaceLangProvider>
  );
}
