import { readerAnalytics } from "~/lib/analytics/reader";
import { useId, useState } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { languageName } from "~/lib/versions/translations";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { PanelSectionHeading } from "../ConnectionsPanel/FilterRow";
import styles from "./DownloadVersions.module.css";
import { SITE_ORIGIN } from "~/lib/config";

export interface DownloadableVersion {
  versionTitle: string;
  versionTitleInHebrew?: string;
  /** "he" / "en": the family the merged version is offered for. */
  language: string;
  actualLanguage: string;
  license?: string;
}

export interface DownloadVersionsProps {
  /** The book (index) title. */
  title: string;
  versions: readonly DownloadableVersion[];
  /** Where downloads are served from. */
  origin?: string;
}

const FORMATS = [
  { value: "txt", en: "Text (with Tags)", he: "טקסט (עם תיוגים)" },
  { value: "plain.txt", en: "Text (without Tags)", he: "טקסט (ללא תיוגים)" },
  { value: "csv", en: "CSV", he: "CSV" },
  { value: "json", en: "JSON", he: "JSON" },
];

/** Old isVersionPublicDomain: anything whose licence starts with "Copyright" is not offered. */
export const isDownloadable = (v: Pick<DownloadableVersion, "license">): boolean => !(v.license && v.license.startsWith("Copyright"));

/**
 * Download a whole version of the book: pick a version (or a merged version per language) and a format; the
 * button is a link to the file and stays disabled until both are chosen. Copyrighted versions are not offered.
 *
 * @feature VER-008 Download versions from About
 * @feature LIB-060 Sidebar module: Download text versions
 */
export function DownloadVersions({ title, versions, origin = SITE_ORIGIN }: DownloadVersionsProps) {
  const lang = useInterfaceLang();
  const hebrew = lang === "hebrew";
  const id = useId();
  const [versionKey, setVersionKey] = useState("");
  const [format, setFormat] = useState("");

  const offered = versions.filter(isDownloadable).sort((a, b) => a.versionTitle.localeCompare(b.versionTitle));
  const options = [
    ...offered.map((v) => ({ key: `v:${v.versionTitle}\u0000${v.language}`, title: v.versionTitle, language: v.language, label: `${hebrew && v.versionTitleInHebrew ? v.versionTitleInHebrew : v.versionTitle} (${languageName(v.actualLanguage, lang)})` })),
    ...[...new Set(offered.map((v) => v.language))].map((l) => ({ key: `m:${l}`, title: "merged", language: l, label: `${hebrew ? "גרסה משולבת" : "Merged Version"} (${languageName(l, lang)})` })),
  ];
  const chosen = options.find((o) => o.key === versionKey);
  const ready = !!chosen && !!format;
  const href = ready ? `${origin}/download/version/${title} - ${chosen.language} - ${chosen.title}.${format}` : undefined;

  return (
    <section aria-label="Download Text" className={styles.module}>
      <PanelSectionHeading variant="title">
        <InterfaceText en="Download Text" he="הורדת טקסט" />
      </PanelSectionHeading>
      <div className={styles.form}>
        <select aria-label={hebrew ? "בחירת מהדורה/תרגום" : "Select Version"} id={`${id}-v`} value={versionKey} onChange={(e) => setVersionKey(e.target.value)}>
          <option value="">{hebrew ? "בחירת מהדורה/תרגום" : "Select Version"}</option>
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <select aria-label={hebrew ? "בחירת פורמט הורדה" : "Select Format"} id={`${id}-f`} value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="">{hebrew ? "בחירת פורמט הורדה" : "Select Format"}</option>
          {FORMATS.map((f) => <option key={f.value} value={f.value}>{hebrew ? f.he : f.en}</option>)}
        </select>
        {href ? (
          <a className={styles.button} href={href} download onClick={() => chosen && readerAnalytics.versionDownloaded(`${title} / ${chosen.title} / ${chosen.language} / ${format}`)}>
            <InterfaceText en="Download" he="הורדה" />
          </a>
        ) : (
          <span className={styles.button} role="link" aria-disabled="true">
            <InterfaceText en="Download" he="הורדה" />
          </span>
        )}
      </div>
    </section>
  );
}
