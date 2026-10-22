import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { VocalizationMode } from "@vendor/sefaria-toolkit/text-transform/index";
import { highlightTerms } from "~/lib/text/highlight-terms";
import { prepareSegmentHtml, type PrepareOptions } from "~/lib/text/prepare";
import styles from "./SegmentText.module.css";

export interface SegmentTextProps {
  /** Raw HTML of one segment in one version, straight from the API. */
  html: string;
  /** Language code of this version (actualLanguage), used for `lang` and itag numerals. */
  lang: string;
  dir: "rtl" | "ltr";
  vocalization?: VocalizationMode;
  /** Remove Talmud punctuation (Hebrew side of Talmud when the reader has punctuation off). */
  stripPunctuation?: boolean;
  /** Commentator whose in-text markers should be shown (while a connections filter is active). */
  itagCommentator?: string;
  refHref?: PrepareOptions["refHref"];
  /** Words a search matched: wrapped in a highlight (SRC-058). */
  terms?: readonly string[];
  /** Called for a plain left-click on a citation; omit to let the link navigate normally. */
  onRefClick?: (ref: string, event: MouseEvent) => void;
  onEntityClick?: (slug: string, event: MouseEvent) => void;
  className?: string;
}

const isPlainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/**
 * The text of one segment in one version. Takes raw API HTML and renders it safely: citations are
 * real links, footnote markers open their note below the text, and every inline construct Sefaria
 * uses (poetry, page overlays, itags, ketiv/qere, petuchah marks) is styled.
 *
 * Replaces the old TextSegment content path (VersionContent / ContentText / addPoetrySpans / formatItag).
 *
 * @feature TXD-020 @feature TXD-021 @feature TXD-025 @feature TXD-027 @feature TXD-028 @feature TXD-051
 */
export function SegmentText({ html, lang, dir, vocalization, stripPunctuation, itagCommentator, refHref, terms, onRefClick, onEntityClick, className }: SegmentTextProps) {
  const prepared = useMemo(() => {
    const p = prepareSegmentHtml(html, { vocalization, stripPunctuation, lang, itagCommentator, refHref });
    return terms?.length ? { ...p, html: highlightTerms(p.html, terms) } : p;
  }, [html, lang, vocalization, stripPunctuation, itagCommentator, refHref, terms]);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());

  const toggle = (key: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // Event delegation: the HTML is a string, so markers and links are handled at the container.
  const onClick = (e: MouseEvent<HTMLSpanElement>) => {
    const target = e.target as Element;
    const marker = target.closest<HTMLElement>("[data-note]");
    if (marker) {
      e.preventDefault();
      e.stopPropagation();
      toggle(Number(marker.dataset.note));
      return;
    }
    const ref = target.closest<HTMLAnchorElement>("a.ref-link");
    if (ref && onRefClick && isPlainClick(e)) {
      e.preventDefault();
      e.stopPropagation();
      onRefClick(ref.dataset.sefariaRef ?? "", e);
      return;
    }
    const entity = target.closest<HTMLAnchorElement>("a.entity-link");
    if (entity && onEntityClick && isPlainClick(e)) {
      e.preventDefault();
      e.stopPropagation();
      onEntityClick(entity.dataset.slug ?? entity.getAttribute("href")!.replace(/^.*\/topics\//, ""), e);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const marker = (e.target as Element).closest<HTMLElement>("[data-note]");
    if (!marker) return;
    e.preventDefault();
    e.stopPropagation();
    toggle(Number(marker.dataset.note));
  };

  // Keep the markers' aria-expanded in step with state (the markers live inside a string of HTML).
  const markerRef = (el: HTMLSpanElement | null) => {
    el?.querySelectorAll<HTMLElement>("[data-note]").forEach((m) => m.setAttribute("aria-expanded", String(open.has(Number(m.dataset.note)))));
  };

  const openNotes = prepared.notes.filter((n) => open.has(n.key));
  return (
    <>
      <span
        ref={markerRef}
        className={[styles.text, className].filter(Boolean).join(" ")}
        lang={lang}
        dir={dir}
        onClick={onClick}
        onKeyDown={onKeyDown}
        // Safe: produced by prepareSegmentHtml (sanitiser with a fixed output grammar).
        dangerouslySetInnerHTML={{ __html: prepared.html }}
      />
      {openNotes.length > 0 ? (
        <span className={styles.notes} role="note" lang={lang} dir={dir}>
          {openNotes.map((n) => (
            <p key={n.key}>
              <span className={styles.noteLabel} dangerouslySetInnerHTML={{ __html: n.markerHtml }} />
              <span dangerouslySetInnerHTML={{ __html: n.contentHtml ?? "" }} />
            </p>
          ))}
        </span>
      ) : null}
    </>
  );
}
