import { useEffect, useId, useState, type ReactNode } from "react";
import { assignAt, type LexiconIdentity } from "~/lib/lexicon/admin";
import { LoadingState } from "../Feedback/Feedback";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { WysiwygField, type RefLink } from "./WysiwygField";
import styles from "./LexiconEditView.module.css";

type Message = { en: string; he: string };

/** The old LexiconEntryEditBox: the lexicon's name over the tool, or why the tool can't be used here. */
function EntryBox({ identity, children }: { identity: LexiconIdentity | null | undefined; children: (id: LexiconIdentity) => ReactNode }) {
  if (identity === undefined) return <LoadingState />;
  if (identity === null) {
    return (
      <div className={styles.box}>
        <InterfaceText en="This tool is only available while viewing a lexicon entry." he="כלי זה זמין רק בעת צפייה בערך מילוני." />
      </div>
    );
  }
  return (
    <div className={styles.box}>
      <div className={styles.lexiconName}>{identity.lexiconName}</div>
      {children(identity)}
    </div>
  );
}

function SaveButton({ onSave, saving, disabled, message }: { onSave: () => void; saving: boolean; disabled?: boolean; message: Message | null }) {
  return (
    <>
      <button type="button" className={styles.save} onClick={onSave} disabled={saving || disabled}>
        <InterfaceText en="Save" he="שמירה" />
      </button>
      {message ? (
        <div className={styles.saved} role="status">
          <InterfaceText en={message.en} he={message.he} />
        </div>
      ) : null}
    </>
  );
}

export interface LexiconHeadwordEditProps {
  /** undefined while resolving which entry this is; null when the reader is not on a dictionary entry. */
  identity: LexiconIdentity | null | undefined;
  /** Renames, answering the headword as saved; rejects with the server's message. */
  onRename: (identity: LexiconIdentity, newHeadword: string) => Promise<string>;
}

/**
 * Advanced → "Change Lexicon Headword" for moderators, as the old LexiconHeadwordEditBox: the current headword, a "New
 * headword" box, Save, and "Saved as …" (with "adjusted from …" when the server changed what was typed).
 *
 * @feature CON-072 Edit a dictionary entry (moderator)
 */
export function LexiconHeadwordEdit({ identity, onRename }: LexiconHeadwordEditProps) {
  return <EntryBox identity={identity}>{(id) => <HeadwordForm key={`${id.lexiconName}|${id.headword}`} identity={id} onRename={onRename} />}</EntryBox>;
}

function HeadwordForm({ identity, onRename }: { identity: LexiconIdentity; onRename: LexiconHeadwordEditProps["onRename"] }) {
  const inputId = useId();
  const [saved, setSaved] = useState(identity.headword);
  const [value, setValue] = useState(identity.headword);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  const typed = value.trim();
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const headword = await onRename({ ...identity, headword: saved }, value);
      setMessage(
        headword === typed
          ? { en: `Saved as "${headword}".`, he: `נשמר בתור "${headword}".` }
          : { en: `Saved as "${headword}" (adjusted from "${typed}").`, he: `נשמר בתור "${headword}" (הותאם מ"${typed}").` },
      );
      setSaved(headword);
      setValue(headword);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <div className={styles.headword}>{saved}</div>
      <label className={styles.label} htmlFor={inputId}>
        <InterfaceText en="New headword" he="ערך ראשי חדש" />
      </label>
      <input id={inputId} type="text" className={styles.input} value={value} onChange={(e) => setValue(e.target.value)} disabled={saving} />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <SaveButton onSave={() => void save()} saving={saving} disabled={!typed || typed === saved} message={message} />
    </div>
  );
}

export interface LexiconContentEditProps {
  identity: LexiconIdentity | null | undefined;
  /** The entry's editable content (its content_attr_names), or an error message; undefined while loading. */
  draft: Record<string, unknown> | string | undefined;
  onSave: (identity: LexiconIdentity, content: Record<string, unknown>) => Promise<void>;
  resolveRef: (text: string) => Promise<RefLink>;
}

/**
 * Advanced → "Edit Lexicon Content" for moderators, as the old LexiconContentEditBox: the entry's content fields as a tree
 * (keys shown, never added, removed or renamed), each string a WysiwygField, and Save, which sends the whole draft.
 *
 * @feature CON-072 Edit a dictionary entry (moderator)
 */
export function LexiconContentEdit({ identity, draft, onSave, resolveRef }: LexiconContentEditProps) {
  return (
    <EntryBox identity={identity}>
      {(id) =>
        typeof draft === "string" ? (
          <p className={styles.error} role="alert">{draft}</p>
        ) : draft === undefined ? (
          <LoadingState />
        ) : (
          <ContentForm key={`${id.lexiconName}|${id.headword}`} identity={id} initial={draft} onSave={onSave} resolveRef={resolveRef} />
        )
      }
    </EntryBox>
  );
}

function ContentForm({ identity, initial, onSave, resolveRef }: { identity: LexiconIdentity; initial: Record<string, unknown>; onSave: LexiconContentEditProps["onSave"]; resolveRef: LexiconContentEditProps["resolveRef"] }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(initial), [initial]);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(identity, value);
      setMessage({ en: "Saved.", he: "נשמר." });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <div className={styles.headword}>{identity.headword}</div>
      <div className={styles.tree} role="tree" aria-label={identity.headword}>
        {Object.entries(value).map(([k, v]) => (
          <Node key={k} name={k} value={v} path={[k]} onChange={(path, html) => setValue((cur) => assignAt(cur, path, html))} resolveRef={resolveRef} />
        ))}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <SaveButton onSave={() => void save()} saving={saving} message={message} />
    </div>
  );
}

function Node({ name, value, path, onChange, resolveRef }: {
  name: string;
  value: unknown;
  path: (string | number)[];
  onChange: (path: (string | number)[], html: string) => void;
  resolveRef: (text: string) => Promise<RefLink>;
}) {
  const [open, setOpen] = useState(true);
  if (value && typeof value === "object") {
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
    return (
      <div className={styles.node} role="treeitem" aria-expanded={open}>
        <button type="button" className={styles.key} onClick={() => setOpen((o) => !o)}>
          {open ? "▾" : "▸"} {name} <span className={styles.count}>{entries.length} {entries.length === 1 ? "item" : "items"}</span>
        </button>
        {open ? (
          <div className={styles.children} role="group">
            {entries.map(([k, v]) => (
              <Node key={k} name={k} value={v} path={[...path, Array.isArray(value) ? Number(k) : k]} onChange={onChange} resolveRef={resolveRef} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className={styles.leaf} role="treeitem">
      <span className={styles.key}>{name}</span>
      {typeof value === "string" ? (
        <WysiwygField value={value} onChange={(html) => onChange(path, html)} resolveRef={resolveRef} label={path.join(".")} />
      ) : (
        <span className={styles.scalar}>{String(value)}</span>
      )}
    </div>
  );
}
