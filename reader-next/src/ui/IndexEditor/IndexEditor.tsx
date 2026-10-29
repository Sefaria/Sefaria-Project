import { useId, useState, type ReactNode } from "react";
import { DEPENDENCE, validateIndexDraft, type IndexDraft } from "~/lib/book/index-editor";
import { CategoryChooser } from "../CategoryChooser/CategoryChooser";
import type { TocNode } from "~/lib/catalog/toc";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./IndexEditor.module.css";

export interface IndexEditorProps {
  initial: IndexDraft;
  /** The catalog tree, for the category menus. */
  tree: readonly TocNode[];
  /** An author by name: the AuthorTopic it names exactly, or the message to alert. */
  findAuthor: (name: string) => Promise<{ name: string; slug: string } | string>;
  /** Whether a title is a book in the library (base text titles). */
  isBook: (title: string) => boolean;
  /** Description links the name API doesn't know (each asked about, as validateMarkdownLinks did); false to stop. */
  confirmLinks: (markdown: string) => Promise<boolean>;
  /** Saves (validation passed); resolves with a message to show while a title change runs, or rejects with one to alert. */
  onSave: (draft: IndexDraft, progress: (message: string) => void) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

/**
 * The old EditTextInfo ("Index Editor") for moderators on a book page: titles, descriptions, category, authors, alternate titles,
 * completion and publication years and places, dependence with base texts and collective title, the text structure (shown),
 * Save / Cancel and Delete. Same fields, order and checks.
 *
 * @feature BOK-030 Moderator edits a book's text information
 */
export function IndexEditor({ initial, tree, findAuthor, isBook, confirmLinks, onSave, onDelete, onClose }: IndexEditorProps) {
  const id = useId();
  const [d, setD] = useState<IndexDraft>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<IndexDraft>) => (setD((x) => ({ ...x, ...patch })), setError(null));

  const text = (key: keyof IndexDraft, label: ReactNode, opts: { area?: boolean; rtl?: boolean; hint?: string } = {}) => {
    const fid = `${id}-${String(key)}`;
    const value = String(d[key] ?? "");
    return (
      <div className={styles.section} key={String(key)}>
        <label htmlFor={fid}>{label}</label>
        {opts.hint ? <span className={styles.optional}>{opts.hint}</span> : null}
        {opts.area ? (
          <textarea id={fid} dir={opts.rtl ? "rtl" : undefined} value={value} onChange={(e) => set({ [key]: e.target.value } as Partial<IndexDraft>)} />
        ) : (
          <input id={fid} type="text" dir={opts.rtl ? "rtl" : undefined} value={value} onChange={(e) => set({ [key]: e.target.value } as Partial<IndexDraft>)} />
        )}
      </div>
    );
  };

  const save = async () => {
    const invalid = validateIndexDraft(d);
    if (invalid) return setError(invalid);
    for (const md of [d.enDesc, d.heDesc]) if (!(await confirmLinks(md))) return;
    setSaving("Saving text information...");
    try {
      await onSave(d, setSaving);
    } catch (e) {
      setSaving(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${initial.title}? Its versions, links and everything that depends on it go with it.`)) return;
    setSaving("Deleting...");
    try {
      await onDelete();
    } catch (e) {
      setSaving(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const optional = "Optional.";
  const yearsHint = "Optional.  Provide a range if there is an error margin or the work was completed over the course of many years such as 1797-1800 or -900--200 (to denote 900 BCE to 200 BCE).";

  return (
    <form className={styles.editor} aria-label="Index Editor" onSubmit={(e) => (e.preventDefault(), void save())}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>Index Editor</h1>
        <div className={styles.end}>
          <button type="button" className={styles.cancel} onClick={onClose}><InterfaceText en="Cancel" he="ביטול" /></button>
          <button type="submit" className={styles.save} disabled={!!saving}><InterfaceText en="Save" he="שמירה" /></button>
        </div>
      </div>
      {saving ? <div className={styles.status} role="status">{saving}</div> : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {text("title", "Text Title")}
      {text("heTitle", "Hebrew Title", { rtl: true })}
      {text("enDesc", "English Description", { area: true })}
      {text("enShortDesc", "Short English Description", { area: true })}
      {text("heDesc", "Hebrew Description", { area: true, rtl: true })}
      {text("heShortDesc", "Short Hebrew Description", { area: true, rtl: true })}
      <div className={styles.section}>
        <span className={styles.label}>Category</span>
        <CategoryChooser tree={tree} categories={d.categories} onChange={(categories) => set({ categories })} />
      </div>
      <TagList
        label="Authors"
        hint={optional}
        items={d.authors.map((a) => a.name)}
        onAdd={async (name) => {
          const found = await findAuthor(name);
          if (typeof found === "string") return found;
          set({ authors: [...d.authors, found] });
          return null;
        }}
        onRemove={(i) => set({ authors: d.authors.filter((_, j) => j !== i) })}
      />
      <TagList label="Alternate English Titles" hint={optional} items={d.titleVariants} onAdd={(t) => (set({ titleVariants: [...d.titleVariants, t] }), null)} onRemove={(i) => set({ titleVariants: d.titleVariants.filter((_, j) => j !== i) })} />
      <TagList label="Alternate Hebrew Titles" hint={optional} rtl items={d.heTitleVariants} onAdd={(t) => (set({ heTitleVariants: [...d.heTitleVariants, t] }), null)} onRemove={(i) => set({ heTitleVariants: d.heTitleVariants.filter((_, j) => j !== i) })} />
      {text("compDate", "Completion Year", { hint: yearsHint })}
      {text("compPlace", "Place of Composition", { hint: optional })}
      {text("heCompPlace", "Hebrew Place of Composition", { hint: optional, rtl: true })}
      {text("pubDate", "Publication Year", { hint: yearsHint })}
      {text("pubPlace", "Place of Publication", { hint: optional })}
      {text("hePubPlace", "Hebrew Place of Publication", { hint: optional, rtl: true })}
      <div className={styles.section}>
        <label htmlFor={`${id}-dependence`}>Dependence</label>
        <span className={styles.optional}>{optional}</span>
        <select
          id={`${id}-dependence`}
          value={d.dependence}
          // no dependence: no base texts and no collective title (handleDependenceChange)
          onChange={(e) => set(e.target.value ? { dependence: e.target.value } : { dependence: "", collectiveTitle: "", baseTextTitles: [] })}
        >
          {DEPENDENCE.map((v) => <option key={v} value={v}>{v || "--Not a dependent text--"}</option>)}
        </select>
      </div>
      {d.dependence ? (
        <>
          <TagList
            label="Base Text Titles"
            hint='Optional.  What text(s) is this book dependent on?  For example, for "Rashi on Genesis", the value for this field is "Genesis".'
            items={d.baseTextTitles}
            onAdd={(t) => (isBook(t) ? (set({ baseTextTitles: [...d.baseTextTitles, t] }), null) : `${t} is not a book in the Sefaria library.`)}
            onRemove={(i) => set({ baseTextTitles: d.baseTextTitles.filter((_, j) => j !== i) })}
          />
          {d.creatingCollectiveTitle ? (
            <>
              {text("collectiveTitle", "New English Collective Title")}
              {text("heCollectiveTitle", "New Hebrew Collective Title", { rtl: true })}
            </>
          ) : (
            <div className={styles.section}>
              <label htmlFor={`${id}-collectiveTitle`}>English Collective Title</label>
              <span className={styles.optional}>
                Optional. For example, for "Rashi on Genesis", the English Collective Title is "Rashi". You should create a new collective title if the
                collective title has never been created before and is not used by any texts in our system.
              </span>
              <div className={styles.row}>
                <input id={`${id}-collectiveTitle`} type="text" value={d.collectiveTitle} onChange={(e) => set({ collectiveTitle: e.target.value })} />
                <button type="button" className={styles.small} onClick={() => set({ creatingCollectiveTitle: true })}>Create New Collective Title</button>
              </div>
            </div>
          )}
        </>
      ) : null}
      {d.sectionNames ? (
        <div className={styles.section}>
          <span className={styles.label}>Text Structure</span>
          <div className={styles.structure}>{d.sectionNames.join(" › ")}</div>
        </div>
      ) : null}
      <button type="button" className={styles.delete} onClick={() => void remove()} disabled={!!saving}>Delete</button>
    </form>
  );
}

/** The old TitleVariants: the items as removable chips and a box to add one (Enter); `onAdd` answers an error or null. */
function TagList({ label, hint, items, onAdd, onRemove, rtl }: {
  label: string;
  hint?: string;
  items: string[];
  onAdd: (value: string) => Promise<string | null> | string | null;
  onRemove: (index: number) => void;
  rtl?: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    const v = value.trim();
    if (!v) return;
    const err = await onAdd(v);
    if (err) setError(err);
    else (setValue(""), setError(null));
  };
  return (
    <div className={styles.section}>
      <label htmlFor={id}>{label}</label>
      {hint ? <span className={styles.optional}>{hint}</span> : null}
      <ul className={styles.tags} aria-label={`${label} (list)`}>
        {items.map((t, i) => (
          <li key={`${t}|${i}`} dir={rtl ? "rtl" : undefined}>
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onRemove(i)}><Icon name="close" size="12px" /></button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        type="text"
        dir={rtl ? "rtl" : undefined}
        value={value}
        placeholder="Add and press Enter"
        onChange={(e) => (setValue(e.target.value), setError(null))}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void add())}
      />
      {error ? <span className={styles.error} role="alert">{error}</span> : null}
    </div>
  );
}
