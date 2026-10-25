import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import type { ContentLanguage } from "~/lib/reader/settings";
import { textQueryOptions } from "~/lib/text/queries";
import { Icon } from "~/ui/Icon/Icon";
import { IconButton } from "~/ui/IconButton/IconButton";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { ReaderSurface } from "~/ui/ReaderSurface/ReaderSurface";
import { Segment } from "~/ui/Segment/Segment";
import { SkeletonText } from "~/ui/Skeleton/Skeleton";
import { dragTo, placeCard, type CardPosition } from "./ref-preview-geometry";
import styles from "./RefPreview.module.css";

/** How long the pointer rests on a link before its preview opens, and how long a preview outlives the pointer leaving it. */
export const HOVER_DELAY_MS = 500;
export const CLOSE_GRACE_MS = 300;
const MAX_PINNED = 6;
const PREVIEW_FONT_SIZE = 58;
const SCROLL_TOLERANCE_PX = 24;

const LINK = "a.ref-link";
const isPlainClick = (e: globalThis.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

interface Card {
  id: number;
  ref: string;
  pinned: boolean;
  position: CardPosition;
  /** The link the card came from: a link in the panel, or one inside another card. */
  link: HTMLAnchorElement | null;
  /** Stacking order: the card last touched is on top. */
  z: number;
  /** The link's top when the card opened. */
  anchorTop: number;
  focus?: boolean;
}

export interface RefPreviewsProps {
  /** The element whose ref links preview on hover and open a pinned card on a plain click. */
  root: RefObject<HTMLElement | null>;
  language: ContentLanguage;
  /** "Open as new column": a panel for the ref beside this one, in this workspace. */
  onOpenColumn: (ref: string) => void;
  /** The address of the ref on a page of its own ("Open in new page"). */
  pageHref: (ref: string) => string;
}

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

/**
 * Previews of cited texts. Resting the mouse on a ref link opens a card beside it that closes when the pointer leaves
 * both; clicking inside the card pins it. A plain click on a link opens a pinned card at once (modifier clicks still
 * follow the link). Pinned cards stay until closed, can be dragged by their header, and several can be open at once.
 */
export function RefPreviews({ root, language, onOpenColumn, pageHref }: RefPreviewsProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const nextId = useRef(1);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** The link waiting to open, and where it was when the pointer arrived. */
  const pending = useRef<{ link: HTMLAnchorElement; top: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cancelOpen = () => {
    clearTimeout(openTimer.current);
    pending.current = null;
  };
  const cancelClose = () => clearTimeout(closeTimer.current);
  const dropHover = useCallback(() => setCards((cs) => (cs.some((c) => !c.pinned) ? cs.filter((c) => c.pinned) : cs)), []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(dropHover, CLOSE_GRACE_MS);
  }, [dropHover]);

  const newCard = (link: HTMLAnchorElement, pinned: boolean, inRoot: boolean): Card => {
    const rect = link.getBoundingClientRect();
    return {
      id: nextId.current++,
      ref: link.dataset.sefariaRef ?? "",
      pinned,
      position: placeCard(rect, viewport()),
      anchorTop: rect.top,
      link: inRoot ? link : null,
      z: nextId.current,
      focus: pinned,
    };
  };

  const showHover = useCallback((link: HTMLAnchorElement) => {
    cancelClose();
    setCards((cs) => [...cs.filter((c) => c.pinned), newCard(link, false, true)]);
  }, []);

  const pinFromLink = useCallback((link: HTMLAnchorElement, inRoot: boolean) => {
    cancelOpen();
    cancelClose();
    const ref = link.dataset.sefariaRef ?? "";
    setCards((cs) => {
      const hover = cs.find((c) => !c.pinned && c.link === link);
      if (hover) return cs.map((c) => (c === hover ? { ...c, pinned: true, focus: true } : c));
      const pinned = cs.filter((c) => c.pinned);
      const same = pinned.find((c) => c.ref === ref);
      if (same) return pinned.map((c) => (c === same ? { ...c, z: nextId.current++, focus: true } : c));
      return [...pinned, newCard(link, true, inRoot)].slice(-MAX_PINNED);
    });
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const linkOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLAnchorElement>(LINK) : null);
    const onOver = (e: globalThis.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const link = linkOf(e.target);
      if (!link || !el.contains(link)) return;
      if (cardsRef.current.some((c) => !c.pinned && c.link === link)) return cancelClose();
      cancelOpen();
      pending.current = { link, top: link.getBoundingClientRect().top };
      openTimer.current = setTimeout(() => (pending.current = null, showHover(link)), HOVER_DELAY_MS);
    };
    const onOut = (e: globalThis.PointerEvent) => {
      const link = linkOf(e.target);
      if (!link || (e.relatedTarget instanceof Node && link.contains(e.relatedTarget))) return;
      cancelOpen();
      if (cardsRef.current.some((c) => !c.pinned)) scheduleClose();
    };
    const onClick = (e: globalThis.MouseEvent) => {
      const link = linkOf(e.target);
      if (!link || !isPlainClick(e)) return;
      e.preventDefault();
      e.stopPropagation();
      pinFromLink(link, true);
    };
    // Scrolling the text away from under the pointer cancels a preview; the reader's own small scroll adjustments do not.
    const moved = (link: HTMLAnchorElement, top: number) => Math.abs(link.getBoundingClientRect().top - top) > SCROLL_TOLERANCE_PX;
    const onScroll = () => {
      const p = pending.current;
      if (p && moved(p.link, p.top)) cancelOpen();
      const hover = cardsRef.current.find((c) => !c.pinned);
      if (hover?.link && moved(hover.link, hover.anchorTop)) dropHover();
    };
    el.addEventListener("pointerover", onOver);
    el.addEventListener("pointerout", onOut);
    el.addEventListener("click", onClick, true);
    el.addEventListener("scroll", onScroll, true);
    return () => {
      el.removeEventListener("pointerover", onOver);
      el.removeEventListener("pointerout", onOut);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("scroll", onScroll, true);
    };
  }, [root, showHover, pinFromLink, scheduleClose, dropHover]);

  // Escape closes a hover preview wherever focus is (before the panel's own Escape, which would close the panel).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || !cardsRef.current.some((c) => !c.pinned)) return;
      e.preventDefault();
      dropHover();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [dropHover]);

  useEffect(() => () => (cancelOpen(), cancelClose()), []);

  const close = useCallback((id: number, restoreFocus: boolean) => {
    const card = cardsRef.current.find((c) => c.id === id);
    setCards((cs) => cs.filter((c) => c.id !== id));
    if (restoreFocus && card?.link?.isConnected) card.link.focus({ preventScroll: true });
  }, []);
  const pin = useCallback((id: number) => {
    cancelClose();
    setCards((cs) => (cs.some((c) => c.id === id && !c.pinned) ? cs.map((c) => (c.id === id ? { ...c, pinned: true } : c)) : cs));
  }, []);
  const move = useCallback((id: number, position: CardPosition) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, position } : c))), []);
  const toFront = useCallback((id: number) => setCards((cs) => (Math.max(...cs.map((c) => c.z)) === cs.find((c) => c.id === id)?.z ? cs : cs.map((c) => (c.id === id ? { ...c, z: nextId.current++ } : c)))), []);

  if (!cards.length || typeof document === "undefined") return null;
  return createPortal(
    // One keyed list, stacked by z rather than DOM order, so a card keeps its place and scroll position when pinned or raised.
    <>
      {cards.map((c) => (
        <RefPreviewCard
          key={c.id}
          previewRef={c.ref}
          language={language}
          pinned={c.pinned}
          position={c.position}
          z={cards.filter((o) => o.z < c.z).length - cards.length + 1}
          autoFocus={c.focus}
          onPin={() => (pin(c.id), toFront(c.id))}
          onClose={(restoreFocus) => close(c.id, restoreFocus)}
          pageHref={pageHref(c.ref)}
          onOpenColumn={() => (close(c.id, false), onOpenColumn(c.ref))}
          onMove={(p) => move(c.id, p)}
          onPointerEnter={cancelClose}
          onPointerLeave={c.pinned ? undefined : scheduleClose}
          onRefClick={(_, e) => {
            const link = (e.target as Element).closest<HTMLAnchorElement>(LINK);
            if (link) pinFromLink(link, false);
          }}
        />
      ))}
    </>,
    document.body,
  );
}

export interface RefPreviewCardProps {
  previewRef: string;
  language: ContentLanguage;
  pinned: boolean;
  position: CardPosition;
  /** Offset from the overlay layer (0 on top, negative below), so cards stay under modals. */
  z?: number;
  autoFocus?: boolean;
  onPin: () => void;
  onClose: (restoreFocus: boolean) => void;
  onOpenColumn: () => void;
  /** Where "Open in new page" goes (a new browser tab). */
  pageHref: string;
  onMove: (position: CardPosition) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onRefClick?: (ref: string, event: MouseEvent) => void;
}

/** One preview: its title, the cited text in the panel's language, and the ways to open it. */
export function RefPreviewCard({ previewRef, language, pinned, position, z = 0, autoFocus, onPin, onClose, onOpenColumn, pageHref, onMove, onPointerEnter, onPointerLeave, onRefClick }: RefPreviewCardProps) {
  const he = useInterfaceLang() === "hebrew";
  const { data: passage, isError } = useQuery(textQueryOptions(previewRef));
  const cardEl = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (autoFocus) cardEl.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const titleLang = language === "hebrew" ? "he" : "en";
  const title = passage ? (titleLang === "he" ? passage.heRef : passage.ref) : previewRef;

  const onHeaderDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest("button, a")) return;
    const rect = cardEl.current!.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onHeaderMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (d) onMove(dragTo(d, { x: e.clientX - d.x, y: e.clientY - d.y }, viewport()));
  };
  const onHeaderUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    onClose(true);
  };

  const primaryMeta = passage?.primaryVersion;
  const translationMeta = passage?.translationVersion;
  return (
    <div
      ref={cardEl}
      className={styles.card}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      data-pinned={pinned ? "true" : "false"}
      data-ref-preview={previewRef}
      style={{ left: position.left, top: position.top, bottom: position.bottom, zIndex: `calc(var(--sefaria-z-overlay) + ${z})` }}
      onPointerDownCapture={pinned ? undefined : onPin}
      onPointerDown={pinned ? onPin : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
    >
      <header className={styles.header} onPointerDown={pinned ? onHeaderDown : undefined} onPointerMove={onHeaderMove} onPointerUp={onHeaderUp} onPointerCancel={onHeaderUp}>
        <span className={styles.title} lang={titleLang} dir={titleLang === "he" ? "rtl" : "ltr"} title={title}>
          {title}
        </span>
        <IconButton icon="close" size="sm" label={he ? "סגירה" : "Close"} onClick={() => onClose(true)} />
      </header>
      <div className={styles.body}>
        {passage ? (
          <ReaderSurface language={language} layout="segmented" biLayout="stacked" fontSize={PREVIEW_FONT_SIZE}>
            {passage.segments.map((seg) => (
              <Segment
                key={seg.ref}
                segmentRef={seg.ref}
                primary={seg.primary !== undefined && primaryMeta ? { html: seg.primary, lang: primaryMeta.actualLanguage, dir: primaryMeta.direction } : undefined}
                translation={seg.translation !== undefined && translationMeta ? { html: seg.translation, lang: translationMeta.actualLanguage, dir: translationMeta.direction } : undefined}
                language={language}
                onRefClick={onRefClick}
              />
            ))}
          </ReaderSurface>
        ) : isError ? (
          <p className={styles.message}>
            <InterfaceText en="This text could not be loaded." he="לא ניתן לטעון את הטקסט." />
          </p>
        ) : (
          <SkeletonText lines={3} />
        )}
      </div>
      <footer className={styles.actions}>
        <button type="button" className={styles.action} onClick={onOpenColumn}>
          <Icon name="columns" size="16px" />
          <InterfaceText en="Open as new column" he="פתיחה בטור חדש" />
        </button>
        <a className={styles.action} href={pageHref} target="_blank" rel="noopener" onClick={() => onClose(false)}>
          <Icon name="external-link" size="16px" />
          <InterfaceText en="Open in new page" he="פתיחה בדף חדש" />
        </a>
      </footer>
    </div>
  );
}
