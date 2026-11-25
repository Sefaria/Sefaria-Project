import { useId, useState, type ReactNode } from "react";
import { AUTHOR_FIELDS, ERAS, MAIN_MENU, validateNewTopic, type AuthorField, type NewTopic } from "~/lib/topics/topic-editor";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./TopicCreateForm.module.css";

export interface TopicCreateFormProps {
  /** What the moderator typed in the topic search ("Create a new topic: <title>"). */
  initialTitle: string;
  /** The parents a topic can go under (topics with children), in TOC order; undefined while loading. */
  parents: { slug: string; en: string; he: string }[] | undefined;
  hebrew: boolean;
  /** Creates the topic and links it to the selection; rejects with the message to show. */
  onCreate: (topic: NewTopic) => Promise<void>;
  onCancel: () => void;
}

const AUTHOR_LABELS: Record<AuthorField, string> = {
  birthPlace: "Place of Birth",
  heBirthPlace: "Hebrew Place of Birth",
  birthYear: "Year of Birth",
  deathPlace: "Place of Death",
  heDeathPlace: "Hebrew Place of Death",
  deathYear: "Year of Death",
  era: "Era (GN/Gaonim, RI/Rishonim, AH/Achronim, CO/Contemporary)",
};

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/**
 * The old TopicEditor as TopicSearch opens it for "Create a new topic: …" (AdminEditor fields Title, Hebrew Title, English and
 * Hebrew Description, Parent Topic, alternate titles; author places, years and era under Authors). Saving creates the topic and
 * adds it to the selected verses, as onCreateSuccess → post did. Pictures are edited on the topic's page.
 *
 * @feature CON-047 Add topic to ref (moderator)
 */
export function TopicCreateForm({ initialTitle, parents, hebrew, onCreate, onCancel }: TopicCreateFormProps) {
  const id = useId();
  const [t, setT] = useState<NewTopic>({ enTitle: initialTitle, heTitle: "", category: "", enDescription: "", heDescription: "", enAltTitles: [], heAltTitles: [], author: {} });
  const [alts, setAlts] = useState({ en: "", he: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<NewTopic>) => setT((x) => ({ ...x, ...patch }));
  const setAuthor = (k: AuthorField, v: string) => setT((x) => ({ ...x, author: { ...x.author, [k]: v } }));

  const field = (label: ReactNode, key: string, input: ReactNode) => (
    <div className={styles.section} key={key}>
      <label htmlFor={`${id}-${key}`}>{label}</label>
      {input}
    </div>
  );
  const text = (key: "enTitle" | "heTitle", label: ReactNode, rtl = false) =>
    field(label, key, <input id={`${id}-${key}`} className={styles.input} dir={rtl ? "rtl" : "ltr"} value={t[key]} onChange={(e) => set({ [key]: e.target.value })} />);
  const area = (key: "enDescription" | "heDescription", label: ReactNode, rtl = false) =>
    field(label, key, <textarea id={`${id}-${key}`} className={styles.textarea} dir={rtl ? "rtl" : "ltr"} value={t[key]} onChange={(e) => set({ [key]: e.target.value })} />);

  const save = async () => {
    const topic = { ...t, enAltTitles: list(alts.en), heAltTitles: list(alts.he) };
    const invalid = validateNewTopic(topic);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    try {
      await onCreate(topic);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} aria-label="Create a new topic" onSubmit={(e) => (e.preventDefault(), void save())}>
      {text("enTitle", <InterfaceText en="Title" he="כותרת" />)}
      {text("heTitle", <InterfaceText en="Hebrew Title" he="כותרת בעברית" />, true)}
      {area("enDescription", <InterfaceText en="English Description" he="תיאור באנגלית" />)}
      {area("heDescription", <InterfaceText en="Hebrew Description" he="תיאור בעברית" />, true)}
      {field(
        <InterfaceText en="Parent Topic" he="נושא אב" />,
        "category",
        <select id={`${id}-category`} className={styles.select} value={t.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">{hebrew ? "בחירת נושא אב" : "Choose a Parent Topic"}</option>
          <option value={MAIN_MENU}>{hebrew ? "תפריט ראשי" : "Main Menu"}</option>
          {(parents ?? []).map((p) => (
            <option key={p.slug} value={p.slug}>{(hebrew ? p.he : p.en) || p.en}</option>
          ))}
        </select>,
      )}
      {field(
        <InterfaceText en="English Alternate Titles (comma separated)" he="כותרות חלופיות באנגלית (מופרדות בפסיק)" />,
        "enAlt",
        <input id={`${id}-enAlt`} className={styles.input} value={alts.en} onChange={(e) => setAlts((a) => ({ ...a, en: e.target.value }))} />,
      )}
      {field(
        <InterfaceText en="Hebrew Alternate Titles (comma separated)" he="כותרות חלופיות בעברית (מופרדות בפסיק)" />,
        "heAlt",
        <input id={`${id}-heAlt`} className={styles.input} dir="rtl" value={alts.he} onChange={(e) => setAlts((a) => ({ ...a, he: e.target.value }))} />,
      )}
      {t.category === "authors"
        ? AUTHOR_FIELDS.map((k) =>
            k === "era"
              ? field(
                  AUTHOR_LABELS[k],
                  k,
                  <select id={`${id}-${k}`} className={styles.select} value={t.author?.era ?? ""} onChange={(e) => setAuthor("era", e.target.value)}>
                    <option value="">Choose an era</option>
                    {ERAS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>,
                )
              : field(AUTHOR_LABELS[k], k, <input id={`${id}-${k}`} className={styles.input} dir={k.startsWith("he") ? "rtl" : "ltr"} value={t.author?.[k] ?? ""} onChange={(e) => setAuthor(k, e.target.value)} />),
          )
        : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>
          <InterfaceText en="Cancel" he="ביטול" />
        </button>
        <button type="submit" className={styles.primary} disabled={busy}>
          <InterfaceText en={busy ? "Saving…" : "Save"} he={busy ? "שומר…" : "שמירה"} />
        </button>
      </div>
    </form>
  );
}
