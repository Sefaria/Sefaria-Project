import { useId, useState, type ChangeEvent } from "react";
import type { VersionDraft, VersionField } from "~/lib/versions/admin";
import { Icon } from "../Icon/Icon";
import styles from "./VersionEditForm.module.css";

export interface VersionEditFormProps {
  /** The version's current values (versionDraft). */
  initial: VersionDraft;
  /** The licenses to offer (the old Sefaria.getLicenseMap keys); the version's own is kept even when not listed. */
  licenses: readonly string[];
  /** Saves; rejects with the message to show. */
  onSave: (draft: VersionDraft) => Promise<void>;
  /** Deletes the version (after the confirm); rejects with the message to show. */
  onDelete: () => Promise<void>;
  onClose: () => void;
}

type FieldKind = "text" | "checkbox" | "textarea";
const TEXT: [VersionField, string][] = [
  ["versionTitle", "Version Title"],
  ["versionTitleInHebrew", "Hebrew Version Title"],
  ["shortVersionTitle", "Short Version Title"],
  ["shortVersionTitleInHebrew", "Short Hebrew Version Title"],
  ["versionSource", "Version Source"],
];

/**
 * The old VersionBlock's editing view, for moderators on the book page: the version's titles, source, license, direction,
 * isSource / isPrimary / Digitized by Sefaria, priority, Locked, notes in both languages and purchase information, with
 * "Delete Version" (after "Are you sure you want to delete this text version?") and SAVE. Same fields, labels and order.
 *
 * @feature VER-030 Moderator edits or deletes a version
 */
export function VersionEditForm({ initial, licenses, onSave, onDelete, onClose }: VersionEditFormProps) {
  const id = useId();
  const [draft, setDraft] = useState<VersionDraft>(initial);
  const [status, setStatus] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const allLicenses = [...licenses, ""];
  const licenseOptions = draft.license && !allLicenses.includes(String(draft.license)) ? [String(draft.license), ...allLicenses] : allLicenses;

  const change = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const t = e.target;
    const name = t.name as VersionField;
    const checked = t instanceof HTMLInputElement && t.type === "checkbox" ? t.checked : undefined;
    // the Locked checkbox writes status: "locked" or null
    const value = checked === undefined ? t.value : name === "status" ? (checked ? "locked" : null) : checked;
    setDraft((d) => ({ ...d, [name]: value }));
    setStatus(null);
  };
  const field = (name: VersionField, label: string, kind: FieldKind = "text") => {
    const fid = `${id}-${name}`;
    return (
      <div className={kind === "checkbox" ? styles.check : styles.field} key={name}>
        <label htmlFor={fid}>{label}</label>
        {kind === "textarea" ? (
          <textarea id={fid} name={name} rows={5} value={String(draft[name] ?? "")} onChange={change} placeholder={label} />
        ) : kind === "checkbox" ? (
          <input id={fid} type="checkbox" name={name} checked={name === "status" ? draft.status === "locked" : Boolean(draft[name])} onChange={change} />
        ) : (
          <input id={fid} type="text" name={name} value={String(draft[name] ?? "")} onChange={change} />
        )}
      </div>
    );
  };

  const save = async () => {
    setBusy(true);
    setStatus({ kind: "info", text: "Saving." });
    try {
      await onSave(draft);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm("Are you sure you want to delete this text version?")) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} aria-label="Edit version" onSubmit={(e) => (e.preventDefault(), void save())}>
      <button type="button" className={styles.close} aria-label="Close editor" onClick={onClose}>
        <Icon name="circle-close" size="20px" />
      </button>
      {status ? <div className={status.kind === "error" ? styles.error : styles.info} role={status.kind === "error" ? "alert" : "status"}>{status.text}</div> : null}
      {TEXT.map(([name, label]) => field(name, label))}
      <div className={styles.field}>
        <label htmlFor={`${id}-license`}>License</label>
        <select id={`${id}-license`} name="license" value={String(draft.license ?? "")} onChange={change}>
          {licenseOptions.map((l) => <option key={l} value={l}>{l || "(None Listed)"}</option>)}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-direction`}>Direction</label>
        <select id={`${id}-direction`} name="direction" value={String(draft.direction ?? "")} onChange={change}>
          <option value="ltr">Left to Right</option>
          <option value="rtl">Right to Left</option>
        </select>
      </div>
      {field("isSource", "isSource", "checkbox")}
      {field("isPrimary", "isPrimary", "checkbox")}
      {field("digitizedBySefaria", "Digitized by Sefaria", "checkbox")}
      {field("priority", "Priority")}
      {field("status", "Locked", "checkbox")}
      {field("versionNotes", "VersionNotes", "textarea")}
      {field("versionNotesInHebrew", "Hebrew VersionNotes", "textarea")}
      <h3 className={styles.heading}>Purchase Information</h3>
      {field("purchaseInformationURL", "Buy URL (Link to Store Item):")}
      {field("purchaseInformationImage", "Buy Image (Image to Display for Link)")}
      <div className={styles.actions}>
        <button type="button" className={styles.delete} onClick={() => void remove()} disabled={busy}>Delete Version</button>
        <button type="submit" className={styles.save} disabled={busy}>SAVE</button>
      </div>
    </form>
  );
}
