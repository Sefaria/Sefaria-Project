import type { MouseEvent } from "react";
import { previewHtml, type TranslationVersion } from "~/lib/versions/translations";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { LoadingState } from "../Feedback/Feedback";
import { SegmentText } from "../SegmentText/SegmentText";
import styles from "./TranslationOpenView.module.css";

export interface TranslationOpenViewProps {
  /** The translation being previewed; undefined while loading, or when it has no text for this passage. */
  version?: TranslationVersion;
  /** The language the text is written in ("en", "de"). */
  lang: string;
  loading?: boolean;
  /** The reader with the passage in this translation (a real link). */
  openHref: string;
  onOpen?: (e: MouseEvent) => void;
}

/**
 * One translation, previewed in the sidebar: its name, the selected passage in only that translation, and an
 * Open link that shows the passage in the main panel in that translation. ("Add to Sheet", next to Open on the
 * old site, needs sign-in and arrives with the signed-in tools.)
 *
 * @feature VER-013 Translation Open sub-mode
 */
export function TranslationOpenView({ version, lang, loading, openHref, onOpen }: TranslationOpenViewProps) {
  if (loading) return <LoadingState />;
  if (!version) {
    return (
      <p className={styles.missing}>
        <InterfaceText en="This translation has no text for the selected passage." he="לתרגום זה אין טקסט עבור הקטע שנבחר." />
      </p>
    );
  }
  const dir = version.direction ?? "ltr";
  return (
    <div className={styles.view}>
      <h3 className={styles.name}>{version.versionTitle}</h3>
      <div className={styles.text} lang={lang} dir={dir}>
        <SegmentText html={previewHtml(version.text)} lang={lang} dir={dir} />
      </div>
      <div className={styles.actions}>
        <Link
          href={openHref}
          className={styles.open}
          onClick={(e) => {
            if (onOpen && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              onOpen(e);
            }
          }}
        >
          <Icon name="external-link" size="1em" />
          <InterfaceText en="Open" he="פתח" />
        </Link>
      </div>
    </div>
  );
}
