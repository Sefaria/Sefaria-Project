import type { ReactNode } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import type { TranslationCorpus, TranslationLink } from "~/lib/translations/translations-page";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LangText } from "../LangText/LangText";
import { Link } from "../Link/Link";
import { NavPage } from "../NavPage/NavPage";
import styles from "./TranslationsPage.module.css";

export interface TranslationsPageProps {
  /** The page's title in the page's language ("Jüdische Texte in Deutscher Sprache"): shown as it is in either interface. */
  title: string;
  /** BCP-47 code of the title's language (the page's slug) and its direction. */
  titleLang: string;
  titleDir: "ltr" | "rtl";
  /** The texts, by corpus. Undefined while they load or when the server could not list them: the tab is then empty, as the old page. */
  sections?: readonly TranslationCorpus[];
  /** Sub-category blocks start open, except on the English page (a long list), where they start closed. */
  collapsed?: boolean;
  sidebar?: ReactNode;
  footer?: ReactNode;
  /** The old reader panel's analytics batch (`data-anl-batch` on the page). */
  anlBatch?: Readonly<Record<string, string | number>>;
}

const Item = ({ link, plain }: { link: TranslationLink; plain?: boolean }) => (
  <li className={styles.item}>
    <Link href={link.url}>{plain ? <LangText lang="en">{link.title.en}</LangText> : <InterfaceText en={link.title.en} he={link.title.he} />}</Link>
  </li>
);

/**
 * A translation language's page (the old TranslationsPage): its title in that language, a single "Texts" tab, and per corpus of the
 * library a heading, the corpus's own texts, a block per sub-category (opening and closing) and a block of uncategorised texts —
 * each text a link straight into the reader with that translation. The sidebar holds the About module in that language.
 *
 * @feature LIB-020 Translations by language page
 */
export function TranslationsPage({ title, titleLang, titleDir, sections, collapsed, sidebar, footer, anlBatch }: TranslationsPageProps) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <NavPage sidebar={sidebar} footer={footer} top={{ main: 60, side: 60 }} anlBatch={anlBatch}>
      <div className={styles.page} data-ui={he ? "he" : "en"}>
        <h1 className={styles.title}>
          <LangText className={styles.titleText} lang={titleLang} dir={titleDir}>{title}</LangText>
        </h1>
        <div className={styles.tabView}>
          <div className={styles.tabList} role="tablist">
            <div className={styles.tabItem} role="tab" id="tab-texts" tabIndex={0} aria-selected="true" aria-controls="tabpanel-texts" data-tab-index="0">
              <div className={styles.tab}><InterfaceText en="Texts" he="מקורות" /></div>
            </div>
          </div>
          <div role="tabpanel" id="tabpanel-texts" aria-labelledby="tab-texts" data-translations-list={sections ? "ready" : "empty"}>
            {sections?.map((s) => (
              <section key={s.corpus.en} className={styles.corpus} data-corpus={s.corpus.en}>
                <h2 className={styles.corpusTitle}><InterfaceText en={s.corpus.en} he={s.corpus.he} /></h2>
                {s.prioritized ? <ul className={styles.list}>{s.prioritized.map((t) => <Item key={t.title.en} link={t} />)}</ul> : null}
                {s.groups.map((g) => (
                  <details key={g.category.en} className={styles.group} open={!collapsed}>
                    <summary className={styles.summary}><InterfaceText en={g.category.en} he={g.category.he} /></summary>
                    <ul className={styles.list}>{g.items.map((t, i) => <Item key={i + t.title.en} link={t} />)}</ul>
                  </details>
                ))}
                {s.uncategorized.length ? (
                  <details className={styles.group} open={!collapsed}>
                    <summary className={styles.summary}><InterfaceText en="Uncategorized" he="לא מסווג" /></summary>
                    <ul className={styles.list}>{s.uncategorized.map((t, i) => <Item key={i + t.title.en} link={t} plain />)}</ul>
                  </details>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </div>
    </NavPage>
  );
}
