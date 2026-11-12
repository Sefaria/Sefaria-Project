import { useRef, useState } from "react";
import { shareHrefs } from "~/lib/feedback/share";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { FilterRow, PanelSectionHeading } from "../ConnectionsPanel/FilterRow";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { useFollowMeState, useRegisteredFollowMe, type FollowMeSource } from "./follow-me";
import styles from "./ShareView.module.css";

export interface ShareViewProps {
  /** The address being shared: the current view, sidebar and all. */
  url: string;
  /**
   * Follow me's source. Default: the one the follow controller registered (./follow-me.ts); none registered (the server, a story without
   * one) means no "Follow me" entry. Pass null to hide it explicitly.
   */
  followMe?: FollowMeSource | null;
}

/**
 * Share: the link in a box with a copy button, then Facebook, X and email. Replaces ShareBox (whose sheet-collaboration
 * branch is dead code and not carried over).
 *
 * @feature CON-061 Share link and social options
 */
export function ShareView({ url, followMe }: ShareViewProps) {
  const hebrew = useInterfaceLang() === "hebrew";
  const registered = useRegisteredFollowMe();
  const source = followMe === undefined ? registered : followMe;
  const links = shareHrefs(url);
  return (
    <div className={styles.view}>
      <section aria-label="Share Link">
        <PanelSectionHeading><InterfaceText en="Share Link" he="שיתוף קישור" /></PanelSectionHeading>
        <CopyBox url={url} label={hebrew ? "קישור לשיתוף" : "Shareable link"} copyLabel={hebrew ? "העתקת הקישור" : "Copy link"} />
      </section>
      {source ? <FollowMeSection source={source} url={url} hebrew={hebrew} /> : null}
      <section aria-label="More Options">
        <PanelSectionHeading><InterfaceText en="More Options" he="אפשרויות נוספות" /></PanelSectionHeading>
        <FilterRow label={{ en: "Share on Facebook", he: "פייסבוק" }} icon="facebook" color="var(--sefaria-color-text-secondary)" href={links.facebook} external />
        <FilterRow label={{ en: "Share on X", he: "X" }} icon="x-social" color="var(--sefaria-color-text-secondary)" href={links.x} external />
        <FilterRow label={{ en: "Share by Email", he: "אימייל" }} icon="mail" color="var(--sefaria-color-text-secondary)" href={links.email} external />
      </section>
    </div>
  );
}

/** The link, selectable, with a copy button and a "copied" note. */
function CopyBox({ url, label, copyLabel }: { url: string; label: string; copyLabel: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
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
    <>
      <div className={styles.box}>
        <button type="button" className={styles.copy} aria-label={copyLabel} onClick={() => void copy()}>
          <Icon name="copy" />
        </button>
        <input ref={input} readOnly value={url} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      </div>
      <span className={styles.copied} role="status">{copied ? <InterfaceText en="Link copied" he="הקישור הועתק" /> : null}</span>
    </>
  );
}

/**
 * Follow me (docs/READER_STATE_API.md, "Starting: the leader"): start a session that others join from a link and then move through the
 * text as this reader does. The link is this address plus `follow=<session id>`, so it opens the right text even after the session ends.
 */
function FollowMeSection({ source, url, hebrew }: { source: FollowMeSource; url: string; hebrew: boolean }) {
  const state = useFollowMeState(source);
  const link = state.status === "sharing" || state.status === "starting" ? source.linkFor(url) : null;
  return (
    <section aria-label="Follow Me">
      <PanelSectionHeading><InterfaceText en="Follow Me" he="עקבו אחריי" /></PanelSectionHeading>
      <p className={styles.explain}>
        <InterfaceText en="Anyone who opens the link moves through the text with you." he="מי שפותח את הקישור עובר בטקסט יחד איתך." />
      </p>
      {state.status === "idle" ? (
        <button type="button" className={styles.follow} onClick={() => source.start()}>
          <Icon name="share" />
          <InterfaceText en="Start sharing" he="התחלת שיתוף" />
        </button>
      ) : state.status === "busy" ? (
        <p className={styles.explain}>
          <InterfaceText en="You are following someone now. Stop following to share your own reading." he="את/ה עוקב/ת כעת אחרי מישהו. יש להפסיק את המעקב כדי לשתף." />
        </p>
      ) : (
        <>
          {link ? <CopyBox url={link} label={hebrew ? "קישור למעקב" : "Follow link"} copyLabel={hebrew ? "העתקת קישור המעקב" : "Copy follow link"} /> : null}
          <div className={styles.followRow}>
            <span className={styles.copied}>
              {state.status === "starting" ? (
                <InterfaceText en="Starting…" he="מתחילים…" />
              ) : (
                <InterfaceText en={`${state.following} following`} he={`${state.following} עוקבים`} />
              )}
            </span>
            <button type="button" className={styles.follow} onClick={() => source.stop()}>
              <InterfaceText en="Stop sharing" he="הפסקת השיתוף" />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
