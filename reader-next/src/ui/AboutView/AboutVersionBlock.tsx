import type { MouseEvent } from "react";
import { sanitizeHtml } from "~/lib/html/sanitize";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import type { VersionMeta } from "~/lib/text/model";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { VersionInfo } from "../VersionInfo/VersionInfo";
import styles from "./AboutVersionBlock.module.css";
import { SITE_ORIGIN } from "~/lib/config";

export interface AboutVersionBlockProps {
  version: VersionMeta & { purchaseInformationURL?: string; purchaseInformationImage?: string };
  /** The passage the version's history is for ("Genesis.1.1"). */
  urlRef: string;
  /** Previewing it in the sidebar (a real link on the title). */
  openHref?: string;
  onOpen?: (e: MouseEvent) => void;
  /** A "Select Version" button, for versions other than the current one. */
  select?: { href: string; onSelect?: (e: MouseEvent) => void };
  /** Notes by interface language, relative links resolved against this origin. */
  origin?: string;
}

const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/**
 * One version in the About box: its title, notes (HTML from the library, sanitised), its facts and a picture of
 * the edition. The old VersionBlock in "about-box" mode. VER-016
 *
 * @feature VER-016 Version block display
 */
export function AboutVersionBlock({ version: v, urlRef, openHref, onOpen, select, origin = SITE_ORIGIN }: AboutVersionBlockProps) {
  const hebrew = useInterfaceLang() === "hebrew";
  const title = hebrew && v.versionTitleInHebrew ? v.versionTitleInHebrew : v.versionTitle;
  const notes = hebrew ? v.versionNotesInHebrew : v.versionNotes;
  return (
    <article className={styles.block}>
      <h3 className={styles.title}>
        {openHref ? (
          <Link href={openHref} onClick={(e) => { if (onOpen && plain(e)) { e.preventDefault(); onOpen(e); } }}>{title}</Link>
        ) : (
          title
        )}
      </h3>
      {select ? (
        <Link href={select.href} className={styles.select} aria-label={`Select ${title}`} onClick={(e) => { if (select.onSelect && plain(e)) { e.preventDefault(); select.onSelect(e); } }}>
          <InterfaceText en="Select Version" he="בחירת מהדורה" />
        </Link>
      ) : null}
      {notes ? <div className={styles.notes} dangerouslySetInnerHTML={{ __html: sanitizeHtml(notes, { baseUrl: origin }) }} /> : null}
      <VersionInfo version={v} urlRef={urlRef} showImage />
    </article>
  );
}
