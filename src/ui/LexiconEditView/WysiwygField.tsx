import { useEffect, useRef, useState, type MouseEvent } from "react";
import { sanitizeHtml } from "~/lib/html/sanitize";
import styles from "./LexiconEditView.module.css";

/** What a stored entry's markup uses (LexiconWysiwygValue's display allowlist); `a` keeps its ref attributes. */
const KEEP = { a: ["class", "data-ref", "data-scroll-link"], span: ["class", "dir"] } as const;
const showHtml = (html: string) => sanitizeHtml(html, { keepAttributes: KEEP });

export interface RefLink {
  /** The normalized ref ("Proverbs 4:18"). */
  ref: string;
  /** Its reader address ("/Proverbs.4.18"). */
  href: string;
}

export interface WysiwygFieldProps {
  value: string;
  /** Every change to the field's HTML, as typed (the old commitDraft: the draft is what Save sends). */
  onChange: (html: string) => void;
  /** Resolves a typed reference, or rejects with a message ("Not a recognized Sefaria reference."). */
  resolveRef: (text: string) => Promise<RefLink>;
  label: string;
}

const closestLink = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest("a") ?? null;

/**
 * One string of a dictionary entry, as the old WysiwygValueNode: shown as rendered HTML (click to edit); editing is a
 * contentEditable box with Bold, Italic, Superscript, Subscript and "Ref" (a Sefaria ref link with its own display text,
 * `<a class="refLink" data-ref href>`), and Cancel, which puts the field back. The stored value is edited as it is —
 * sanitizing happens on save, on the server (LexiconEntry._sanitize).
 *
 * @feature CON-072 Edit a dictionary entry (moderator)
 */
export function WysiwygField({ value, onChange, resolveRef, label }: WysiwygFieldProps) {
  const [editing, setEditing] = useState(false);
  const before = useRef(value);
  const box = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState<{ existing: HTMLAnchorElement | null; range: Range | null } | null>(null);

  useEffect(() => {
    if (!editing || !box.current) return;
    before.current = value;
    box.current.innerHTML = value;
    box.current.focus();
    // Enter inserts <br> (the only break the server keeps), not a new block
    document.execCommand?.("defaultParagraphSeparator", false, "br");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the box is filled once per edit, then owned by the browser
  }, [editing]);

  if (!editing) {
    const html = showHtml(value);
    return (
      <div
        className={styles.value}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${label}`}
        onClick={(e) => (e.preventDefault(), setEditing(true))}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setEditing(true))}
      >
        {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span className={styles.placeholder}>(empty)</span>}
      </div>
    );
  }

  const sync = () => box.current && onChange(box.current.innerHTML);
  const exec = (command: string) => {
    box.current?.focus();
    document.execCommand(command);
    sync();
  };
  const openLink = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !box.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
    const range = sel.getRangeAt(0);
    setLink({ existing: closestLink(range.commonAncestorContainer), range: range.cloneRange() });
  };
  // a link inside an editable box still navigates when clicked: open the link form for it instead
  const onBoxClick = (e: MouseEvent) => {
    const a = closestLink(e.target as Node);
    if (!a) return;
    e.preventDefault();
    setLink({ existing: a, range: null });
  };
  const saveLink = (ref: RefLink, text: string) => {
    const a = link?.existing ?? document.createElement("a");
    a.setAttribute("href", ref.href);
    a.setAttribute("data-ref", ref.ref);
    a.setAttribute("class", "refLink");
    a.textContent = text || ref.ref;
    if (!link?.existing && link?.range) {
      link.range.deleteContents();
      link.range.insertNode(a);
    }
    sync();
    setLink(null);
  };
  const removeLink = () => {
    link?.existing?.replaceWith(...Array.from(link.existing.childNodes));
    sync();
    setLink(null);
  };

  return (
    <div className={styles.editWrapper}>
      <div className={styles.toolbar} role="toolbar" aria-label={`Formatting for ${label}`}>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")} aria-label="Bold"><b>B</b></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")} aria-label="Italic"><i>I</i></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("superscript")} aria-label="Superscript">x²</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("subscript")} aria-label="Subscript">x₂</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={openLink} aria-label="Sefaria Ref Link">Ref</button>
      </div>
      <div ref={box} className={styles.editor} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label} onInput={sync} onClick={onBoxClick} />
      <button
        type="button"
        className={styles.cancel}
        onClick={() => {
          onChange(before.current);
          setEditing(false);
        }}
      >
        Cancel
      </button>
      {link ? (
        <RefLinkForm
          initialRef={link.existing?.getAttribute("data-ref") ?? ""}
          initialLabel={link.existing ? link.existing.textContent ?? "" : link.range?.toString() ?? ""}
          canRemove={!!link.existing}
          resolveRef={resolveRef}
          onSave={saveLink}
          onRemove={removeLink}
          onClose={() => setLink(null)}
        />
      ) : null}
    </div>
  );
}

function RefLinkForm({ initialRef, initialLabel, canRemove, resolveRef, onSave, onRemove, onClose }: {
  initialRef: string;
  initialLabel: string;
  canRemove: boolean;
  resolveRef: (text: string) => Promise<RefLink>;
  onSave: (ref: RefLink, label: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [refText, setRefText] = useState(initialRef);
  const [label, setLabel] = useState(initialLabel);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!refText.trim()) return setError("Not a recognized Sefaria reference.");
    try {
      const ref = await resolveRef(refText.trim());
      onSave(ref, label.trim() || ref.ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not a recognized Sefaria reference.");
    }
  };
  return (
    <div className={styles.linkForm} role="group" aria-label="Sefaria ref link">
      <label>
        Reference
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the form opens for this field */}
        <input type="text" value={refText} placeholder="Genesis 1:1" autoFocus onChange={(e) => (setRefText(e.target.value), setError(null))} />
      </label>
      <label>
        Display text
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      <div className={styles.linkActions}>
        <button type="button" onClick={() => void save()}>Save</button>
        {canRemove ? <button type="button" onClick={onRemove}>Remove Link</button> : null}
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
