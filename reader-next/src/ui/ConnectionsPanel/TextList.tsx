import { useEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import type { VocalizationMode } from "@vendor/sefaria-toolkit/text-transform/index";
import { visibleSides } from "~/lib/reader/labels";
import { Icon } from "../Icon/Icon";
import { LoadingState } from "../Feedback/Feedback";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { ContentText, LangText } from "../LangText/LangText";
import { Link } from "../Link/Link";
import { SegmentText, type SegmentTextProps } from "../SegmentText/SegmentText";
import styles from "./TextList.module.css";

export interface LinkedTextSide {
  html: string;
  lang: string;
  dir: "rtl" | "ltr";
}

export interface LinkedTextItem {
  id: string;
  sourceRef: string;
  sourceHeRef: string;
  /** Link to open this text in the reader. */
  href: string;
  primary?: LinkedTextSide;
  translation?: LinkedTextSide;
  /** Verse number the link attaches to (shown for commentary when several verses are listed). */
  number?: string;
  /** True while this item's text is still loading. */
  loading?: boolean;
}

export interface TextListProps {
  /** Heading: the filter ("Rashi"). */
  title: { en: string; he: string };
  /** The list is a whole category ("Commentary"), whose title shows upper-case; a book's keeps its case. */
  categoryTitle?: boolean;
  /** Underline colour (the category's). */
  color?: string;
  items: LinkedTextItem[];
  /** One language at a time in the sidebar. */
  language: "hebrew" | "english";
  vocalization?: VocalizationMode;
  /** Commentary items hide their title line, since the text begins with the lemma; set for the plain "Commentary" list. */
  hideItemTitles: boolean;
  loading?: boolean;
  /** Message when there are no items. */
  emptyMessage?: ReactNode;
  onRefClick?: SegmentTextProps["onRefClick"];
  onOpen?: (href: string, event: MouseEvent) => void;
  /** Signed in: "Add to Sheet" beside Open, which adds this connected text (not the verse) to a sheet. */
  onAddToSheet?: (item: LinkedTextItem) => void;
  /** Moderators: "Remove" beside Open, which deletes the connection. */
  onRemove?: (item: LinkedTextItem) => void;
  /** A connected text the reader dwelt on: shown (100px inside the list's view) for 3 s — the old ConnectionsPanel's
   *  checkVisibleSegments, which records it as secondary reading history (CON-036). Once per ref per list. */
  onDwell?: (ref: string) => void;
  /** More items can be shown: called when the end of the list comes within a screen of view (the list grows a page at a time). */
  onNearEnd?: () => void;
}

/**
 * The connected texts for a filter: each link's text with a title, an "Open" link, and (for commentary)
 * its anchor verse. Shows one language at a time. Replaces TextList and the sidebar's TextRange items.
 *
 * @feature CON-030 Connected texts list
 * @feature CON-032 Connection item rendering
 * @feature CON-033 Open connected text in main panel
 * @feature CON-034 Add connection to sheet button
 * @feature CON-035 Remove connection (moderator)
 */
export function TextList({ title, categoryTitle, color, items, language, vocalization, hideItemTitles, loading, emptyMessage, onRefClick, onOpen, onAddToSheet, onRemove, onDwell, onNearEnd }: TextListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const nearEnd = useRef(onNearEnd);
  nearEnd.current = onNearEnd;
  const more = Boolean(onNearEnd);
  useEffect(() => {
    const end = endRef.current;
    if (!end || !more || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && nearEnd.current?.(), { rootMargin: "0px 0px 800px 0px" });
    io.observe(end);
    return () => io.disconnect();
  }, [more, items.length]);
  const listRef = useRef<HTMLUListElement>(null);
  const dwelt = useRef(new Set<string>());
  const dwellCb = useRef(onDwell);
  dwellCb.current = onDwell;
  useEffect(() => {
    const list = listRef.current;
    if (!list || !dwellCb.current || typeof IntersectionObserver === "undefined") return;
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const ref = (e.target as HTMLElement).dataset.ref;
          if (!ref || dwelt.current.has(ref)) continue;
          if (e.isIntersecting && !timers.has(e.target)) {
            timers.set(e.target, setTimeout(() => {
              timers.delete(e.target);
              if (dwelt.current.has(ref)) return;
              dwelt.current.add(ref);
              dwellCb.current?.(ref);
            }, 3000));
          } else if (!e.isIntersecting && timers.has(e.target)) {
            clearTimeout(timers.get(e.target));
            timers.delete(e.target);
          }
        }
      },
      // more than 100px inside the view, as the old check
      { rootMargin: "-100px 0px -100px 0px" },
    );
    list.querySelectorAll("li[data-ref]").forEach((li) => io.observe(li));
    return () => {
      io.disconnect();
      timers.forEach((t) => clearTimeout(t));
    };
  }, [items]);
  return (
    <div>
      <h3 className={styles.title} data-upper={categoryTitle || undefined} style={{ ["--_color" as string]: color }}>
        <InterfaceText en={title.en} he={title.he} />
        <span className={styles.titleBar} aria-hidden="true" />
      </h3>
      {loading ? <LoadingState /> : null}
      {!loading && items.length === 0 ? (
        <p className={styles.notice}>{emptyMessage ?? <InterfaceText en="No connections known." he="אין קישורים ידועים." />}</p>
      ) : null}
      <ul ref={listRef} className={styles.list}>
        {items.map((item) => {
          const sides = visibleSides(language, { primary: Boolean(item.primary?.html.trim()), translation: Boolean(item.translation?.html.trim()) });
          const side = sides.primary ? item.primary : sides.translation ? item.translation : (item.primary ?? item.translation);
          return (
            <li key={item.id} className={styles.item} data-ref={item.sourceRef} data-lang={side?.dir === "rtl" ? "he" : "en"}>
              {hideItemTitles ? null : (
                // a title, not a link: on sefaria.org it does nothing; "Open" opens the text (VERIFIED 2026-10-06)
                // in the sidebar's language (lang2), as the old TextRange title
                <ContentText as="div" className={styles.ref} lang={language} en={item.sourceRef} he={item.sourceHeRef} fallback />
              )}
              {/* the block takes the text's direction, as the old `.segment.heOnly` did: Hebrew lines start and end at the right */}
              <LangText as="p" className={styles.text} lang={side?.lang ?? (language === "hebrew" ? "he" : "en")} dir={side?.dir}>
                {item.number ? <span className={styles.number} aria-hidden="true">{item.number}</span> : null}
                {side ? (
                  <SegmentText html={side.html} lang={side.lang} dir={side.dir} vocalization={vocalization} onRefClick={onRefClick} />
                ) : item.loading ? (
                  <span aria-busy="true"><InterfaceText en="Loading…" he="טוען…" /></span>
                ) : null}
              </LangText>
              <div className={styles.actions}>
                <Link
                  className={styles.open}
                  href={item.href}
                  onClick={(e: MouseEvent) => {
                    if (onOpen && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      onOpen(item.href, e);
                    }
                  }}
                >
                  <Icon name="external-link" size="16px" />
                  <InterfaceText en="Open" he="פתח" />
                </Link>
                {/* as the old ConnectionButtons: Add to Sheet when signed in, Remove for moderators */}
                {onAddToSheet ? (
                  <button type="button" className={styles.open} onClick={() => onAddToSheet(item)}>
                    <Icon name="circle-plus" size="16px" />
                    <InterfaceText en="Add to Sheet" he="הוספה לדף מקורות" />
                  </button>
                ) : null}
                {onRemove ? (
                  <button type="button" className={styles.open} onClick={() => onRemove(item)}>
                    <Icon name="circle-minus" size="16px" />
                    <InterfaceText en="Remove" he="מחיקת קישור" />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {more ? <div ref={endRef} aria-hidden="true" style={{ height: 1 }} /> : null}
    </div>
  );
}
