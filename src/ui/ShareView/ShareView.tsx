import { useRef, useState } from "react";
import { shareHrefs } from "~/lib/feedback/share";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { FilterRow, PanelSectionHeading } from "../ConnectionsPanel/FilterRow";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./ShareView.module.css";

export interface ShareViewProps {
  /** The address being shared: the current view, sidebar and all. */
  url: string;
}

/**
 * Share: the link in a box with a copy button, then Facebook, X and email. Replaces ShareBox (whose sheet-collaboration
 * branch is dead code and not carried over).
 *
 * @feature CON-061 Share link and social options
 */
export function ShareView({ url }: ShareViewProps) {
  const hebrew = useInterfaceLang() === "hebrew";
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const links = shareHrefs(url);
  const copy = async () => {
    input.current?.select();
    input.current?.setSelectionRange(0, 99999); // phones
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      document.execCommand?.("copy");
    }
    setCopied(true);
  };
  return (
    <div className={styles.view}>
      <section aria-label="Share Link">
        <PanelSectionHeading><InterfaceText en="Share Link" he="שיתוף קישור" /></PanelSectionHeading>
        <div className={styles.box}>
          <button type="button" className={styles.copy} aria-label={hebrew ? "העתקת הקישור" : "Copy link"} onClick={() => void copy()}>
            <Icon name="copy" />
          </button>
          <input ref={input} readOnly value={url} aria-label={hebrew ? "קישור לשיתוף" : "Shareable link"} onFocus={(e) => e.currentTarget.select()} />
        </div>
        <span className={styles.copied} role="status">{copied ? <InterfaceText en="Link copied" he="הקישור הועתק" /> : null}</span>
      </section>
      <section aria-label="More Options">
        <PanelSectionHeading><InterfaceText en="More Options" he="אפשרויות נוספות" /></PanelSectionHeading>
        <FilterRow label={{ en: "Share on Facebook", he: "פייסבוק" }} icon="facebook" color="var(--sefaria-color-text-secondary)" href={links.facebook} external />
        <FilterRow label={{ en: "Share on X", he: "X" }} icon="x-social" color="var(--sefaria-color-text-secondary)" href={links.x} external />
        <FilterRow label={{ en: "Share by Email", he: "אימייל" }} icon="mail" color="var(--sefaria-color-text-secondary)" href={links.email} external />
      </section>
    </div>
  );
}
