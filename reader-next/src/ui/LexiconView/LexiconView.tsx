import type { MouseEvent } from "react";
import type { Completion } from "~/lib/lexicon/completion";
import type { LexiconEntryData } from "~/lib/lexicon/lookup";
import { DictionarySearch } from "../DictionarySearch/DictionarySearch";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LexiconEntry } from "../LexiconEntry/LexiconEntry";
import styles from "./LexiconView.module.css";

export interface LexiconViewProps {
  /** The words being looked up (selected in the text, or typed). */
  words?: string;
  /** Entries to show, already filtered for the text's category. Undefined while loading. */
  entries?: readonly LexiconEntryData[];
  /** A lookup is running. */
  loading?: boolean;
  /** The words were typed into the box (so the empty message names them). */
  onSearch?: (word: string) => void;
  /** Completions for the box (all dictionaries); without them the box still takes a word, with no list. */
  getCompletions?: (term: string, signal: AbortSignal) => Promise<readonly Completion[]>;
  onCitation?: (ref: string, e: MouseEvent) => void;
  onEntry?: (ref: string, e: MouseEvent) => void;
}

/**
 * The Lexicon sidebar: a search box and the definitions for the words selected in the text (or typed), from each
 * dictionary that applies. "Looking up words…" while loading; 'No definitions found for "…".' when nothing
 * matches. The box is the dictionary search: completions as you type, and the Hebrew keyboard in the English interface.
 *
 * @feature CON-042 Lexicon auto-activation on word selection
 * @feature CON-043 Lexicon lookup and filtering
 * @feature CON-044 Dictionary entry rendering
 */
const NO_COMPLETIONS = async () => [] as Completion[];
export function LexiconView({ words, entries, loading, onSearch, getCompletions = NO_COMPLETIONS, onCitation, onEntry }: LexiconViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.search}><DictionarySearch getCompletions={getCompletions} onSubmit={(w) => onSearch?.(w)} /></div>
      <div className={styles.results} aria-live="polite">
        {loading ? (
          <p className={styles.message} role="status"><InterfaceText en="Looking up words..." he="מחפש מילים..." /></p>
        ) : entries && entries.length === 0 && words ? (
          <p className={styles.message}><InterfaceText en={`No definitions found for "${words}".`} he={`לא נמצאו תוצאות "${words}".`} /></p>
        ) : (
          entries?.map((e, i) => <LexiconEntry key={`${e.parent_lexicon}-${i}`} entry={e} onCitation={onCitation} onEntry={onEntry} />)
        )}
      </div>
    </div>
  );
}
