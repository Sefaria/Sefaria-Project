import { useQuery } from "@tanstack/react-query";
import { lexiconQueryOptions, type EntrySense } from "~/lib/lexicon/lookup";
import styles from "./GlossCard.module.css";

/** Definitions are HTML strings, or (some lexicons) lists of them. */
const plain = (html: unknown): string =>
  (Array.isArray(html) ? html.map(plain).join("; ") : typeof html === "string" ? html : "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
function firstDefinition(s: EntrySense | undefined): string {
  if (!s) return "";
  return plain(s.definition) || s.senses?.map(firstDefinition).find(Boolean) || "";
}

/** The meaning of a glossed word, shown beside it while the pointer is on it. */
export function GlossCard({ word, segmentRef, rect }: { word: string; segmentRef?: string; rect: DOMRect }) {
  const q = useQuery(lexiconQueryOptions(word, segmentRef));
  const entries = (q.data ?? []).map((e) => ({ headword: e.headword, lexicon: e.parent_lexicon, meaning: firstDefinition(e.content) })).filter((e) => e.meaning).slice(0, 2);
  const top = rect.bottom + 6 + 120 > window.innerHeight ? rect.top - 6 : rect.bottom + 6;
  return (
    <div className={styles.card} role="tooltip" style={{ left: Math.min(rect.left, window.innerWidth - 300), top, translate: top < rect.top ? "0 -100%" : undefined }}>
      {q.isPending ? <span className={styles.muted}>…</span> : entries.length ? (
        entries.map((e) => (
          <p key={e.lexicon + e.headword} className={styles.entry}>
            <strong lang="he">{e.headword}</strong> {e.meaning.length > 160 ? `${e.meaning.slice(0, 160)}…` : e.meaning}
            <span className={styles.muted}> · {e.lexicon}</span>
          </p>
        ))
      ) : (
        <span className={styles.muted}>No dictionary entry for “{word}”</span>
      )}
    </div>
  );
}
