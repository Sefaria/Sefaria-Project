import type { MouseEvent, ReactNode } from "react";
import { sanitizeHtml } from "~/lib/html/sanitize";
import type { AltHeadword, EntrySense, LexiconEntryData } from "~/lib/lexicon/lookup";
import { refToUrl } from "~/lib/ref/url";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./LexiconEntry.module.css";

export interface LexiconEntryProps {
  entry: LexiconEntryData;
  /** A citation inside the definition was clicked ("Genesis 1:1"). */
  onCitation?: (ref: string, e: MouseEvent) => void;
  /** The entry itself was clicked: open the dictionary entry as a text ("Jastrow, בְּרֵאשִׁית"). */
  onEntry?: (ref: string, e: MouseEvent) => void;
}

const BDB = /^BDB.*?Dict/;
/** Dictionary markup keeps its citations' `data-ref` (and the old `refLink` class) so they can be clicked. */
const html = (s: string) => sanitizeHtml(s, { keepAttributes: { a: ["class", "data-ref"] } });
const Html = ({ value, className, as: Tag = "span" }: { value: string; className?: string; as?: "span" | "div" }) => (
  <Tag className={className} dangerouslySetInnerHTML={{ __html: html(value) }} />
);

function interleave(items: ReactNode[], sep: string): ReactNode[] {
  return items.flatMap((x, i) => (i === 0 ? [x] : [sep, x]));
}

/** Ordinary dictionaries: the headword and its other spellings, comma separated, right to left. */
function defaultHeadwords(e: LexiconEntryData): ReactNode {
  const words = [e.headword, ...(e.alt_headwords ?? []).map((a) => (typeof a === "string" ? a : a.word))];
  return interleave(words.map((w, i) => <span className={styles.headword} key={i} dir="rtl">{w}</span>), ", ");
}

/**
 * BDB marks its headwords: ‡ peculiar, † all cited, an ordinal, the occurrence count as a subscript, the other
 * forms with their counts, and brackets around all of them or the first word. (Old bdbHeadwordString, including
 * its quirk of showing `occurrences` only when `occurrence` is set.)
 */
function bdbHeadwords(e: LexiconEntryData): ReactNode {
  const hw = <span dir="rtl">{e.headword.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]*$/, "")}</span>;
  const occurrences = e.occurrence ? <sub>{e.occurrences}</sub> : null;
  const alts = (e.alt_headwords ?? []).map((a, i) => {
    const alt = a as AltHeadword;
    return <span key={i}>, <span dir="rtl">{alt.word}</span>{alt.occurrences !== undefined ? <sub>{alt.occurrences}</sub> : null}</span>;
  });
  const all = e.headword_suffix ? (
    <span>[{hw}<span className={styles.suffix} dangerouslySetInnerHTML={{ __html: html(e.headword_suffix) }} />]{occurrences}</span>
  ) : e.brackets === "all" ? (
    <span>[{hw}{occurrences}{alts}]</span>
  ) : e.brackets === "first_word" ? (
    <span>[{hw}{occurrences}]{alts}</span>
  ) : (
    <span>{hw}{occurrences}{alts}</span>
  );
  return (
    <span className={styles.headword}>
      {e.peculiar ? "‡ " : ""}
      {e.all_cited ? "† " : ""}
      {e.ordinal ? `${e.ordinal} ` : ""}
      {all}
    </span>
  );
}

/** What a sense says: its grammar, definition, alternative and notes. */
function SenseBody({ s }: { s: EntrySense }) {
  return (
    <>
      {s.grammar ? `(${s.grammar.verbal_stem}) ` : null}
      {s.definition ? <Html value={s.definition} className={styles.def} /> : null}
      {s.alternative ? <Html value={s.alternative} className={styles.alternative} /> : null}
      {s.notes ? <Html value={s.notes} className={styles.notes} /> : null}
    </>
  );
}

/** A numbered list of senses, each of which may nest its own. */
function Senses({ senses }: { senses: EntrySense[] }) {
  return (
    <ol className={styles.senses}>
      {senses.map((s, i) => (
        <li key={i} className={styles.sense}>
          <SenseBody s={s} />
          {s.senses?.length ? <Senses senses={s.senses} /> : null}
        </li>
      ))}
    </ol>
  );
}

/** What leads a BDB sense: a "Note." marker, the number and form in bold, and the occurrence count. */
function BdbLead({ s }: { s: EntrySense }) {
  return (
    <>
      {s.note ? <em>Note. </em> : null}
      {s.pre_num ? `${s.pre_num} ` : null}
      {s.all_cited ? "†" : null}
      <b>{s.num}{s.form}</b>
      {s.occurrences ? <sub>{s.occurrences}</sub> : null}{" "}
    </>
  );
}

/**
 * BDB senses. A sense with a definition is one inline run (its lead, then the text), so the letter and the
 * definition share a line; a sense with sub-senses is a block whose first child carries its lead.
 */
function BdbSense({ s }: { s: EntrySense }) {
  if (s.definition) {
    return (
      <span className={styles.def}>
        <BdbLead s={s} />
        <Html value={s.definition} />
      </span>
    );
  }
  return (
    <div className={styles.bdbSense}>
      {s.senses?.map((c, i) => (
        <div key={i}>{i === 0 ? <BdbLead s={s} /> : null}<BdbSense s={c} /></div>
      ))}
    </div>
  );
}

function Attribution({ d }: { d: LexiconEntryData["parent_lexicon_details"] }) {
  const source = d.source ?? d.source_url;
  const creator = d.attribution ?? d.attribution_url;
  const line = (label: ReactNode, text: string | undefined, href: string | undefined) => {
    if (!text) return null;
    const body = <div>{label} {text}</div>;
    return href ? <a href={href} target="_blank" rel="noopener noreferrer">{body}</a> : body;
  };
  return (
    <div className={styles.attribution}>
      {line(<InterfaceText en="Source:" he="מקור:" />, source, d.source_url)}
      {line(<InterfaceText en="Creator:" he="יוצר:" />, creator, d.attribution_url)}
    </div>
  );
}

/**
 * One dictionary entry: headword(s), morphology and language, the nested senses, end notes and derivatives, and
 * who it comes from. Ordinary dictionaries and BDB are laid out differently, as on the old site (CON-044).
 *
 * @feature CON-044 Dictionary entry rendering
 */
export function LexiconEntry({ entry: e, onCitation, onEntry }: LexiconEntryProps) {
  const d = e.parent_lexicon_details;
  const isBdb = BDB.test(e.parent_lexicon);
  const toLang = d.to_language.slice(0, 2);
  const ref = d.index_title ? `${d.index_title}, ${e.headword}` : "";

  const click = (ev: MouseEvent) => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const cite = (ev.target as Element).closest<HTMLAnchorElement>("a[data-ref]");
    if (cite) {
      ev.preventDefault();
      onCitation?.(cite.dataset.ref!, ev);
    } else if (ref && !(ev.target as Element).closest("a") && onEntry) {
      onEntry(ref, ev);
    }
  };

  return (
    <article className={styles.entry} data-lexicon={e.parent_lexicon} onClick={click}>
      <div className={`${styles.headline} ${styles[toLang] ?? ""}`} dir="ltr">
        {ref ? <a href={`/${refToUrl(ref)}`} className={styles.headlineLink}>{isBdb ? bdbHeadwords(e) : defaultHeadwords(e)}</a> : isBdb ? bdbHeadwords(e) : defaultHeadwords(e)}
        {e.content.morphology ? <span className={styles.morphology}> ({e.content.morphology})</span> : null}
        {e.language_code || e.language_reference ? (
          <span className={styles.lang}> {e.language_code}{e.language_reference ? <Html value={e.language_reference} className={styles.langRef} /> : null}</span>
        ) : null}
      </div>
      <div className={`${styles.definition} ${styles[toLang] ?? ""}`}>
        {isBdb ? <div><BdbSense s={e.content} /></div> : <div><SenseBody s={e.content} />{e.content.senses?.length ? <Senses senses={e.content.senses} /> : null}</div>}
        {e.notes ? <Html value={e.notes} className={styles.endNotes} as="div" /> : null}
        {e.derivatives ? <Html value={e.derivatives} className={styles.endNotes} as="div" /> : null}
      </div>
      <Attribution d={d} />
    </article>
  );
}
