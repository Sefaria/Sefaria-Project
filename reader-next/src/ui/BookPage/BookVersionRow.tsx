import { sanitizeHtml } from "~/lib/html/sanitize";
import { dirFor } from "~/lib/i18n/direction";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { encodeTitle } from "~/lib/ref/url";
import { languageName, licenseUrl } from "~/lib/versions/translations";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { isSourceAddress } from "../VersionInfo/VersionInfo";
import { versionLanguage, type BookVersion } from "./version-order";
import styles from "./BookVersionRow.module.css";

export interface BookVersionRowProps {
  version: BookVersion;
  /** Reading the book in this version: the title is the link. */
  href: string;
  /** The book as in a URL ("Sifrei_Bamidbar"): its revision history is per book. */
  bookUrl: string;
  /** Where the site's own pages live ("" = this origin), for the digitization page and notes' relative links. */
  origin?: string;
  /** Moderators: the pencil beside the title, which opens the version editor. */
  onEdit?: () => void;
}

/** The old licence names in the Hebrew interface (its `licenses.*` strings); the others read the same in both. */
const LICENSE_HE: Record<string, string> = { "Public Domain": "בנחלת הכלל", "Copyright: JPS, 1985": "זכויות שמורות ל-JPS, 1985" };

const sourceHref = (s: string) => (/^www\./i.test(s.trim()) ? `https://${s.trim()}` : s.trim());
const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * One version on the book page's Versions tab (the old VersionBlock, rendermode "book-page"): the title is the link to read it
 * (no separate Select button there), the moderators' pencil, the language as a grey pill at the far side, the notes in the
 * interface language, then source, digitization, licence, revision history, buy-in-print and the edition's picture.
 *
 * @feature BOK-007 Versions list tab
 * @feature VER-016 Version block display
 */
export function BookVersionRow({ version: v, href, bookUrl, origin = "", onEdit }: BookVersionRowProps) {
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const title = he && v.versionTitleInHebrew ? v.versionTitleInHebrew : v.versionTitle;
  const titleLang = /[֐-׿]/.test(title) ? "he" : "en";
  const notes = he ? v.versionNotesInHebrew : v.versionNotes;
  const license = licenseUrl(v.license);
  const licenseName = v.license && he ? (LICENSE_HE[v.license] ?? v.license) : v.license;
  const imageHref = v.purchaseInformationURL || (v.versionSource && isSourceAddress(v.versionSource) ? sourceHref(v.versionSource) : undefined);
  return (
    <div className={styles.row} data-version-row="">
      <div className={styles.heading} data-version-row-heading="">
        <h2 className={styles.title} data-version-row-title="">
          <Link href={href} lang={titleLang} dir={dirFor(titleLang)}>{title}</Link>
        </h2>
        {onEdit ? (
          <button type="button" className={styles.edit} aria-label={`Edit ${title}`} onClick={onEdit}>
            <Icon name="pencil" size="14px" />
          </button>
        ) : null}
        <span className={styles.badge} data-version-row-badge="">{languageName(versionLanguage(v), lang)}</span>
      </div>
      {notes ? <div className={styles.notes} data-version-row-notes="" dangerouslySetInnerHTML={{ __html: sanitizeHtml(notes, { baseUrl: origin || undefined }) }} /> : null}
      <div className={styles.details} data-version-row-details="">
        <div className={styles.facts}>
          {v.versionSource ? (
            <div>
              <span data-version-row-label=""><InterfaceText en="Source" he="מקור" />: </span>
              {isSourceAddress(v.versionSource) ? <a href={sourceHref(v.versionSource)} target="_blank" rel="noopener noreferrer">{hostOf(sourceHref(v.versionSource))}</a> : v.versionSource}
            </div>
          ) : null}
          {v.digitizedBySefaria ? (
            <div>
              <span data-version-row-label=""><InterfaceText en="Digitization" he="דיגיטציה" />: </span>
              <a href={`${origin}/digitized-by-sefaria`} target="_blank" rel="noopener noreferrer"><InterfaceText en="Sefaria" he="ספריא" /></a>
            </div>
          ) : null}
          {v.license ? (
            <div>
              <span data-version-row-label=""><InterfaceText en="License" he="רשיון" />: </span>
              {license ? <a href={license} target="_blank" rel="noopener noreferrer">{licenseName}</a> : licenseName}
            </div>
          ) : null}
          <div>
            <a href={`/activity/${bookUrl}/${v.language}/${encodeTitle(v.versionTitle)}`} target="_blank" rel="noopener noreferrer">
              <InterfaceText en="Revision History" he="היסטורית עריכה" />
            </a>
          </div>
          {v.purchaseInformationURL ? (
            <div>
              <a className={styles.buy} href={v.purchaseInformationURL} target="_blank" rel="noopener noreferrer">
                <InterfaceText en="Buy in Print" he="לרכישה בדפוס" />
              </a>
            </div>
          ) : null}
        </div>
        {v.purchaseInformationImage && imageHref ? (
          <a className={styles.image} href={imageHref} target="_blank" rel="noopener noreferrer">
            <img src={v.purchaseInformationImage} alt={he ? "רכישה" : "Buy Now"} loading="lazy" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
