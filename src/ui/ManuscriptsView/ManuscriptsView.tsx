import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import type { ManuscriptPage } from "~/lib/connections/media";
import { licenseUrl } from "~/lib/versions/translations";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./ManuscriptsView.module.css";

export interface ManuscriptsViewProps {
  pages: readonly ManuscriptPage[];
}

const hostOf = (url: string | undefined): string => {
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * Manuscript pages that contain the selected passage: a thumbnail (linking to the full image), the manuscript's
 * name, where in it, who supplied it, its licence and source. VERIFIED on sefaria.org (Genesis 1:1: the
 * Leningrad Codex, folio 1v). The old ManuscriptImage.
 *
 * @feature CON-060 Manuscripts for this ref
 */
export function ManuscriptsView({ pages }: ManuscriptsViewProps) {
  const hebrew = useInterfaceLang() === "hebrew";
  if (!pages.length) {
    return (
      <p className={styles.empty}>
        <InterfaceText en="No manuscripts known here." he="אין כתבי יד ידועים כאן." />
      </p>
    );
  }
  return (
    <ul className={styles.list}>
      {pages.map((p) => {
        const m = p.manuscript;
        const courtesy = hebrew ? m.he_description : m.description;
        const license = licenseUrl(m.license);
        return (
          <li key={`${p.manuscript_slug}-${p.page_id}`} className={styles.item}>
            <a href={p.image_url} target="_blank" rel="noopener noreferrer">
              <img className={styles.image} src={p.thumbnail_url} alt={hebrew ? "כתב יד עתיק" : "Ancient Manuscript"} loading="lazy" />
            </a>
            <p className={styles.caption} lang={hebrew ? "he" : "en"} dir={hebrew ? "rtl" : "ltr"}>{hebrew ? m.he_title || m.title : m.title}</p>
            <div className={styles.meta}>
              <InterfaceText en="Location: " he="מיקום: " />
              <span>{p.page_id.replace(/_/g, " ")}</span>
              <br />
              {courtesy ? (
                <>
                  <InterfaceText en="Courtesy of: " he="הודות ל" />
                  <span>{courtesy}</span>
                  <br />
                </>
              ) : null}
              {m.license ? (
                <div>
                  <InterfaceText en="License" he="רשיון" />:{" "}
                  {license ? <a href={license} target="_blank" rel="noopener noreferrer">{m.license}</a> : m.license}
                </div>
              ) : null}
              <InterfaceText en="Source: " he="מקור: " />
              <a href={m.source} target="_blank" rel="noopener noreferrer">{hostOf(m.source)}</a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
