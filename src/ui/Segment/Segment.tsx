import { memo, type KeyboardEvent, type MouseEvent } from "react";
import type { VocalizationMode } from "@vendor/sefaria-toolkit/text-transform/index";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { linkDotOpacity, numberLang, segmentNumber, visibleSides } from "~/lib/reader/labels";
import type { ContentLanguage } from "~/lib/reader/settings";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { SegmentText, type SegmentTextProps } from "../SegmentText/SegmentText";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import styles from "./Segment.module.css";

export interface SegmentSide {
  html: string;
  /** Language code of the version (actualLanguage). */
  lang: string;
  dir: "rtl" | "ltr";
}

export interface SegmentProps {
  /** Full ref of this segment, e.g. "Genesis 1:3". Used for identity, scrolling and the accessible name. */
  segmentRef: string;
  /** Last address component shown in the gutter ("3", "2a"). Omit to hide the number (e.g. liturgy). */
  address?: string;
  primary?: SegmentSide;
  translation?: SegmentSide;
  language: ContentLanguage;
  vocalization?: VocalizationMode;
  /** Remove Talmud punctuation from the Hebrew side. */
  stripPunctuation?: boolean;
  highlighted?: boolean;
  /** The segment a link pointed at: the column scrolls it to the focus line on arrival. */
  isScrollTarget?: boolean;
  /** Number of connections; drives the dot's opacity. Omit to hide the dot. */
  linkCount?: number;
  itagCommentator?: string;
  /** Words a search matched, highlighted in this segment (SRC-058). */
  terms?: readonly string[];
  /** Activating the segment (click, Enter, Space) opens its connections. */
  onSelect?: (segmentRef: string) => void;
  onRefClick?: SegmentTextProps["onRefClick"];
  onEntityClick?: SegmentTextProps["onEntityClick"];
}

/**
 * One segment of a text: gutter number, connections dot, and one or both versions arranged by the
 * surrounding ReaderSurface (stacked, side by side, or continuous flow).
 *
 * Segments with no visible text render nothing. Replaces the old TextSegment / segment CSS cluster.
 *
 * @feature TXD-043 @feature TXD-045 @feature TXD-047 @feature TXD-049 @feature TXD-050
 */
function SegmentImpl({
  segmentRef, address, primary, translation, language, vocalization, stripPunctuation, highlighted, isScrollTarget, linkCount, itagCommentator, terms,
  onSelect, onRefClick, onEntityClick,
}: SegmentProps) {
  const interfaceLang = useInterfaceLang();
  const hasP = Boolean(primary?.html.trim());
  const hasT = Boolean(translation?.html.trim());
  const sides = visibleSides(language, { primary: hasP, translation: hasT });
  // English-only and the translation has an EMPTY entry for this segment: the row stays, with its number and no text
  // (VERIFIED, Arukh HaShulchan 1:11). A segment past the end of the translation falls back to the Hebrew (1:13).
  const blank = language === "english" && translation !== undefined && !hasT && hasP;
  if (blank) sides.primary = false;
  if (!blank && !sides.primary && !sides.translation) return null;

  const showPrimary = sides.primary && primary;
  const showTranslation = sides.translation && translation;
  const onlyDir = (showPrimary ? primary : (translation ?? primary))!.dir;
  // A segment shown on one side only takes the numeral language of that side (see numberLang rules). A Hebrew PRIMARY on
  // its own in an English/bilingual panel (translation missing) is numbered in English, but a Hebrew TRANSLATION (Zohar's
  // "Hebrew Translation" in English mode) is numbered in Hebrew — VERIFIED on sefaria.org.
  const numLang = !(showPrimary && showTranslation)
    ? showPrimary
      ? onlyDir === "rtl" && language !== "hebrew" ? "en" : onlyDir === "ltr" && language === "hebrew" ? "he" : numberLang(language, interfaceLang)
      : onlyDir === "rtl" ? "he" : numberLang(language, interfaceLang)
    : numberLang(language, interfaceLang);

  const activate = (e: MouseEvent | KeyboardEvent) => {
    if ((e.target as Element).closest("a, [data-note]")) return;
    // The click that ends a drag-selection is part of selecting words, not of choosing the verse (old TextRange).
    if (typeof window !== "undefined" && window.getSelection()?.type === "Range") return;
    onSelect?.(segmentRef);
  };

  const common = { vocalization, itagCommentator, terms, onRefClick, onEntityClick };
  return (
    <div
      className={styles.segment}
      role="group"
      aria-label={segmentRef}
      tabIndex={onSelect ? 0 : undefined}
      data-ref={segmentRef}
      data-highlighted={highlighted ? "true" : undefined}
      data-scroll-target={isScrollTarget ? "true" : undefined}
      data-selectable={onSelect ? "true" : undefined}
      data-sides={showPrimary && showTranslation ? "both" : showPrimary ? "primary" : "translation"}
      onClick={onSelect ? activate : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                e.preventDefault();
                onSelect(segmentRef);
              }
            }
          : undefined
      }
    >
      {address !== undefined ? (
        <span className={styles.number} aria-hidden="true" data-number="true">
          {segmentNumber(address, numLang)}
        </span>
      ) : null}
      {linkCount !== undefined ? (
        <span className={styles.dot} style={{ opacity: linkDotOpacity(linkCount) }} data-no-select="true">
          <span className={styles.dotInner} aria-hidden="true" />
          {linkCount > 0 ? (
            <VisuallyHidden>
              <InterfaceText en={`${linkCount} connections available`} he={`${linkCount} קישורים זמינים`} />
            </VisuallyHidden>
          ) : null}
        </span>
      ) : null}
      <p className={styles.body}>
        {showPrimary ? (
          <span className={`${styles.side} ${styles.primary}`} dir={primary.dir} data-side="primary">
            <SegmentText {...common} stripPunctuation={stripPunctuation && primary.dir === "rtl"} html={primary.html} lang={primary.lang} dir={primary.dir} />
          </span>
        ) : null}
        {showTranslation ? (
          <span className={`${styles.side} ${styles.translation}`} dir={translation.dir} data-side="translation">
            <SegmentText {...common} html={translation.html} lang={translation.lang} dir={translation.dir} />
          </span>
        ) : null}
        {" "}
      </p>
    </div>
  );
}

/**
 * Memoised: when the reading focus moves, only the two segments whose props change re-render. The moving
 * focus highlight itself is applied as a DOM attribute by the column, outside React, so it costs nothing.
 */
export const Segment = memo(SegmentImpl);
