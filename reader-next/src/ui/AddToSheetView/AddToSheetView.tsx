import { useEffect, useId, useState } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { sheetTitle, type UserSheet } from "~/lib/user/sheets";
import { Button } from "../Button/Button";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LoadingState } from "../Feedback/Feedback";
import styles from "./AddToSheetView.module.css";

export interface AddToSheetViewProps {
  /** The citation being added ("Genesis 1:1-3"), in both languages. */
  citation: { en: string; he: string };
  /** Where the citation itself goes (the confirmation links to it). */
  citationHref: string;
  /** The reader's sheets, newest first (undefined while loading). */
  sheets: UserSheet[] | undefined;
  onAdd: (sheet: UserSheet) => Promise<void>;
  onCreate: (title: string) => Promise<UserSheet>;
  /** A sheet's page (on Voices). */
  sheetHref: (id: number) => string;
}

/**
 * The sidebar's "Add to Sheet" for a signed-in reader, as the old AddToSourceSheetBox (AddToSourceSheet.jsx:327-445): the selected
 * citation, "Add to" one of the reader's sheets (the newest chosen; "Create a New Sheet" when there are none, with a name box), the
 * Add to Sheet button, and the confirmation "<citation> has been added to <sheet>."
 *
 * @feature CON-034 Add connection to sheet button
 */
export function AddToSheetView({ citation, citationHref, sheets, onAdd, onCreate, sheetHref }: AddToSheetViewProps) {
  const he = useInterfaceLang() === "hebrew";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const ids = { select: useId(), name: useId() };
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<UserSheet | null>(null);
  // the default: the newest sheet, or a new one (setDefaultSheet)
  useEffect(() => {
    if (sheets && selected === null) setSelected(sheets[0]?.id ?? "new");
  }, [sheets, selected]);
  // another citation: back to the form
  useEffect(() => setAdded(null), [citation.en]);

  if (added) {
    return (
      <div className={styles.confirm} role="status" lang={he ? "he" : "en"}>
        {he ? (
          <>
            <a href={citationHref}>{citation.he}</a> נוסף בהצלחה לדף המקורות <a href={sheetHref(added.id)}>{sheetTitle(added.title)}</a>.
          </>
        ) : (
          <>
            <a href={citationHref}>{citation.en}</a> has been added to <a href={sheetHref(added.id)}>{sheetTitle(added.title)}</a>.
          </>
        )}
      </div>
    );
  }
  if (!sheets) return <LoadingState />;

  const add = async () => {
    if (busy || selected === null) return;
    setBusy(true);
    setError(null);
    try {
      let sheet = sheets.find((s) => s.id === selected);
      if (selected === "new") {
        if (!name.trim()) {
          setError(t("Name your new sheet", "תנו שם לדף המקורות החדש"));
          return;
        }
        sheet = await onCreate(name.trim());
      }
      if (!sheet) return;
      await onAdd(sheet);
      setAdded(sheet);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.view} lang={he ? "he" : "en"}>
      <div className={styles.label}><InterfaceText en="Selected Citation" he="מקור להוספה" /></div>
      <div className={styles.citation} role="status" aria-live="polite">{he ? citation.he : citation.en}</div>
      <label className={styles.label} htmlFor={ids.select}><InterfaceText en="Add to" he="יעד להוספה" /></label>
      <select id={ids.select} className={styles.select} value={selected ?? ""} onChange={(e) => setSelected(e.target.value === "new" ? "new" : Number(e.target.value))}>
        {sheets.map((s) => (
          <option key={s.id} value={s.id}>{sheetTitle(s.title)}</option>
        ))}
        <option value="new">{t("Create a New Sheet", "יצירת דף מקורות חדש")}</option>
      </select>
      {selected === "new" ? (
        <input id={ids.name} className={styles.select} type="text" aria-label={t("Name New Sheet", "שם דף המקורות")} placeholder={t("Name New Sheet", "שם דף המקורות")} value={name} onChange={(e) => setName(e.target.value)} />
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <Button variant="primary" block loading={busy} onClick={() => void add()}>
        <InterfaceText en="Add to Sheet" he="הוספה לדף המקורות" />
      </Button>
    </div>
  );
}
