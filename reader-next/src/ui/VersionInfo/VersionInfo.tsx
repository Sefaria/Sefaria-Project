import { licenseUrl } from "~/lib/versions/translations";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./VersionInfo.module.css";
import { SITE_ORIGIN } from "~/lib/config";
import { encodeTitle } from "~/lib/ref/url";

export interface VersionInfoData {
  versionTitle: string;
  /** The version's `language` field ("en" for translations): part of the revision-history address. */
  language: string;
  versionSource?: string;
  digitizedBySefaria?: boolean | string;
  license?: string;
  purchaseInformationURL?: string;
  /** A picture of the printed edition, linked to where to buy it. */
  purchaseInformationImage?: string;
}

export interface VersionInfoProps {
  version: VersionInfoData;
  /** The passage the history is for, as in a URL ("Genesis.1.1"). */
  urlRef: string;
  /** Show the picture of the printed edition (the About box does; compact lists do not). */
  showImage?: boolean;
}

/**
 * Is a version's source an address? Some are a book's name ("Biblia Judaica Completa", "La Torá Con Rashi"): the old client wrote them
 * as a relative link that ended at Django's 404; here they are plain text (deliberate difference). An address (http(s)://…,
 * www.…, or a path of the site such as /shraga-silverstein) stays a link.
 */
export const isSourceAddress = (source: string): boolean => /^(?:https?:\/\/[^\s/]+\.[^\s]+|www\.[^\s]+\.[^\s]+|\/[^\s/][^\s]*)$/i.test(source.trim());
const sourceHref = (source: string) => (/^www\./i.test(source.trim()) ? `https://${source.trim()}` : source.trim());

const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * A version's facts: source, digitization, licence, revision history, where to buy, and a picture of the
 * edition. Each row is hidden when the version lacks it; revision history is always there. The old
 * VersionInformation and VersionImage.
 *
 * @feature VER-017 Version information rows
 */
export function VersionInfo({ version: v, urlRef, showImage }: VersionInfoProps) {
  const license = licenseUrl(v.license);
  const buyHref = v.purchaseInformationURL || (v.versionSource && isSourceAddress(v.versionSource) ? sourceHref(v.versionSource) : undefined);
  return (
    <div className={styles.info}>
      <div className={styles.text}>
        <dl className={styles.facts}>
          {v.versionSource ? (
            <div>
              <dt><InterfaceText en="Source" he="מקור" />:</dt>
              <dd>{isSourceAddress(v.versionSource) ? <a href={sourceHref(v.versionSource)} target="_blank" rel="noopener noreferrer">{hostOf(sourceHref(v.versionSource))}</a> : v.versionSource}</dd>
            </div>
          ) : null}
          {v.digitizedBySefaria ? (
            <div>
              <dt><InterfaceText en="Digitization" he="דיגיטציה" />:</dt>
              <dd><a href={`${SITE_ORIGIN}/digitized-by-sefaria`} target="_blank" rel="noopener noreferrer"><InterfaceText en="Sefaria" he="ספריא" /></a></dd>
            </div>
          ) : null}
          {v.license ? (
            <div>
              <dt><InterfaceText en="License" he="רשיון" />:</dt>
              <dd>{license ? <a href={license} target="_blank" rel="noopener noreferrer">{v.license}</a> : v.license}</dd>
            </div>
          ) : null}
        </dl>
        <p className={styles.links}>
          {/* the new reader's page (LEG-019), in a new tab as on sefaria.org */}
          <a href={`/activity/${urlRef}/${v.language}/${encodeTitle(v.versionTitle)}`} target="_blank" rel="noopener noreferrer">
            <InterfaceText en="Revision History" he="היסטורית עריכה" />
          </a>
          {v.purchaseInformationURL ? (
            <a className={styles.buy} href={v.purchaseInformationURL} target="_blank" rel="noopener noreferrer">
              <InterfaceText en="Buy in Print" he="לרכישה בדפוס" />
            </a>
          ) : null}
        </p>
      </div>
      {showImage && v.purchaseInformationImage && buyHref ? (
        <a className={styles.image} href={buyHref} target="_blank" rel="noopener noreferrer">
          <img src={v.purchaseInformationImage} alt="Buy now" loading="lazy" />
        </a>
      ) : null}
    </div>
  );
}
