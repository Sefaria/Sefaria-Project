import type { ReactNode } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { EmptyState, LoadingState } from "../Feedback/Feedback";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LangText } from "../LangText/LangText";
import { Link } from "../Link/Link";
import { NavPage } from "../NavPage/NavPage";
import { noteHtml } from "../NotesView/NotesView";
import styles from "./UserHistoryPage.module.css";

export type UserHistoryTabId = "saved" | "history" | "notes";

export interface UserHistoryPageProps {
  tab: UserHistoryTabId;
  /** Each tab's address (the old title bar's links). */
  hrefs: Record<UserHistoryTabId, string>;
  children: ReactNode;
  sidebar?: ReactNode;
  footer?: ReactNode;
}

const TABS: { id: UserHistoryTabId; icon: "bookmark" | "clock" | "note"; en: string; he: string }[] = [
  { id: "saved", icon: "bookmark", en: "Saved", he: "שמורים" },
  { id: "history", icon: "clock", en: "History", he: "היסטוריה" },
  { id: "notes", icon: "note", en: "Notes", he: "הערות" },
];

/**
 * The Saved / History / Notes page (the old UserHistoryPanel): a title of three tabs, the current one dark, then the list; the sidebar
 * holds the promotion, Get the App and Support Sefaria.
 *
 * @feature USL-008 Saved items and reading history pages
 * @feature USL-003 My Notes page
 */
export function UserHistoryPage({ tab, hrefs, children, sidebar, footer }: UserHistoryPageProps) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <NavPage sidebar={sidebar} footer={footer} top={{ main: 60, side: 60 }}>
      <h1 className={styles.title}>
        <nav aria-label={he ? "שמורים, היסטוריה והערות" : "Saved, history and notes"} className={styles.tabs}>
          {TABS.map((t) => (
            <Link key={t.id} href={hrefs[t.id]} className={`${styles.tab} ${t.id === tab ? styles.current : ""}`} aria-current={t.id === tab ? "page" : undefined} data-user-history-tab={t.id}>
              <Icon name={t.icon} size="14px" />
              <InterfaceText en={t.en} he={t.he} />
            </Link>
          ))}
        </nav>
      </h1>
      {children}
    </NavPage>
  );
}

export interface TextPassageItemProps {
  href: string;
  citation: { en: string; he?: string };
  /** Already-sanitised HTML of each side (rtl = he, ltr = en). */
  text: { en?: string; he?: string };
  /** The colour bar: the book's category colour. */
  color: string;
  /** The time since (History only). */
  timeStamp?: string;
}

/** A text on the list (the old TextPassage in its StoryFrame): the citation, the time since, then the text with its colour bar. */
export function TextPassageItem({ href, citation, text, color, timeStamp }: TextPassageItemProps) {
  return (
    <article className={styles.story} data-user-history-item="text">
      <div className={styles.titleLine}>
        <Link href={href} className={styles.storyTitle}>
          <InterfaceText en={citation.en} he={citation.he || citation.en} />
        </Link>
        {timeStamp ? <span className={styles.timeStamp}>{timeStamp}</span> : null}
      </div>
      <div className={styles.colorBar} style={{ borderInlineStartColor: color }}>
        <Link href={href} className={styles.body}>
          {text.he ? <LangText lang="he" className={styles.text} html={text.he} /> : null}
          {text.en ? <LangText lang="en" className={styles.text} html={text.en} /> : null}
        </Link>
      </div>
    </article>
  );
}

export interface SheetItemProps {
  href: string;
  title: string;
  ownerName?: string;
  ownerHref?: string;
  timeStamp?: string;
}

/** A sheet on the list (the old SheetBlock, small): its title, the time since and its author. */
export function SheetItem({ href, title, ownerName, ownerHref, timeStamp }: SheetItemProps) {
  return (
    <article className={styles.story} data-user-history-item="sheet">
      <div className={styles.titleLine}>
        <Link href={href} className={styles.storyTitle}>
          {title}
        </Link>
        {timeStamp ? <span className={styles.timeStamp}>{timeStamp}</span> : null}
      </div>
      {ownerName ? <div className={styles.owner}>{ownerHref ? <Link href={ownerHref}>{ownerName}</Link> : ownerName}</div> : null}
    </article>
  );
}

/** Saved / History: loading, the old empty messages, or the items with a "load more" sentinel under them. */
export function UserHistoryList({ tab, items, sentinel, disabled, settingsHref }: { tab: "saved" | "history"; items: ReactNode[] | undefined; sentinel?: ReactNode; disabled?: boolean; settingsHref: string }) {
  if (tab === "history" && disabled) {
    return (
      <p className={styles.message}>
        <InterfaceText
          en={<>Reading history is currently disabled. You can re-enable this feature in your <Link href={settingsHref}>account settings</Link>.</>}
          he={<>היסטורית קריאה כבויה כרגע. ניתן להפעילה מחדש במסך <Link href={settingsHref}>ההגדרות</Link>.</>}
        />
      </p>
    );
  }
  if (!items) return <LoadingState />;
  if (!items.length) {
    return (
      <p className={styles.message}>
        {tab === "history" ? (
          <InterfaceText en="Texts and sheets that you read will be available for you to see here." he="מקורות ודפי מקורות שקראתם יהיו זמינים עבורכם כאן לעיון חוזר." />
        ) : (
          <InterfaceText en="Click the bookmark icon on texts or sheets to save them here." he="לחצו על סמל הסימניה בתוך מקורות או דפי מקורות כדי לשמור מראי מקומות מסוימים כאן." />
        )}
      </p>
    );
  }
  return (
    <div className={styles.list} data-user-history-list={tab}>
      {items}
      {sentinel}
    </div>
  );
}

export interface NoteListingProps {
  citation: string;
  href: string;
  text: string;
  onDelete: () => void;
}

/** A note (the old NoteListing): delete (on hover), the citation linking to the verse with Notes open, the note's text. */
export function NoteListing({ citation, href, text, onDelete }: NoteListingProps) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <div className={styles.noteListing} data-note-listing="">
      <button type="button" className={styles.deleteNote} onClick={onDelete} aria-label={he ? "מחק הערה" : "Delete note"} title={he ? "מחק הערה" : "Delete note"}>
        <Icon name="circle-close" size="16px" />
      </button>
      <Link className={styles.noteRef} href={href}>
        <span>{citation}</span>
      </Link>
      <span className={styles.noteText} dangerouslySetInnerHTML={{ __html: noteHtml(text) }} />
    </div>
  );
}

/** Notes: loading, the old empty message, or the notes. */
export function NotesList({ notes }: { notes: ReactNode[] | undefined }) {
  if (!notes) return <LoadingState />;
  if (!notes.length) return <EmptyState title={<InterfaceText en="You haven't written any notes yet." he="טרם הוספת רשומות משלך" />} />;
  return <div data-notes-list="">{notes}</div>;
}
