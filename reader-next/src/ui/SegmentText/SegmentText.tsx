import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { VocalizationMode } from "@vendor/sefaria-toolkit/text-transform/index";
import { highlightTerms } from "~/lib/text/highlight-terms";
import { prepareSegmentHtml, type PrepareOptions } from "~/lib/text/prepare";
import { useLibraryHref } from "~/lib/routing/library-href";
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
 * real links, footnote markers open their note in place after the marker, and every inline construct Sefaria
 * uses (poetry, page overlays, itags, ketiv/qere, petuchah marks) is styled.
 *
 * Replaces the old TextSegment content path (VersionContent / ContentText / addPoetrySpans / formatItag).
 *
 * @feature TXD-020 @feature TXD-021 @feature TXD-025 @feature TXD-027 @feature TXD-028 @feature TXD-051
 */
export function SegmentText({ html, lang, dir, vocalization, stripPunctuation, itagCommentator, refHref, terms, onRefClick, onEntityClick, className }: SegmentTextProps) {
  const libHref = useLibraryHref();
  const prepared = useMemo(() => {
    const p = prepareSegmentHtml(html, { vocalization, stripPunctuation, lang, itagCommentator, refHref, topicHref: (slug) => libHref(`/topics/${slug}`), categoryHref: (path) => libHref(`/texts/${path}`), siteHref: libHref });
    return terms?.length ? { ...p, html: highlightTerms(p.html, terms) } : p;
  }, [html, lang, vocalization, stripPunctuation, itagCommentator, refHref, terms, libHref]);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  // An open note is read in place, right after its marker, as sefaria.org's .segment i.footnote (inline, 0.8em, #666; measured
  // 2026-11-18 on Genesis 1:1 at 375 and 1280): the note's (sanitised) HTML goes into the text after the marker.
  const shownHtml = useMemo(() => {
    let h = prepared.html;
    for (const n of prepared.notes) {
      if (!open.has(n.key)) continue;
      h = h.replace(new RegExp(`(<sup[^>]*data-note="${n.key}"[^>]*>[\\s\\S]*?</sup>)`), (m) => `${m}<i class="footnote" role="note">${n.contentHtml ?? ""}</i>`);
    }
    return h;
  }, [prepared, open]);
  // the text is re-rendered when a note opens or closes: a marker that had the focus gets it back
  const refocus = useRef<number | null>(null);

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
      if (document.activeElement === marker) refocus.current = Number(marker.dataset.note);
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
    refocus.current = Number(marker.dataset.note);
    toggle(Number(marker.dataset.note));
  };

  // Keep the markers' aria-expanded in step with state (the markers live inside a string of HTML). An effect on what it depends on,
  // not a new callback ref per render — that re-ran querySelectorAll on every render of every segment.
  const markerRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    markerRef.current?.querySelectorAll<HTMLElement>("[data-note]").forEach((m) => m.setAttribute("aria-expanded", String(open.has(Number(m.dataset.note)))));
    if (refocus.current !== null) {
      markerRef.current?.querySelector<HTMLElement>(`[data-note="${refocus.current}"]`)?.focus({ preventScroll: true });
      refocus.current = null;
    }
  }, [open, shownHtml]);

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
        dangerouslySetInnerHTML={{ __html: shownHtml }}
      />
    </>
  );
}
