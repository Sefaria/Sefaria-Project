// The search modal (PLAN §2.9, contract C6 "Search"). Copies live's ReadMe modal: input, tabs with counts,
// rows with method badges and a highlighted snippet, 15 per page with "Back · 1 of N · Next". No Ask AI.
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { PAGE_SIZE, SEARCH_TABS, loadSearchIndex, type SearchHit, type SearchIndex, type SearchTabId } from './engine';
import { Icon } from './icons';
import styles from './SearchDialog.module.css';

export interface SearchDialogProps {
  /** `SiteConfig.searchDocsUrl`: `/_portal/search-docs.<sha>.json`. */
  docsUrl: string;
  open: boolean;
  onClose: () => void;
  /** Follows a result chosen with the keyboard. Defaults to a full page load. */
  onNavigate?: (path: string) => void;
  /** Builds the index; tests replace it. */
  loadIndex?: (url: string) => Promise<SearchIndex>;
}

type IndexState = { status: 'loading' | 'error'; index: null } | { status: 'ready'; index: SearchIndex };

const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

function defaultNavigate(path: string): void {
  window.location.assign(path);
}

const ROW_ICON = { docs: 'book-open', reference: 'code', page: 'custom-pages' } as const;

function SnippetText({ hit }: { hit: SearchHit }) {
  const parts = hit.snippet.parts.map((part, i) =>
    part.match ? (
      <mark key={i} className={styles.match}>
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
  if (hit.snippet.kind === 'response' || hit.snippet.kind === 'param') {
    return (
      <>
        <span className={styles.excerptLabel}>{hit.snippet.kind === 'response' ? 'Response Body' : 'Parameter'}</span>
        <span className={styles.separator} aria-hidden="true">
          •
        </span>
        {hit.snippet.kind === 'response' ? (
          <span className={styles.status}>{hit.snippet.status}</span>
        ) : (
          <code className={styles.paramName}>{hit.snippet.name}</code>
        )}
        <span className={styles.separator} aria-hidden="true">
          •
        </span>
        <span className={styles.excerptText}>{parts}</span>
      </>
    );
  }
  return <span className={styles.excerptText}>{parts}</span>;
}

export default function SearchDialog({
  docsUrl,
  open,
  onClose,
  onNavigate = defaultNavigate,
  loadIndex = loadSearchIndex,
}: SearchDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTabId>('all');
  const [page, setPage] = useState(0);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<IndexState>({ status: 'loading', index: null });
  const [attempt, setAttempt] = useState(0);

  // Open and close the native modal dialog; lock the page's scroll while it is open, as live does.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
      const root = document.documentElement;
      const previous = root.style.overflow;
      root.style.overflow = 'hidden';
      return () => {
        root.style.overflow = previous;
      };
    }
    if (!open && dialog.open) dialog.close();
    return undefined;
  }, [open]);

  // Build the index once this component mounts, which is the first time the modal opens (the engine
  // caches it per URL). After a failure, the next close schedules another attempt.
  useEffect(() => {
    let live = true;
    loadIndex(docsUrl).then(
      (index) => {
        if (live) setState({ status: 'ready', index });
      },
      () => {
        if (live) setState({ status: 'error', index: null });
      }
    );
    return () => {
      live = false;
    };
  }, [docsUrl, loadIndex, attempt]);

  const trimmed = query.trim();
  const outcome = useMemo(
    () => (state.status === 'ready' && trimmed !== '' ? state.index.search(trimmed) : null),
    [state, trimmed]
  );
  const visible = useMemo(
    () => (outcome === null ? [] : tab === 'all' ? outcome.hits : outcome.hits.filter((h) => h.section === tab)),
    [outcome, tab]
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = visible.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const rowId = (i: number) => `${baseId}-result-${i}`;
  const tabId = (id: SearchTabId) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  const close = useCallback(() => {
    setQuery('');
    setTab('all');
    setPage(0);
    setActive(-1);
    if (state.status === 'error') {
      setState({ status: 'loading', index: null });
      setAttempt((n) => n + 1);
    }
    onClose();
  }, [onClose, state.status]);

  const goToPage = (next: number) => {
    setPage(next);
    setActive(-1);
    resultsRef.current?.scrollTo?.({ top: 0 });
  };

  const selectTab = (id: SearchTabId) => {
    setTab(id);
    setPage(0);
    setActive(-1);
  };

  const choose = (hit: SearchHit) => {
    close();
    onNavigate(hit.path);
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (rows.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = active < 0 ? (step > 0 ? 0 : rows.length - 1) : (active + step + rows.length) % rows.length;
      setActive(next);
      document.getElementById(rowId(next))?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      const hit = rows[active < 0 ? 0 : active];
      if (hit !== undefined) {
        event.preventDefault();
        choose(hit);
      }
    }
  };

  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    // Focus trap: Tab and Shift-Tab cycle inside the modal.
    const nodes = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
      (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
    );
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (first === undefined || last === undefined) return;
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !dialogRef.current?.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !dialogRef.current?.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  };

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const enabled = SEARCH_TABS.filter((t) => t.id === 'all' || outcome === null || outcome.counts[t.id] > 0);
    const at = enabled.findIndex((t) => t.id === tab);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = enabled[(at + step + enabled.length) % enabled.length];
    if (next === undefined) return;
    selectTab(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  // A click on the dimmed area around the panel closes the modal.
  const onDialogClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) close();
  };

  let body;
  if (trimmed === '') {
    body = <Empty text="Start typing to search…" />;
  } else if (state.status === 'loading') {
    body = <Empty text="Searching…" />;
  } else if (state.status === 'error' || visible.length === 0) {
    body = <Empty text={`No search results for '${trimmed}'`} />;
  } else {
    body = (
      <>
        <ol className={styles.list} aria-label="Search results">
          {rows.map((hit, i) => (
            <li key={hit.id} className={styles.item}>
              <a
                id={rowId(i)}
                href={hit.path}
                className={styles.row}
                data-active={i === active ? 'true' : undefined}
                data-section={hit.section}
                aria-label={hit.title}
                aria-describedby={`${rowId(i)}-snippet`}
                onClick={close}
                onMouseMove={() => setActive(i)}
              >
                <Icon name={ROW_ICON[hit.section]} className={styles.rowIcon} />
                <span className={styles.rowText}>
                  <span className={styles.rowHeader}>
                    {hit.method !== null && (
                      <span className={styles.method} data-method={hit.method}>
                        {hit.method}
                      </span>
                    )}
                    <span className={styles.title}>{hit.title}</span>
                  </span>
                  <span className={styles.excerpt} id={`${rowId(i)}-snippet`}>
                    <SnippetText hit={hit} />
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ol>
        {pageCount > 1 && (
          <nav className={styles.pager} aria-label="Search results pages">
            <button
              type="button"
              className={styles.pagerButton}
              disabled={currentPage === 0}
              onClick={() => goToPage(currentPage - 1)}
            >
              <Icon name="arrow-left" className={styles.pagerIcon} />
              Back
            </button>
            <span className={styles.pagerState} aria-live="polite">
              {currentPage + 1} of {pageCount}
            </span>
            <button
              type="button"
              className={`${styles.pagerButton} ${styles.pagerNext}`}
              disabled={currentPage >= pageCount - 1}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next
              <Icon name="arrow-right" className={styles.pagerIcon} />
            </button>
          </nav>
        )}
      </>
    );
  }

  return (
    // The dialog itself is the full-viewport dimmed area; the white panel sits inside it (as live's backdrop).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label="Search"
      onKeyDown={onDialogKeyDown}
      onClick={onDialogClick}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      {open && (
        <div className={styles.panel} data-visual-region="searchModal">
          <div className={styles.box}>
            <Icon name="search" className={styles.inputIcon} />
            <input
              ref={inputRef}
              type="search"
              className={styles.input}
              aria-label="Search"
              aria-controls={panelId}
              aria-activedescendant={active >= 0 && rows[active] !== undefined ? rowId(active) : undefined}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
                setActive(-1);
              }}
              onKeyDown={onInputKeyDown}
            />
            <button
              type="button"
              className={styles.close}
              data-visible={query !== '' ? 'true' : undefined}
              aria-label="Close"
              onClick={close}
            >
              <Icon name="x" className={styles.closeIcon} />
            </button>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="Search sections">
            {SEARCH_TABS.map((t) => {
              const count = outcome === null ? null : outcome.counts[t.id];
              const empty = t.id !== 'all' && count === 0;
              const selected = tab === t.id;
              return (
                <button
                  key={t.id}
                  id={tabId(t.id)}
                  type="button"
                  role="tab"
                  className={styles.tab}
                  aria-label={count === null || t.id === 'all' ? t.label : `${t.label} ${count}`}
                  aria-selected={selected}
                  aria-controls={panelId}
                  aria-disabled={empty || undefined}
                  data-empty={empty ? 'true' : undefined}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    if (!empty) selectTab(t.id);
                  }}
                  onKeyDown={onTabKeyDown}
                >
                  <Icon name={t.icon} className={styles.tabIcon} />
                  {t.label}
                  {count !== null && t.id !== 'all' && <span className={styles.count}>{count}</span>}
                </button>
              );
            })}
          </div>
          <div ref={resultsRef} id={panelId} className={styles.results} role="tabpanel" aria-labelledby={tabId(tab)}>
            {body}
          </div>
          <p className={styles.srOnly} role="status">
            {outcome === null ? '' : `${visible.length} search ${visible.length === 1 ? 'result' : 'results'}`}
          </p>
        </div>
      )}
    </dialog>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className={styles.empty}>
      <Icon name="search" className={styles.emptyIcon} />
      <p className={styles.emptyText}>{text}</p>
    </div>
  );
}
