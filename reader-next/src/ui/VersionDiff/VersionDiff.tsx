/**
 * The version-diff tool (/compare), drawn as sefaria.org draws it: a bare staff page in the browser's own styles (compare.html has no
 * site header and no site stylesheet), with the filter checkboxes, the Ref / Language / Version form, one table per section with each
 * segment of the two versions side by side, the changes coloured, and "Load Next Chapter".
 *
 * Its words are English in both interface languages, as on sefaria.org (the page was never translated).
 *
 * @feature LEG-010 Text version diff/compare tool (/compare)
 */
import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { changeMessage, DIFF_FILTERS, type DiffPiece } from "~/lib/compare/diff";
import s from "./VersionDiff.module.css";

/** The page: the filter checkboxes (`checked`) and their "Update" button above everything, then the tool (`children`). */
export function VersionDiffPage({ checked, onFilterToggle, onFilterUpdate, children }: { checked: ReadonlySet<string>; onFilterToggle: (value: string, checked: boolean) => void; onFilterUpdate: () => void; children: ReactNode }) {
  return (
    <div className={s.page} data-compare-page="">
      <div id="filters" className={s.rtl}>
        {DIFF_FILTERS.map((f, i) => (
          <Fragment key={f.value}>
            {i ? " " : null}
            <label>
              <input id={f.id} type="checkbox" value={f.value} checked={checked.has(f.value)} onChange={(e) => onFilterToggle(f.value, e.target.checked)} />
              {f.value}
            </label>
          </Fragment>
        ))}
      </div>
      <div className={s.rtl}>
        <input id="filter" type="button" value="Update" onClick={onFilterUpdate} />
      </div>
      <div id="DiffTable">
        <div>{children}</div>
      </div>
    </div>
  );
}

export interface CompareFormValues {
  secRef: string;
  lang: string;
  v1: string;
  v2: string;
}

/** The old DataForm: Ref, Language, and (when the ref has versions in that language) Version 1 and Version 2, then "Load Diff". */
export function CompareForm({ values, versionOptions, onChange, onSubmit }: { values: CompareFormValues; versionOptions: readonly string[] | null; onChange: (field: keyof CompareFormValues, value: string) => void; onSubmit: () => void }) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  const options = versionOptions?.map((v) => (
    <option value={v} key={v}>
      {v}
    </option>
  ));
  return (
    <form onSubmit={submit}>
      <label>
        Ref:
        <input name="secRef" type="text" value={values.secRef} onChange={(e) => onChange("secRef", e.target.value)} style={{ width: "300px" }} autoComplete="off" />
      </label>
      <label>
        Language:
        <select name="lang" value={values.lang} onChange={(e) => onChange("lang", e.target.value)}>
          <option value="he">Hebrew</option>
          <option value="en">English</option>
        </select>
      </label>
      {options ? (
        <>
          <label>
            Version 1:
            <select name="v1" value={values.v1} onChange={(e) => onChange("v1", e.target.value)}>
              <option value="">Select a Version</option>
              {options}
            </select>
          </label>
          <label>
            Version 2:
            <select name="v2" value={values.v2} onChange={(e) => onChange("v2", e.target.value)}>
              <option value="">Select a Version</option>
              {options}
            </select>
          </label>
        </>
      ) : null}
      <br />
      <input type="submit" value="Load Diff" />
    </form>
  );
}

export interface DiffRowModel {
  segRef: string;
  /** null while the row's texts are loading. */
  v1: DiffPiece[] | null;
  v2: DiffPiece[] | null;
}

export interface DiffEditing {
  /** A click on a change: may it be edited? (Says why not itself.) */
  canEdit: () => Promise<boolean>;
  /** Apply a change: the segment, which side ("v1" | "v2"), the piece and its replacement. */
  apply: (segRef: string, side: "v1" | "v2", index: number, replacement: string) => void;
}

/** The old DiffTable: a header row (section, version 1, version 2) and one row per segment. `rows` null while the texts load. */
export function DiffTable({ secRef, v1, v2, lang, rows, filters, editing }: { secRef: string; v1: string; v2: string; lang: string; rows: readonly DiffRowModel[] | null; filters: ReadonlySet<string>; editing?: DiffEditing }) {
  if (!rows) return <div>Loading Text...</div>;
  return (
    <table className={s.table} data-diff-table={secRef}>
      <thead>
        <tr>
          <td>{secRef}</td>
          <td>{v1}</td>
          <td>{v2}</td>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) =>
          r.v1 && r.v2 ? (
            <tr key={r.segRef} data-seg-ref={r.segRef}>
              <td>{r.segRef}</td>
              <DiffCell pieces={r.v1} lang={lang} filters={filters} onEdit={editing ? { canEdit: editing.canEdit, apply: (i, t) => editing.apply(r.segRef, "v1", i, t) } : undefined} />
              <DiffCell pieces={r.v2} lang={lang} filters={filters} onEdit={editing ? { canEdit: editing.canEdit, apply: (i, t) => editing.apply(r.segRef, "v2", i, t) } : undefined} />
            </tr>
          ) : (
            <tr key={r.segRef}>
              <td>Loading...</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

function DiffCell({ pieces, lang, filters, onEdit }: { pieces: DiffPiece[]; lang: string; filters: ReadonlySet<string>; onEdit?: { canEdit: () => Promise<boolean>; apply: (index: number, replacement: string) => void } }) {
  return (
    <td className={lang === "he" ? s.he : lang === "en" ? s.en : undefined}>
      {pieces.map((p, i) =>
        p[0] === 0 ? (
          <span key={i}>{p[1]}</span>
        ) : p[0] === 1 ? (
          <DiffElement key={i} text={p[1]} toText={p[2]} filtered={filters.has(p[1])} onEdit={onEdit ? { canEdit: onEdit.canEdit, apply: (t) => onEdit.apply(i, t) } : undefined} />
        ) : (
          <span key={i} className={`${s.del} ${filters.has(p[1]) ? s.filtered : ""}`} data-diff="del">
            {p[1]}
          </span>
        ),
      )}
    </td>
  );
}

/** The old DiffElement: a change that can be applied; hover says what a click does, a click (moderators) opens the change dialog. */
function DiffElement({ text, toText, filtered, onEdit }: { text: string; toText: string; filtered: boolean; onEdit?: { canEdit: () => Promise<boolean>; apply: (replacement: string) => void } }) {
  const [hover, setHover] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [replacement, setReplacement] = useState(toText);
  const open = async () => {
    if (confirmOpen || !onEdit) return;
    if (await onEdit.canEdit()) {
      setConfirmOpen(true);
      setHover(false);
    }
  };
  const close = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setConfirmOpen(false);
    setHover(false);
  };
  return (
    <span className={`${s.ins} ${filtered ? s.filtered : ""}`} data-diff="ins" onMouseOver={() => !confirmOpen && setHover(true)} onMouseOut={() => setHover(false)} onClick={open}>
      {text ? text : " "}
      {hover ? <span className={s.change}>{changeMessage(text, toText)}</span> : null}
      {confirmOpen ? (
        <div className={s.changeDialog} role="dialog" aria-label="Change">
          Changing {text} to {replacement}
          <br />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit?.apply(replacement);
            }}
          >
            <label>
              Replacement Text:
              <input type="text" value={replacement} onChange={(e) => setReplacement(e.target.value)} autoComplete="off" />
            </label>
            <br />
            <input type="submit" value="Apply Change" />
            <input
              type="reset"
              value="Reset"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setReplacement(toText);
              }}
            />
            <input type="button" value="Cancel" onClick={close} />
          </form>
        </div>
      ) : null}
    </span>
  );
}

/** The old page's "Load Next Chapter" button. */
export function NextChapterButton({ onClick }: { onClick: () => void }) {
  return <input type="button" value="Load Next Chapter" onClick={onClick} />;
}
