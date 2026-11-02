import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { entriesForCategories, lexiconQueryOptions, type EntrySense } from "~/lib/lexicon/lookup";
import { FloatingCard, FloatingCardAction, FloatingCardFooter, FloatingCardHeader } from "~/ui/FloatingCard/FloatingCard";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import styles from "./DefinitionCard.module.css";

const WIDTH = 320;
const MARGIN = 12;
const GAP = 6;
const MAX_ENTRIES = 3;
const MAX_CHARS = 220;

/** Definitions are HTML strings, or (some lexicons) lists of them. */
const plain = (html: unknown): string =>
  (Array.isArray(html) ? html.map(plain).join("; ") : typeof html === "string" ? html : "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
function firstDefinition(s: EntrySense | undefined): string {
  if (!s) return "";
  return plain(s.definition) || s.senses?.map(firstDefinition).find(Boolean) || "";
}

export interface DefinitionRequest {
  words: string;
  /** The segment the words are in (narrows the lookup, as the dictionary sidebar does). */
  segmentRef: string;
  /** Where the words are on screen (viewport coordinates). */
  anchor: { left: number; top: number; bottom: number };
  /** Asked for from the menu: says so when nothing is found, instead of staying silent. */
  explicit: boolean;
}

export interface DefinitionCardProps extends DefinitionRequest {
  /** The text's categories: dictionaries restricted to other kinds of text are left out. */
  categories: readonly string[];
  onClose: () => void;
  onOpenDictionary: () => void;
}

/**
 * The meaning of words the reader selected, in a small card beside them. Shows nothing until a definition arrives, and
 * nothing at all when there is none (unless the lookup was explicit). Closes on a click elsewhere, Escape or scrolling.
 */
export function DefinitionCard({ words, segmentRef, anchor, explicit, categories, onClose, onOpenDictionary }: DefinitionCardProps) {
  const q = useQuery(lexiconQueryOptions(words, segmentRef));
  const he = useInterfaceLang() === "hebrew";
  const ref = useRef<HTMLDivElement>(null);
  const entries = q.data
    ? entriesForCategories(q.data, categories)
        .map((e) => ({ key: `${e.parent_lexicon}|${e.headword}`, headword: e.headword, lexicon: e.parent_lexicon_details.name ?? e.parent_lexicon, meaning: firstDefinition(e.content) }))
        .filter((e) => e.meaning)
        .slice(0, MAX_ENTRIES)
    : undefined;

  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    const opened = performance.now();
    const scrolled = (e: Event) => {
      if (performance.now() - opened > 400 && !ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const found = !!entries?.length;
  if (typeof document === "undefined" || (!found && !explicit)) return null;

  const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - WIDTH - MARGIN));
  const below = window.innerHeight - anchor.bottom > 220 || anchor.top < 220;
  const position = below ? { left, top: anchor.bottom + GAP } : { left, bottom: window.innerHeight - anchor.top + GAP };

  return createPortal(
    <FloatingCard ref={ref} className={styles.card} aria-label={he ? `הגדרה: ${words}` : `Definition of ${words}`} style={position} data-definition-card>
      <FloatingCardHeader onClose={onClose}>
        <span className={styles.words} lang="he" dir="rtl">{words}</span>
      </FloatingCardHeader>
      {found ? (
        <ul className={styles.entries}>
          {entries!.map((e) => (
            <li key={e.key} className={styles.entry}>
              <span className={styles.headword} lang="he" dir="rtl">{e.headword}</span>
              <span className={styles.meaning}>{e.meaning.length > MAX_CHARS ? `${e.meaning.slice(0, MAX_CHARS)}…` : e.meaning}</span>
              <span className={styles.source}>{e.lexicon}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{q.isPending ? <InterfaceText en="Looking up…" he="מחפש…" /> : q.isError ? <InterfaceText en="The dictionary could not be reached." he="לא ניתן להתחבר למילון." /> : <InterfaceText en="No definition found." he="לא נמצאה הגדרה." />}</p>
      )}
      <FloatingCardFooter>
        <FloatingCardAction icon="book" onClick={() => (onClose(), onOpenDictionary())}>
          <InterfaceText en="Open in dictionary" he="פתיחה במילון" />
        </FloatingCardAction>
      </FloatingCardFooter>
    </FloatingCard>,
    document.body,
  );
}
