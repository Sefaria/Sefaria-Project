import type { MouseEvent } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { authorsString, isHebrewText, type Site, type WebPageItem } from "~/lib/connections/webpages";
import { LoadingState } from "../Feedback/Feedback";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import styles from "./WebPagesView.module.css";
import { SITE_ORIGIN } from "~/lib/config";

export interface WebPagesViewProps {
  /** The pages (already sorted) — all of them, or one site's. */
  pages: readonly WebPageItem[];
  /** The sites, when no site is chosen. */
  sites: readonly Site[];
  /** A site chosen: show its pages; otherwise show the sites. */
  site?: string;
  loading?: boolean;
  error?: string;
  /** A site's pages (a real link). */
  siteHref: (name: string) => string;
  onSite?: (name: string, e: MouseEvent) => void;
  /** The passage a page cites, in the interface language. */
  refLabel: (ref: string) => string;
}

/**
 * Sites that cite the selected passage (with how many pages each), and one site's pages: title, address, summary,
 * authors, article source and the passage cited. States as in the old sidebar: "Loading web pages...", "No web
 * pages known [from <site>] here.". VERIFIED on sefaria.org (Berakhot 2a:1).
 *
 * @feature CON-052 Web pages citing this text
 * @feature CON-053 Web page list items
 * @feature CON-054 Linker promo in web pages view
 */
export function WebPagesView({ pages, sites, site, loading, error, siteHref, onSite, refLabel }: WebPagesViewProps) {
  const hebrew = useInterfaceLang() === "hebrew";
  if (loading && !pages.length) return <LoadingState><p className={styles.message}>{hebrew ? "טוען דפי אינטרנט..." : "Loading web pages..."}</p></LoadingState>;
  if (error && !pages.length) return <p className={styles.message}>{hebrew ? "לא ניתן לטעון דפי אינטרנט." : error}</p>;

  const empty = site ? !pages.length : !sites.length;
  if (empty) {
    return (
      <p className={styles.message}>
        {hebrew ? `אין דפי אינטרנט ידועים${site ? ` מ${site}` : ""}.` : `No web pages known${site ? ` from ${site}` : ""} here.`}
      </p>
    );
  }

  return (
    <div className={styles.view}>
      {site ? (
        <ul className={styles.pages}>
          {pages.map((p, i) => (
            <li key={`${p.url}-${i}`} className={styles.page} data-hebrew={isHebrewText(p.title) ? "true" : undefined}>
              <img className={styles.icon} src={p.favicon} alt={hebrew ? "סמל אתר" : "Website icon"} width={16} height={16} loading="lazy" />
              <a className={styles.title} href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a>
              <div className={styles.domain}>{p.domain}</div>
              {p.description ? <div className={styles.description}>{p.description}</div> : null}
              <div className={styles.meta}>
                {p.authors?.length ? (
                  <div>
                    <InterfaceText en={p.authors.length > 1 ? "Authors" : "Author"} he={p.authors.length > 1 ? "מחברים" : "מחבר"} />: {authorsString(p.authors, isHebrewText(p.title))}
                  </div>
                ) : null}
                {p.articleSource ? (
                  <div>
                    <InterfaceText en="Source" he="מקור" />: {p.articleSource.title}
                    {p.articleSource.related_parts ? ` ${p.articleSource.related_parts}` : ""}
                  </div>
                ) : null}
                <div>
                  <InterfaceText en="Citing" he="מצטט" />: {refLabel(p.anchorRef)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.sites}>
          {sites.map((s) => (
            <li key={s.name}>
              <Link href={siteHref(s.name)} className={styles.site} onClick={(e) => { if (onSite && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); onSite(s.name, e); } }}>
                <img className={styles.icon} src={s.favicon} alt="" width={16} height={16} loading="lazy" />
                <span>{s.name} <span className={styles.count}>({s.count})</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.linker}>
        <InterfaceText en="Sites that are listed here use the" he="אתרים המפורטים כאן משתמשים" />{" "}
        <a href={`${SITE_ORIGIN}/linker`} target="_blank" rel="noopener noreferrer"><InterfaceText en="Sefaria Linker" he="במרשתת ההפניות" /></a>
      </p>
    </div>
  );
}
