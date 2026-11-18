// The sidebar of docs and reference pages (contract C6 "Sidebar"; REFERENCE_SPEC §1.2; SITE_ATLAS §4). One component
// for both sections, drawing the C3 sidebar tree with the markup W7's DocsSidebarTree and page_doc.html use (global
// `dp-sidebar-*` classes styled in src/docs/docs.css), plus what the reference sidebar adds: the filter (Cmd-/ or
// Ctrl-/), method pills, "Deprecated Endpoint" markers, the whole-sidebar collapse remembered per browser, and the
// footer, where live shows "Powered by ReadMe" and the portal shows the Discord button (D-2).
//
// Groups: on load only the groups containing the current page are open; others open and close on click. While the
// filter has text, every group with a remaining row is open.
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { SidebarCategory, SidebarItem, SidebarTree } from '../../contracts';
import { useSidebarCollapsed } from './collapse';
import {
  FILTER_LABEL,
  HIDE_SIDEBAR_LABEL,
  MOBILE_QUERY,
  NO_MATCHES,
  SHOW_SIDEBAR_LABEL,
  SIDEBAR_LABEL,
  isFilterShortcut,
} from './constants';
import { filterCategories, groupsContaining } from './tree';
import './sidebar.css';

export interface SidebarProps {
  tree: SidebarTree;
  /** The current page's path; its row is marked `aria-current="page"`. */
  activePath: string;
  /** The footer under the tree: `<SidebarFooterDiscord />` (D-2). */
  footer?: ReactNode;
  /** Show the filter box. Live has it on the reference sidebar only; the default follows `tree.section`. */
  filterable?: boolean;
}

function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform ?? nav.platform ?? '');
}

const subscribeNever = () => () => {};

function subscribeMobile(onChange: () => void) {
  const list = typeof window !== 'undefined' ? window.matchMedia?.(MOBILE_QUERY) : undefined;
  list?.addEventListener('change', onChange);
  return () => list?.removeEventListener('change', onChange);
}

function isMobile(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.(MOBILE_QUERY).matches ?? false);
}

export function ExternalLinkIcon() {
  return (
    <svg
      className="dp-sidebar-external"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      width="16"
      height="16"
    >
      <path d="M5 4h7v7M12 4 4 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface RowContext {
  activePath: string;
  isOpen: (item: SidebarItem) => boolean;
  toggle: (item: SidebarItem) => void;
  deprecatedLabel: string;
}

/** The visual-parity key of a link (`data-visual`, PLAN §6.1; the harness measures the first visible match). */
function visualKey(active: boolean, parent: boolean, depth: number): string | undefined {
  if (active) return 'sbActive';
  if (parent && depth === 0) return 'sbGroup';
  if (depth > 0) return 'sbLink';
  return undefined;
}

function Row({ item, depth, ctx }: { item: SidebarItem; depth: number; ctx: RowContext }) {
  const hasChildren = item.children.length > 0;
  const open = hasChildren && ctx.isOpen(item);
  const listId = useId();
  const active = item.href === ctx.activePath;
  const external = item.kind === 'link';
  const endpoint = item.kind === 'endpoint' && item.method !== null;
  const linkClass = ['dp-sidebar-link', active ? 'dp-active' : '', depth > 0 ? 'dp-sidebar-link--sub' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <li className="dp-sidebar-item">
      <div
        className={[
          'dp-sidebar-row',
          hasChildren ? 'dp-sidebar-row--parent' : '',
          item.deprecated ? 'dp-sidebar-row--deprecated' : '',
          endpoint ? 'dp-sidebar-row--endpoint' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <a
          className={linkClass}
          href={item.href}
          aria-current={active ? 'page' : undefined}
          target={external && item.newTab ? '_blank' : undefined}
          rel={external && item.newTab ? 'noopener noreferrer' : undefined}
          data-visual={visualKey(active, hasChildren, depth)}
        >
          <span className="dp-sidebar-link__text">{item.title}</span>
          {external && <ExternalLinkIcon />}
          {/* The space keeps the accessible name "Texts (v3) get"; a flex container does not render it. */}
          {endpoint && ' '}
          {endpoint && (
            <span className="dp-sidebar-link__meta">
              <span
                className={`dp-sidebar-method dp-sidebar-method--${item.method}`}
                data-visual={item.method === 'post' ? 'badgePostSb' : 'badgeGetSb'}
              >
                {item.method}
              </span>
            </span>
          )}
        </a>
        {item.deprecated && (
          <button type="button" className="dp-sidebar-deprecated" aria-label={ctx.deprecatedLabel} title="Deprecated" />
        )}
        {hasChildren && (
          <button
            type="button"
            className="dp-sidebar-toggle"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`${open ? 'Hide' : 'Show'} subpages for ${item.title}`}
            onClick={() => ctx.toggle(item)}
          />
        )}
      </div>
      {hasChildren && (
        <ul id={listId} className="dp-sidebar-list dp-sidebar-list--sub" hidden={!open}>
          {item.children.map((child) => (
            <Row key={child.id} item={child} depth={depth + 1} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Category({ category, ctx }: { category: SidebarCategory; ctx: RowContext }) {
  const headingId = useId();
  return (
    <section className="dp-sidebar-section" aria-labelledby={headingId}>
      <h2 className="dp-sidebar-heading" id={headingId} data-visual="sbHeading">
        {category.title}
      </h2>
      <ul className="dp-sidebar-list">
        {category.items.map((item) => (
          <Row key={item.id} item={item} depth={0} ctx={ctx} />
        ))}
      </ul>
    </section>
  );
}

function FilterIcon() {
  return (
    <svg className="dp-sidebar-filter__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg className="dp-sidebar-collapse__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 3v10" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** C6 `Sidebar`: nav "Secondary navigation", with `SidebarFilter`, the tree, `SidebarFooter` and `SidebarCollapse`. */
export function Sidebar({ tree, activePath, footer, filterable }: SidebarProps) {
  const reference = tree.section === 'reference';
  const showFilter = filterable ?? reference;
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set(groupsContaining(tree.categories, activePath)));
  const [closedWhileFiltering, setClosedWhileFiltering] = useState<ReadonlySet<number>>(() => new Set());
  const [openedFor, setOpenedFor] = useState(activePath);
  const filterRef = useRef<HTMLInputElement>(null);
  const apple = useSyncExternalStore(subscribeNever, isApplePlatform, () => false);
  // In the ≤768 panel live shows every group open; the reader can still close one.
  const mobile = useSyncExternalStore(subscribeMobile, isMobile, () => false);
  const [closedOnMobile, setClosedOnMobile] = useState<ReadonlySet<number>>(() => new Set());

  // A navigation opens the new page's groups and leaves the others as the reader set them (adjusted in render).
  if (openedFor !== activePath) {
    setOpenedFor(activePath);
    setOpen((prev) => new Set([...prev, ...groupsContaining(tree.categories, activePath)]));
  }

  const filtering = query.trim() !== '';
  const categories = filtering ? filterCategories(tree.categories, query) : tree.categories;

  // Cmd-/ or Ctrl-/ focuses the filter, from anywhere on the page (live's `aria-keyshortcuts`).
  useEffect(() => {
    if (!showFilter) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!isFilterShortcut(event)) return;
      const input = filterRef.current;
      if (!input) return;
      event.preventDefault();
      if (collapsed && window.matchMedia?.('(width >= 769px)').matches) setCollapsed(false);
      input.focus();
      input.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFilter, collapsed, setCollapsed]);

  const ctx: RowContext = {
    activePath,
    isOpen: (item) => {
      if (filtering) return !closedWhileFiltering.has(item.id);
      if (mobile) return !closedOnMobile.has(item.id);
      return open.has(item.id);
    },
    toggle: (item) => {
      const flip = (prev: ReadonlySet<number>) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      };
      if (filtering) setClosedWhileFiltering(flip);
      else if (mobile) setClosedOnMobile(flip);
      else setOpen(flip);
    },
    deprecatedLabel: reference ? 'Deprecated Endpoint' : 'Deprecated Doc',
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setClosedWhileFiltering(new Set());
  };
  const onFilterKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      setQuery('');
    }
  };

  return (
    <nav
      className="dp-sidebar dp-sidebar--app"
      aria-label={SIDEBAR_LABEL}
      id={reference ? 'reference-sidebar' : undefined}
      data-section={tree.section}
      data-collapsed={collapsed ? 'true' : undefined}
      data-visual="sidebar"
      data-visual-region={mobile ? 'mobileSubnavPanel' : 'sidebar'}
    >
      <div className="dp-sidebar__body">
        {showFilter && (
          <div className="dp-sidebar-filter">
            <FilterIcon />
            <input
              ref={filterRef}
              className="dp-sidebar-filter__input"
              type="search"
              aria-label={FILTER_LABEL}
              aria-keyshortcuts="Control+/ Meta+/"
              placeholder="Filter"
              value={query}
              onChange={onChange}
              onKeyDown={onFilterKey}
              autoComplete="off"
              spellCheck={false}
              data-visual="filter"
            />
            {query === '' ? (
              <kbd className="dp-sidebar-filter__kbd" aria-hidden="true">
                {apple ? '⌘/' : 'CTRL-/'}
              </kbd>
            ) : (
              <button
                type="button"
                className="dp-sidebar-filter__clear"
                aria-label="Clear filter"
                onClick={() => {
                  setQuery('');
                  filterRef.current?.focus();
                }}
              />
            )}
          </div>
        )}
        <div className="dp-sidebar-tree">
          {categories.map((category) => (
            <Category key={category.id} category={category} ctx={ctx} />
          ))}
          {filtering && categories.length === 0 && <p className="dp-sidebar-empty">{NO_MATCHES}</p>}
        </div>
        {footer !== undefined && footer !== null && (
          <div className="dp-sidebar-footer" data-visual-deviation="D-2">
            {footer}
          </div>
        )}
      </div>
      <button
        type="button"
        className="dp-sidebar-collapse"
        aria-label={collapsed ? SHOW_SIDEBAR_LABEL : HIDE_SIDEBAR_LABEL}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
        data-visual={collapsed ? undefined : 'collapseBtn'}
      >
        <PanelIcon />
      </button>
    </nav>
  );
}
