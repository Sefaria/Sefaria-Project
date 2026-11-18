// PortalHeader (PLAN §2.5, Phase 1; contract C6 "Header"). A copy of live developers.sefaria.org's header:
// REFERENCE_SPEC.md §1.1 and SITE_ATLAS.md §2, measured on live. It is self-contained on purpose: it
// imports nothing from the rest of the portal, so it can be prerendered on its own (scripts/prerender.ts)
// and swapped for the redesigned header later (Q27). Live's inconsistencies are kept: "Voices at Sefaria"
// in the links menu, "Voices on Sefaria" in the drawer, links to bare sefaria.org.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { DRAWER_LINKS, LINKS_MENU_ITEMS, PRIMARY_LINKS, type HeaderNavLink, type PortalHeaderTab } from './headerLinks';
import styles from './PortalHeader.module.css';

export type { PortalHeaderTab } from './headerLinks';

/** The event the search toggle dispatches on `window`; the search module (src/search, `OPEN_SEARCH_EVENT`) opens its dialog on it. */
export const SEARCH_OPEN_EVENT = 'dp:open-search';

export interface PortalHeaderSubnav {
  /** The current page's title; the button's text and accessible name (C6 `MobileSubnav`). */
  label: string;
  expanded: boolean;
  onToggle: () => void;
  /** Id of the panel the button opens (the sidebar). */
  controls?: string;
}

export interface PortalHeaderProps {
  activeTab: PortalHeaderTab | null;
  /** The ≤768px sub-nav row with the sidebar dropdown button. Pages without a sidebar have none. */
  subnav?: PortalHeaderSubnav | null;
  /** The text next to the hamburger at ≤768px, instead of the active tab's ("Page Not Found" on the 404 page). */
  sectionLabel?: string;
}

/** The 404 page's header at ≤768px, as live: "Page Not Found" beside the hamburger, a "404 Not Found" sub-nav. */
export const NOT_FOUND_SECTION_LABEL = 'Page Not Found';
export const NOT_FOUND_SUBNAV_LABEL = '404 Not Found';

/** The section name next to the hamburger at ≤768px. Live shows nothing on custom pages. */
const MOBILE_SECTION_LABEL: Record<PortalHeaderTab, string> = {
  home: 'Home',
  docs: 'Docs',
  reference: 'API Reference',
  contact: '',
};

const LOGO_SRC = `${import.meta.env.BASE_URL}logo-developers-on-sefaria-white.svg`;
const LOGO_ALT = 'Developers on Sefaria';
// Fixed ids, not useId: the page has one header, and the prerendered markup must equal the client's.
const DRAWER_ID = 'dp-mobile-drawer';
const LINKS_PANEL_ID = 'dp-links-menu';

function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform ?? nav.platform ?? '');
}

const subscribeNever = () => () => {};

/** "⌘K" on Apple platforms, "CTRL-K" elsewhere and on the server (live's `data-symbol`). */
function useKeyHint(): string {
  const apple = useSyncExternalStore(subscribeNever, isApplePlatform, () => false);
  return apple ? '⌘K' : 'CTRL-K';
}

function openSearch(): void {
  window.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT));
}

function linkTargetProps(link: HeaderNavLink) {
  return link.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}

/** C6 `SkipLink`: the first focusable element, visible only on focus. */
export function SkipLink() {
  return (
    <a className={styles.skipLink} href="#content">
      Jump to Content
    </a>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="2" />
      <path d="m20.5 20.5-4.2-4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className={styles.menuIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Sefaria's 3×3 dot grid (live's custom CSS replaces ReadMe's `more-vertical` icon with it). */
function DotGridIcon() {
  return (
    <svg className={styles.dotGrid} viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      {[3.375, 9, 14.625].flatMap((cy) =>
        [3.375, 9, 14.625].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.875" fill="white" />)
      )}
    </svg>
  );
}

function ChevronUpDownIcon() {
  return (
    <svg className={styles.subnavIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="m6 16 6 6 6-6M18 8l-6-6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LinksMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector('a')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      close(true);
    }
  };

  return (
    // The wrapper only listens for Escape bubbling up from the button and the menu links.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={styles.linksMenu}
      ref={wrapperRef}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (open && !wrapperRef.current?.contains(event.relatedTarget as Node | null) && event.relatedTarget) {
          close(false);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={styles.linksMenuButton}
        data-visual="moduleBtn"
        aria-label="Open links menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? LINKS_PANEL_ID : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <DotGridIcon />
      </button>
      {open && (
        <div className={styles.linksPanel} id={LINKS_PANEL_ID} role="dialog" aria-label="Links menu" ref={panelRef}>
          {/* Live's menu box (tippy) reaches 10px above and below the panel; this empty box has its bounds, for the
              visual-parity harness only. */}
          <span className={styles.linksRegion} aria-hidden="true" data-visual-region="popover" />
          <div className={styles.linksLogo} />
          <div className={styles.linksBox}>
            {LINKS_MENU_ITEMS.map((item) => (
              <a
                key={item.href}
                className={styles.linksItem}
                data-dot={item.dot ?? undefined}
                href={item.href}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileMenu({ activeTab }: { activeTab: PortalHeaderTab | null }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className={styles.mobileMenu}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.mobileMenuButton}
        data-visual="hamburger"
        aria-label="Toggle navigation menu"
        aria-expanded={open}
        aria-controls={DRAWER_ID}
        onClick={() => setOpen((value) => !value)}
      >
        <MenuIcon />
      </button>
      <div id={DRAWER_ID} className={styles.drawerRoot} hidden={!open}>
        {/* The overlay is a pointer convenience; keyboard users close with Escape or the button. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div className={styles.drawerOverlay} onClick={() => setOpen(false)} />
        <div className={styles.drawer} data-visual-region="mobileNav">
          {DRAWER_LINKS.map((link) => {
            const active = link.tab !== undefined && link.tab === activeTab;
            return (
              <a
                key={link.label}
                className={styles.drawerItem}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
                {...linkTargetProps(link)}
              >
                <span>{link.label}</span>
              </a>
            );
          })}
          <hr className={styles.drawerDivider} />
          <a className={styles.drawerLogo} href="/" onClick={() => setOpen(false)}>
            <img className={styles.drawerLogoImg} src={LOGO_SRC} alt={LOGO_ALT} />
          </a>
        </div>
      </div>
    </div>
  );
}

export function PortalHeader({ activeTab, subnav = null, sectionLabel: sectionLabelProp }: PortalHeaderProps) {
  const keyHint = useKeyHint();
  const sectionLabel = sectionLabelProp ?? (activeTab === null ? '' : MOBILE_SECTION_LABEL[activeTab]);
  // data-visual*: the visual-parity hooks (e2e-tests/developers-visual/README.md), on the elements that match
  // live's mapped header elements.
  return (
    <header
      className={`dp-rm-header ${styles.header}`}
      data-has-subnav={subnav ? 'true' : undefined}
      data-visual="header"
      data-visual-region="header"
    >
      <SkipLink />
      {/* Live's header is two rows: rm-Header-top (hamburger, logo, search; ≤768px only) and rm-Header-bottom (the
          main bar above 768px, the sidebar dropdown row below). One bar serves both here: `.bar` is the row at ≤768px
          and `display: contents` above, `.barMain` the reverse, so each hook sits on the box live measures. */}
      <div className={styles.bar} data-visual="headerTop">
        <div className={styles.barMain} data-visual="headerBottom">
          <div className={styles.left}>
            <MobileMenu activeTab={activeTab} />
            <a className={styles.logo} href="/">
              <img className={styles.logoImg} src={LOGO_SRC} alt={LOGO_ALT} data-visual="logo" />
            </a>
            {sectionLabel && <div className={styles.sectionLabel}>{sectionLabel}</div>}
          </div>
          <nav className={styles.nav} aria-label="Primary navigation">
            {PRIMARY_LINKS.map((link) => {
              const active = link.tab !== undefined && link.tab === activeTab;
              return (
                <a
                  key={link.label}
                  className={styles.navLink}
                  data-visual={active ? 'navLinkActive' : 'navLink'}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  {...linkTargetProps(link)}
                >
                  <span>{link.label}</span>
                </a>
              );
            })}
          </nav>
          <div className={styles.search}>
            <button
              type="button"
              className={styles.searchToggle}
              aria-label="Search ⌘k"
              onClick={openSearch}
              data-visual="search"
            >
              <SearchIcon className={styles.searchIcon} />
              <span className={styles.searchPlaceholder}>Search</span>
              <kbd className={styles.searchKbd} aria-hidden="true">
                {keyHint}
              </kbd>
            </button>
          </div>
          <div className={styles.right}>
            <LinksMenu />
          </div>
        </div>
      </div>
      {subnav && (
        <div className={styles.subnavRow} data-visual="headerBottom">
          <button
            type="button"
            className={styles.subnavButton}
            data-visual="mobileSubnav"
            aria-expanded={subnav.expanded}
            aria-controls={subnav.controls}
            onClick={subnav.onToggle}
          >
            <span className={styles.subnavLabel}>{subnav.label}</span>
            <ChevronUpDownIcon />
          </button>
        </div>
      )}
    </header>
  );
}
