import { useId, useState, type MouseEvent } from "react";
import { otherRefs, type Finding, type FindingGroup } from "~/lib/connections/findings";
import { LoadingState } from "../Feedback/Feedback";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LangText } from "../LangText/LangText";
import { Link } from "../Link/Link";
import styles from "./FindingsView.module.css";

export interface FindingsViewProps {
  /** The findings on the selection, grouped by method (lib/connections/findings groupByMethod). */
  groups: readonly FindingGroup[];
  loading?: boolean;
  /** The selected segments: a finding's cited passages leave them out. */
  selectedRefs: readonly string[];
  /** A cited passage in the reader (a real link). */
  refHref: (ref: string) => string;
  /** Opening a cited passage (a plain click); without it the link navigates. */
  onOpenRef?: (ref: string, e: MouseEvent) => void;
}

/** A conclusion longer than this is clamped to a few lines, with Show more. */
const CLAMP_CHARS = 240;

const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/**
 * What learners found with the Library Assistant's skills on the selected passage, grouped by method: each finding's title, its
 * conclusion (clamped, with Show more), its label (the attribution, always shown), the other passages it cites, and links to its sheet
 * and its page. The finding's own words are the service's, shown with dir="auto".
 *
 * @feature CON-073 Findings anchored to this text
 * @feature CON-074 Finding list items
 */
export function FindingsView({ groups, loading, selectedRefs, refHref, onOpenRef }: FindingsViewProps) {
  if (loading && !groups.length) return <LoadingState />;
  if (!groups.length) {
    return (
      <p className={styles.message}>
        <InterfaceText en="No findings known here." he="אין ממצאים ידועים כאן." />
      </p>
    );
  }
  return (
    <div className={styles.view}>
      {groups.map((g) => (
        <section key={g.method.slug} className={styles.group} aria-labelledby={`finding-method-${g.method.slug}`}>
          <h3 id={`finding-method-${g.method.slug}`} className={styles.method}>
            <InterfaceText en={g.method.title.en} he={g.method.title.he} />
          </h3>
          <ul className={styles.list}>
            {g.findings.map((f) => (
              <FindingItem key={f.id} finding={f} cited={otherRefs(f, selectedRefs)} refHref={refHref} onOpenRef={onOpenRef} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FindingItem({ finding: f, cited, refHref, onOpenRef }: { finding: Finding; cited: string[]; refHref: (ref: string) => string; onOpenRef?: (ref: string, e: MouseEvent) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = f.conclusion.length > CLAMP_CHARS;
  return (
    <li className={styles.finding} data-finding={f.id}>
      <h4 className={styles.title} dir="auto">{f.title}</h4>
      <p id={id} className={styles.conclusion} data-clamped={long && !open ? "true" : undefined} dir="auto">
        {f.conclusion}
      </p>
      {long ? (
        <button type="button" className={styles.more} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          <InterfaceText en={open ? "Show less" : "Show more"} he={open ? "הצג פחות" : "הצג עוד"} />
        </button>
      ) : null}
      <p className={styles.label} dir="auto">{f.label}</p>
      {cited.length ? (
        <div className={styles.cites}>
          <InterfaceText en="Cites" he="מקורות" />:{" "}
          {cited.map((r, i) => (
            <span key={r}>
              {i ? ", " : null}
              <Link href={refHref(r)} onClick={onOpenRef ? (e) => { if (plainClick(e)) { e.preventDefault(); onOpenRef(r, e); } } : undefined}>
                <LangText lang="en">{r}</LangText>
              </Link>
            </span>
          ))}
        </div>
      ) : null}
      {f.sheetUrl || f.url ? (
        <div className={styles.links}>
          {f.sheetUrl ? (
            <a href={f.sheetUrl} target="_blank" rel="noopener noreferrer">
              <InterfaceText en="Open sheet" he="פתיחת דף המקורות" />
            </a>
          ) : null}
          {f.url ? (
            <a href={f.url} target="_blank" rel="noopener noreferrer">
              <InterfaceText en="View finding" he="צפייה בממצא" />
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
