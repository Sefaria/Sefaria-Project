import { useEffect, useRef, useState } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import type { Note } from "~/lib/user/notes";
import { Button } from "../Button/Button";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LoadingState } from "../Feedback/Feedback";
import styles from "./NotesView.module.css";

export interface NotesViewProps {
  /** The reader's notes on the selected verses (undefined while loading). */
  notes: Note[] | undefined;
  /** Add a note (no id) or change one. Rejecting keeps the text and shows the error. */
  onSave: (text: string, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** "Go to My Notes" (the old /texts/notes page). */
  allNotesHref: string;
}

/** Links in a note's text, and its line breaks (the old Sefaria.util.linkify + \n → <br>). Text is escaped first. */
function noteHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, "<br />");
}

/**
 * The sidebar's Notes tool for a signed-in reader, as the old AddNoteBox + MyNotes (ConnectionsPanel.jsx:415-433, 1257-1419):
 * a box to write a note on the selected verses (Add Note), "Go to My Notes", and the reader's notes on them, each with a pencil
 * that turns the box into an editor (Save, Cancel, Delete Note). Notes are private (public notes are off on sefaria.org).
 *
 * @feature CON-049 My notes for these refs
 * @feature USL-007 Note display
 * @feature USL-005 Private notes list
 */
export function NotesView({ notes, onSave, onDelete, allNotesHref }: NotesViewProps) {
  const he = useInterfaceLang() === "hebrew";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const [editing, setEditing] = useState<Note | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // the box takes focus when it appears, as the old focusNoteText
  useEffect(() => box.current?.focus(), [editing]);

  const startEdit = (n: Note) => {
    setEditing(n);
    setText(n.text);
    setError(null);
  };
  const reset = () => {
    setEditing(null);
    setText("");
    setError(null);
  };
  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(text, editing?._id);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Unfortunately, there was an error saving this note.", "לצערנו ארעה שגיאה בשמירת ההערה."));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!editing || !window.confirm(t("Are you sure you want to delete this?", "האם אתם בטוחים שברצונכם למחוק?"))) return;
    setBusy(true);
    try {
      await onDelete(editing._id);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.view} lang={he ? "he" : "en"}>
      <div className={styles.addNoteBox}>
        <textarea
          ref={box}
          className={styles.noteText}
          aria-label={t("Write a note...", "כתבו הערה...")}
          placeholder={t("Write a note...", "כתבו הערה...")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <Button variant="primary" block loading={busy} onClick={() => void save()}>
          {editing ? <InterfaceText en="Save" he="שמירה" /> : <InterfaceText en="Add Note" he="הוספת הערה" />}
        </Button>
        {editing ? (
          <>
            <Button block onClick={reset}><InterfaceText en="Cancel" he="בטל" /></Button>
            <button type="button" className={styles.deleteNote} onClick={() => void remove()}><InterfaceText en="Delete Note" he="מחיקת הערה" /></button>
          </>
        ) : null}
      </div>
      {editing ? null : (
        <div>
          <Button href={allNotesHref} block className={styles.allNotesLink}><InterfaceText en="Go to My Notes" he="הרשומות שלי" /></Button>
          {notes === undefined ? (
            <LoadingState />
          ) : notes.length ? (
            <ul className={styles.noteList} aria-label={t("My notes", "הרשומות שלי")}>
              {notes.map((n) => (
                <li key={n._id} className={styles.note}>
                  <button type="button" className={styles.editNoteButton} aria-label={t("Edit Note", "עריכת הערה")} title={t("Edit Note", "עריכת הערה")} onClick={() => startEdit(n)}>
                    <Icon name="edit" size="20px" />
                  </button>
                  <span className={styles.noteContent} dangerouslySetInnerHTML={{ __html: noteHtml(n.text) }} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
