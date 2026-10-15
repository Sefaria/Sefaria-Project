import { Fragment, memo, useMemo } from "react";
import { parashahHeader } from "~/lib/reader/parashah";
import { sectionTitle, showsSegmentNumbers } from "~/lib/reader/labels";
import {
  effectiveBiLayout,
  effectiveLayout,
  vocalizationMode,
  type ReaderSettings,
} from "~/lib/reader/settings";
import { isHighlighted, type Highlight } from "~/lib/text/plan";
import type { Segment as SegmentModel, TextPassage } from "~/lib/text/model";
import { parseHumanRef } from "~/lib/ref/url";
import { ReaderSurface } from "../ReaderSurface/ReaderSurface";
import { Segment, type SegmentProps } from "../Segment/Segment";
import { ParashahHeader, SectionTitle } from "../SectionTitle/SectionTitle";

export interface TextSectionProps {
  passage: TextPassage;
  settings: ReaderSettings;
  /** Segments to highlight (a verse range from the URL, or the segment whose connections are open). */
  highlight?: Highlight | null;
  /** Segment a link pointed at; the column scrolls it into place on arrival. */
  scrollTargetRef?: string;
  /** Words a search matched, highlighted in the scroll target segment (SRC-058). */
  terms?: readonly string[];
  /** Connections per segment ref; omit while counts load. */
  linkCounts?: Readonly<Record<string, number>>;
  /** Panel width in px (for responsive bilingual layout); omit on the server. */
  panelWidth?: number;
  inSidebar?: boolean;
  hideTitle?: boolean;
  itagCommentator?: string;
  onSelectSegment?: SegmentProps["onSelect"];
  onRefClick?: SegmentProps["onRefClick"];
  onEntityClick?: SegmentProps["onEntityClick"];
}

/**
 * A rendered section of text: title, parasha/aliyah headers, and its segments, arranged by the
 * reader's display settings. The same component serves every book type; behaviour that differs by
 * type is driven by the passage's metadata (categories, address types, alt structures).
 *
 * @feature TXD-010 @feature TXD-012 @feature TXD-043 @feature TXD-045 @feature TXT-002
 */
function TextSectionImpl({
  passage, settings, highlight, scrollTargetRef, terms, linkCounts, panelWidth, inSidebar, hideTitle, itagCommentator,
  onSelectSegment, onRefClick, onEntityClick,
}: TextSectionProps) {
  const ctx = { primaryCategory: passage.primaryCategory, panelWidth, inSidebar };
  const layout = effectiveLayout(settings, ctx);
  const biLayout = effectiveBiLayout(settings, ctx);
  const vocalization = vocalizationMode(settings.vowels);
  // Talmud punctuation can be removed from the Hebrew side when the reader turns it off.
  const stripPunctuation = passage.primaryCategory === "Talmud" && !settings.punctuationTalmud && settings.language !== "english";
  const numbered = showsSegmentNumbers(passage.book, passage.categories);
  const isDictionary = passage.categories[0] === "Reference";

  const bySection = useMemo(() => {
    const m = new Map<string, SegmentModel[]>();
    for (const s of passage.segments) (m.get(s.sectionRef) ?? m.set(s.sectionRef, []).get(s.sectionRef)!).push(s);
    return m;
  }, [passage]);

  const primaryMeta = passage.primaryVersion;
  const translationMeta = passage.translationVersion;

  return (
    <ReaderSurface language={settings.language} layout={layout} biLayout={biLayout} fontSize={settings.fontSize}>
      {passage.sectionRefs.map((sectionRef, idx) => {
        const parsed = parseHumanRef(sectionRef);
        const title = sectionTitle({
          primaryCategory: passage.primaryCategory,
          address: parsed.sections.length ? parsed.sections.join(":") : undefined,
          addressType: passage.addressTypes[parsed.sections.length - 1],
          sectionRef,
          heSectionRef: idx === 0 ? passage.heSectionRef : sectionRef,
        });
        return (
          <section key={sectionRef} data-ref={sectionRef} aria-label={sectionRef}>
            {hideTitle || isDictionary ? null : <SectionTitle en={title.en} he={title.he} language={settings.language} />}
            {(bySection.get(sectionRef) ?? []).map((seg) => {
              const header = parashahHeader(passage, seg, settings.aliyotTorah);
              return (
                <Fragment key={seg.ref}>
                  {header ? (
                    <ParashahHeader en={header.en} he={header.he} language={settings.language} aliyah={!header.parashaTitle} />
                  ) : null}
                  <Segment
                    segmentRef={seg.ref}
                    address={numbered ? seg.address.at(-1) : undefined}
                    primary={seg.primary !== undefined && primaryMeta ? { html: seg.primary, lang: primaryMeta.actualLanguage, dir: primaryMeta.direction } : undefined}
                    translation={seg.translation !== undefined && translationMeta ? { html: seg.translation, lang: translationMeta.actualLanguage, dir: translationMeta.direction } : undefined}
                    language={settings.language}
                    vocalization={vocalization}
                    stripPunctuation={stripPunctuation}
                    highlighted={isHighlighted(seg.address, highlight ?? null, passage.addressTypes)}
                    isScrollTarget={seg.ref === scrollTargetRef}
                    terms={seg.ref === scrollTargetRef ? terms : undefined}
                    linkCount={linkCounts ? (linkCounts[seg.ref] ?? 0) : undefined}
                    itagCommentator={itagCommentator}
                    onSelect={onSelectSegment}
                    onRefClick={onRefClick}
                    onEntityClick={onEntityClick}
                  />
                </Fragment>
              );
            })}
          </section>
        );
      })}
    </ReaderSurface>
  );
}

/** Memoised: adding a section to the column never re-renders the sections already there. */
export const TextSection = memo(TextSectionImpl);
