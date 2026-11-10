import { dirFor } from "~/lib/i18n/direction";
import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { previewHtml, type TranslationVersion } from "~/lib/versions/translations";
import { VersionInfo } from "../VersionInfo/VersionInfo";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { SegmentText } from "../SegmentText/SegmentText";
import { PanelSectionHeading } from "../ConnectionsPanel/FilterRow";
import styles from "./TranslationsView.module.css";

const HELP = {
  en: "https://help.sefaria.org/hc/en-us/articles/18613593620636-How-to-Choose-a-Preferred-Translation",
  he: "https://help.sefaria.org/hc/he/articles/18613593620636-%D7%91%D7%97%D7%99%D7%A8%D7%AA-%D7%AA%D7%A8%D7%92%D7%95%D7%9D-%D7%9E%D7%95%D7%A2%D7%93%D7%A3",
};

export interface TranslationLanguage {
  code: string;
  /** Display name in the interface language ("English", "German"). */
  name: string;
  versions: TranslationVersion[];
}

export interface TranslationsViewProps {
  /** Languages in display order, each with its versions in display order (current first). */
  languages: TranslationLanguage[];
  /** Title of the translation the reader shows now. */
  currentTitle?: string;
  /** The reader with this translation selected (a real link). */
  selectHref: (v: TranslationVersion) => string;
  onSelect?: (v: TranslationVersion, e: MouseEvent) => void;
  /** Open the passage in this translation (old "Open Text"). */
  openHref: (v: TranslationVersion) => string;
  onOpen?: (v: TranslationVersion, e: MouseEvent) => void;
  /** The sidebar previewing this translation (a real link on each preview). */
  previewHref?: (v: TranslationVersion) => string;
  onPreview?: (v: TranslationVersion, e: MouseEvent) => void;
  /** The passage, for the revision-history link ("Genesis.1.1"). */
  urlRef: string;
  loading?: boolean;
}

const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/**
 * Every translation of the selected passage, by language, each with a preview of the passage, a Select link
 * (or "Currently Selected") and a disclosure with its source, licence and an Open Text link. Old TranslationsBox
 * + VersionsBlocksList + VersionBlockWithPreview. Strings are the old site's (static/js/sefaria/i18n/interface).
 *
 * @feature VER-009 Translations sidebar list
 * @feature VER-010 Translation preview with truncation
 * @feature VER-011 Translation details disclosure and Open Text
 */
export function TranslationsView({ languages, currentTitle, selectHref, onSelect, openHref, onOpen, previewHref, onPreview, urlRef, loading }: TranslationsViewProps) {
  const hebrew = useInterfaceLang() === "hebrew";
  return (
    <div className={styles.view}>
      <h3 className={styles.heading}>
        <InterfaceText en="Translations" he="תרגומים" />
      </h3>
      <p className={styles.intro}>
        <InterfaceText
          en="Sefaria acquires translations to enrich your learning experience. Preview or choose a different translation below."
          he="ספריא עושה מאמצים להוסיף תרגומים שונים לספרים כדי להעשיר את חווית הלמידה שלכם. כאן ניתן להחליף לתרגום אחר או לראות תצוגה מקדימה שלו לצד הטקסט הנוכחי."
        />{" "}
        <a href={hebrew ? HELP.he : HELP.en} target="_blank" rel="noopener noreferrer">
          <InterfaceText en="Learn more ›" he="למידע נוסף ›" />
        </a>
      </p>
      {loading ? <p className={styles.intro}><InterfaceText en="Loading…" he="טוען…" /></p> : null}
      {languages.map((l) => (
        <section key={l.code} aria-label={l.name} className={styles.language}>
          <PanelSectionHeading variant="language">
            {l.name} <span className={styles.count}>({l.versions.length})</span>
          </PanelSectionHeading>
          {l.versions.map((v) => {
            const current = v.versionTitle === currentTitle;
            const title = (hebrew && (v.shortVersionTitleInHebrew || v.versionTitleInHebrew)) || v.shortVersionTitle || v.versionTitle;
            const html = previewHtml(v.text);
            return (
              <article key={v.versionTitle} className={styles.version} data-current={current ? "true" : undefined}>
                {html ? (
                  <TruncatedPreview
                    dir={v.direction ?? dirFor(l.code)}
                    preview={(cut) => (
                      <div className={styles.preview} lang={l.code} dir={v.direction ?? dirFor(l.code)} data-dir-from={v.direction ? "version" : undefined} data-cut={cut || undefined}>
                        <SegmentText html={html} lang={l.code} dir={v.direction ?? "ltr"} />
                      </div>
                    )}
                  >
                    {/* The whole preview opens it in the sidebar. An overlay link, not a wrapping one: the preview
                        can contain citations and footnotes, and a link inside a link is invalid. */}
                    {previewHref ? (
                      <Link
                        href={previewHref(v)}
                        className={styles.previewHit}
                        aria-label={`Preview ${title}`}
                        onClick={(e) => {
                          if (onPreview && plainClick(e)) {
                            e.preventDefault();
                            onPreview(v, e);
                          }
                        }}
                      />
                    ) : null}
                  </TruncatedPreview>
                ) : null}
                {/* Select sits beside the disclosure, not inside its summary: a link inside the toggle would be a
                    control nested in a control (the old markup did that). */}
                <div className={styles.row}>
                <details className={styles.details}>
                  <summary className={styles.summary}>
                    <span className={styles.title}>{title}</span>
                  </summary>
                  <div className={styles.meta}>
                    <div className={styles.fullTitle}>{hebrew && v.versionTitleInHebrew ? v.versionTitleInHebrew : v.versionTitle}</div>
                    <VersionInfo version={v} urlRef={urlRef} />
                    <Link
                      href={openHref(v)}
                      className={styles.open}
                      onClick={(e) => {
                        if (onOpen && plainClick(e)) {
                          e.preventDefault();
                          onOpen(v, e);
                        }
                      }}
                    >
                      <InterfaceText en="Open Text" he="פתיחת טקסט" />
                    </Link>
                  </div>
                </details>
                {current ? (
                  <span className={styles.selected}><InterfaceText en="Currently Selected" he="נוכחי" /></span>
                ) : (
                  <Link
                    href={selectHref(v)}
                    className={styles.select}
                    aria-label={`Select ${title}`}
                    onClick={(e) => {
                      if (onSelect && plainClick(e)) {
                        e.preventDefault();
                        onSelect(v, e);
                      }
                    }}
                  >
                    <InterfaceText en="Select" he="בחירה" />
                  </Link>
                )}
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/**
 * A preview cut after five lines (old VersionBlockHeaderText): when it is longer, a "…" under it shows the rest (the address does not
 * change). VERIFIED on sefaria.org 2026-11-10 (Genesis 1:1-5, Translations): max-height 110px (5 × 22px); 44 of 47 previews cut; the
 * "…" an 18px black inline run on the next line; a click shows the whole preview (253px) and removes the "…".
 *
 * @feature VER-010
 */
function TruncatedPreview({ dir, preview, children }: { dir: string; preview: (cut: boolean) => ReactNode; children?: ReactNode }) {
  const more = useInterfaceLang() === "hebrew" ? "הצגת הקטע כולו" : "Show the whole passage";
  const box = useRef<HTMLDivElement>(null);
  const [whole, setWhole] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = box.current?.firstElementChild as HTMLElement | null;
    if (!el || whole) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [whole]);
  return (
    <div className={styles.previewWrap} dir={dir}>
      <div ref={box} className={styles.previewBox}>
        {preview(!whole)}
        {children}
      </div>
      {overflows && !whole ? (
        <button type="button" className={styles.ellipsis} onClick={() => setWhole(true)} aria-label={more} title={more}>
          …
        </button>
      ) : null}
    </div>
  );
}
