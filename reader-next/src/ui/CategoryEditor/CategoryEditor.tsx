import { useId, useState } from "react";
import { move, validateCategory, type CategoryDraft } from "~/lib/catalog/category-editor";
import type { TocNode } from "~/lib/catalog/toc";
import { CategoryChooser } from "../CategoryChooser/CategoryChooser";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./CategoryEditor.module.css";

/** The old Reorder: each item with an up and a down arrow. */
export function ReorderList({ items, onChange }: { items: readonly string[]; onChange: (items: string[]) => void }) {
  return (
    <ol className={styles.reorder} aria-label="Order">
      {items.map((t, i) => (
        <li key={t}>
          <span>{t}</span>
          <button type="button" aria-label={`Move ${t} up`} disabled={i === 0} onClick={() => onChange(move(items, i, -1))}><Icon name="chevron-up" size="16px" /></button>
          <button type="button" aria-label={`Move ${t} down`} disabled={i === items.length - 1} onClick={() => onChange(move(items, i, 1))}><Icon name="chevron-down" size="16px" /></button>
        </li>
      ))}
    </ol>
  );
}

function Header({ title, onClose, saving }: { title: string; onClose: () => void; saving: boolean }) {
  return (
    <div className={styles.header}>
      <h1 className={styles.pageTitle}>{title}</h1>
      <div className={styles.end}>
        <button type="button" className={styles.cancel} onClick={onClose}><InterfaceText en="Cancel" he="ביטול" /></button>
        <button type="submit" className={styles.save} disabled={saving}><InterfaceText en="Save" he="שמירה" /></button>
      </div>
    </div>
  );
}

export interface CategoryEditorProps {
  initial: CategoryDraft;
  /** A new category (no reorder, no delete). */
  isNew: boolean;
  tree: readonly TocNode[];
  onSave: (draft: CategoryDraft) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

/**
 * The old CategoryEditor ("Category Editor"), for moderators on the library's pages: titles, descriptions and short
 * descriptions in both languages, the parent category, the children's order (an existing category), Primary Status, Save /
 * Cancel and Delete (only an empty category).
 *
 * @feature LIB-002 Library home header and edit buttons
 */
export function CategoryEditor({ initial, isNew, tree, onSave, onDelete, onClose }: CategoryEditorProps) {
  const id = useId();
  const [d, setD] = useState(initial);
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<CategoryDraft>) => (setD((x) => ({ ...x, ...patch })), setChanged(true), setError(null));
  const field = (key: "enTitle" | "heTitle" | "enDescription" | "heDescription" | "enShortDescription" | "heShortDescription", label: string, area = false, rtl = false) => (
    <div className={styles.section} key={key}>
      <label htmlFor={`${id}-${key}`}>{label}</label>
      {area ? (
        <textarea id={`${id}-${key}`} dir={rtl ? "rtl" : undefined} value={d[key]} onChange={(e) => set({ [key]: e.target.value })} />
      ) : (
        <input id={`${id}-${key}`} type="text" dir={rtl ? "rtl" : undefined} value={d[key]} onChange={(e) => set({ [key]: e.target.value })} />
      )}
    </div>
  );
  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };
  const save = () => {
    const invalid = validateCategory(d, changed);
    if (invalid) return setError(invalid);
    void run(() => onSave(d));
  };
  const remove = () => {
    if (d.children.length) return setError("Cannot delete a category with contents.");
    if (!window.confirm(`Delete the category ${initial.enTitle}?`)) return;
    void run(onDelete);
  };
  return (
    <form className={styles.editor} aria-label="Category Editor" onSubmit={(e) => (e.preventDefault(), save())}>
      <Header title="Category Editor" onClose={onClose} saving={saving} />
      {saving ? <div className={styles.status} role="status"><InterfaceText en="Saving..." he="שומר..." /></div> : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {field("enTitle", "Title")}
      {field("heTitle", "Hebrew Title", false, true)}
      {field("enDescription", "English Description", true)}
      {field("heDescription", "Hebrew Description", true, true)}
      <div className={styles.section}>
        <span className={styles.label}>Parent Category</span>
        <CategoryChooser tree={tree} categories={d.path} onChange={(path) => set({ path })} rootOption="(Top level)" />
      </div>
      {field("enShortDescription", "English Short Description", true)}
      {field("heShortDescription", "Hebrew Short Description", true, true)}
      {isNew ? null : <ReorderList items={d.children} onChange={(children) => set({ children })} />}
      <fieldset className={styles.section}>
        <legend>Primary Status (If true, this category will display its contents on its own category page.)</legend>
        <label className={styles.radio}><input type="radio" name={`${id}-primary`} checked={d.isPrimary} onChange={() => set({ isPrimary: true })} /> True</label>
        <label className={styles.radio}><input type="radio" name={`${id}-primary`} checked={!d.isPrimary} onChange={() => set({ isPrimary: false })} /> False</label>
      </fieldset>
      {isNew ? null : <button type="button" className={styles.delete} onClick={remove} disabled={saving}><InterfaceText en="Delete" he="מחיקה" /></button>}
    </form>
  );
}

/** The old ReorderEditor ("Reorder Editor") for the library's top level. */
export function ReorderEditor({ initial, onSave, onClose }: { initial: readonly string[]; onSave: (order: string[]) => Promise<void>; onClose: () => void }) {
  const [items, setItems] = useState<string[]>([...initial]);
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!changed) return setError("You haven't reordered the categories.");
    setSaving(true);
    try {
      await onSave(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };
  return (
    <form className={styles.editor} aria-label="Reorder Editor" onSubmit={(e) => (e.preventDefault(), void save())}>
      <Header title="Reorder Editor" onClose={onClose} saving={saving} />
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      <ReorderList items={items} onChange={(next) => (setItems(next), setChanged(true), setError(null))} />
    </form>
  );
}
