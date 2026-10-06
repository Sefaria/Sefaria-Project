import { licenseUrl } from "~/lib/versions/translations";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./VersionInfo.module.css";
import { SITE_ORIGIN } from "~/lib/config";

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
  const buyHref = v.purchaseInformationURL || v.versionSource;
  return (
    <div className={styles.info}>
      <div className={styles.text}>
        <dl className={styles.facts}>
          {v.versionSource ? (
            <div>
              <dt><InterfaceText en="Source" he="מקור" />:</dt>
              <dd><a href={v.versionSource} target="_blank" rel="noopener noreferrer">{hostOf(v.versionSource)}</a></dd>
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
          <a href={`${SITE_ORIGIN}/activity/${urlRef}/${v.language}/${v.versionTitle.replace(/\s/g, "_")}`} target="_blank" rel="noopener noreferrer">
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
