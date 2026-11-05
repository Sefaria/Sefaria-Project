import { useEffect, useState } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Button } from "../Button/Button";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./AddConnectionView.module.css";

/** The old AddConnectionBox's connection types (ConnectionsPanel.jsx:1531-1540). */
export const CONNECTION_TYPES: { value: string; en: string; he: string }[] = [
  { value: "", en: "None", he: "ללא" },
  { value: "commentary", en: "Commentary", he: "פרשנות" },
  { value: "quotation", en: "Quotation", he: "ציטוט" },
  { value: "midrash", en: "Midrash", he: "מדרש" },
  { value: "ein mishpat", en: "Ein Mishpat / Ner Mitsvah", he: "עין משפט / נר מצוה" },
  { value: "mesorat hashas", en: "Mesorat HaShas", he: "מסורת הש״ס" },
  { value: "reference", en: "Reference", he: "התייחסות" },
  { value: "related", en: "Related Passage", he: "קטע קשור" },
];

export interface AddConnectionViewProps {
  /** The texts open in the panels (each panel's chosen verse or section). */
  refs: string[];
  /** Save the connection. Rejecting shows the error. */
  onAdd: (refs: [string, string], type: string) => Promise<void>;
  /** With one text open: browse for the other (Compare Text). Absent until that exists. */
  onBrowse?: () => void;
}

/**
 * Add Connection for a signed-in reader, as the old AddConnectionBox (ConnectionsPanel.jsx:1451-1572): with one text open, "Choose a
 * text to connect." and Browse; with exactly two, both refs, the type and Add Connection; with more, "We currently only understand
 * connections between two texts."
 *
 * @feature CON-065 Create connection between two texts
 */
export function AddConnectionView({ refs, onAdd, onBrowse }: AddConnectionViewProps) {
  const he = useInterfaceLang() === "hebrew";
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [refs.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (saved) return <p className={styles.view} role="status"><InterfaceText en="Connection added." he="הקישור נוסף." /></p>;
  if (refs.length === 1) {
    return (
      <div className={styles.view}>
        <p><InterfaceText en="Choose a text to connect." he="בחר טקסט לקישור" /></p>
        {onBrowse ? <Button variant="primary" block onClick={onBrowse}><InterfaceText en="Browse" he="סייר" /></Button> : null}
      </div>
    );
  }
  if (refs.length > 2) return <p className={styles.view}><InterfaceText en="We currently only understand connections between two texts." he="ניתן לקשר רק בין 2 טקסטים" /></p>;
  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await onAdd([refs[0]!, refs[1]!], type);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unfortunately, there was an error saving this connection. Please try again or try reloading this page.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.view}>
      <div className={styles.summary}>{refs[0]}<br />&amp;<br />{refs[1]}</div>
      <select className={styles.select} aria-label={he ? "בחירת סוג קישור" : "Select Type"} value={type} onChange={(e) => setType(e.target.value)}>
        {CONNECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{he ? t.he : t.en}</option>)}
      </select>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <Button variant="primary" block loading={busy} onClick={() => void add()}><InterfaceText en="Add Connection" he="הוסף קישור" /></Button>
    </div>
  );
}
