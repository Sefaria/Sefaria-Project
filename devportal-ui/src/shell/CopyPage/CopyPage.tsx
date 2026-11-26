// The Copy Page split button and its menu (contract C6 `CopyPageButton`, `CopyPageMenuButton`, `CopyPageMenu`;
// SITE_ATLAS §2; REFERENCE_SPEC §1.4). On docs pages it sits at the top of the right rail, on endpoint pages at the
// right of the headline row. Every action sends C8 `copy_page_action` with its name.
//
// Live's bugs fixed here: the chevron button has a name ("Copy Page options"), the menu is a `menu` of `menuitem`s,
// and the first three items have no coloured dots (D-5).
import { ArrowUpRight, Check, ChevronDown, Clipboard, Copy, Terminal } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { track, type CopyPageAction } from '../../analytics';
import { copyText } from '../../ui';
import {
  APP_DOWNLOADS,
  MENU_LABELS,
  STRINGS,
  chatGptUrl,
  claudeUrl,
  cursorDeepLink,
  mcpCommand,
  mcpConfig,
  vscodeDeepLink,
} from './actions';
import { ClaudeIcon, CursorIcon, MarkdownIcon, OpenAiIcon, VsCodeIcon } from './brandIcons';
import styles from './CopyPage.module.css';

export interface CopyPageProps {
  /** The page's `.md` URL, absolute (C3 `meta.markdownUrl`). */
  markdownUrl: string;
  /** This host's MCP server, `<origin>/mcp` (C3 `site.mcpUrl`). */
  mcpUrl: string;
  /** How the page fetches Markdown and opens windows; tests replace them. */
  env?: Partial<CopyPageEnv>;
}

export interface CopyPageEnv {
  fetch: typeof fetch;
  open: (url: string, target: string) => void;
  /** Follows a custom-scheme deep link (`cursor://`, `vscode:`). */
  followDeepLink: (url: string) => void;
}

const defaultEnv: CopyPageEnv = {
  fetch: (...args) => window.fetch(...args),
  open: (url, target) => {
    window.open(url, target, 'noopener');
  },
  followDeepLink: (url) => {
    window.location.href = url;
  },
};

type Toast = { kind: 'success' | 'error' | 'warning'; text: string; app?: keyof typeof APP_DOWNLOADS } | null;

const COPIED_MS = 2000;
const TOAST_MS = 4000;
/** Live waits this long for the page to lose focus before saying the app is not installed. */
const DEEP_LINK_WAIT_MS = 2000;

/**
 * "Copy Page" fetches the page's Markdown (live: GET `<path>.md`) and copies it. The response must be text; a
 * failed request or an empty body shows live's "No markdown content available to copy.".
 */
async function fetchMarkdown(env: CopyPageEnv, url: string): Promise<string> {
  const response = await env.fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/markdown' } });
  if (!response.ok) return '';
  return response.text();
}

function MenuItemContent({ icon, label, external }: { icon: ReactNode; label: string; external?: boolean }) {
  return (
    <>
      <span className={styles.itemIcon}>{icon}</span>
      <span className={styles.itemLabel}>{label}</span>
      {external && <ArrowUpRight className={styles.externalIcon} aria-hidden="true" strokeWidth={2} />}
    </>
  );
}

export function CopyPage({ markdownUrl, mcpUrl, env: envOverrides }: CopyPageProps) {
  const env: CopyPageEnv = { ...defaultEnv, ...envOverrides };
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'loading' | 'copied'>('idle');
  const [toast, setToast] = useState<Toast>(null);
  const [alignEnd, setAlignEnd] = useState(false);
  const menuId = useId();
  const mcpHeaderId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const showToast = useCallback(
    (next: NonNullable<Toast>, ms = TOAST_MS) => {
      setToast(next);
      later(() => setToast((current) => (current === next ? null : current)), ms);
    },
    [later]
  );

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  // Close on a pointer press outside the split button and its menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Keep the menu inside the viewport: right-align it when it would overflow (narrow screens).
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setAlignEnd(rect.right > document.documentElement.clientWidth);
  }, [open]);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const focusItem = (index: number) => {
    const list = items();
    if (list.length === 0) return;
    list[(index + list.length) % list.length]?.focus();
  };

  const openMenu = (focus: 'first' | 'last' | null) => {
    setOpen(true);
    if (focus !== null) {
      // After the menu renders.
      window.requestAnimationFrame(() => focusItem(focus === 'first' ? 0 : -1));
    }
  };

  const report = (action: CopyPageAction) => track('copy_page_action', { action });

  const copyMarkdown = async () => {
    if (copyState === 'loading') return;
    report('copy_markdown');
    setCopyState('loading');
    const text = await fetchMarkdown(env, markdownUrl).catch(() => '');
    if (text === '') {
      setCopyState('idle');
      showToast({ kind: 'error', text: STRINGS.noMarkdown });
      return;
    }
    try {
      await copyText(text);
      setCopyState('copied');
      later(() => setCopyState('idle'), COPIED_MS);
    } catch {
      setCopyState('idle');
      showToast({ kind: 'error', text: STRINGS.copyFailed });
    }
  };

  const copyString = async (action: CopyPageAction, text: string) => {
    report(action);
    close(true);
    try {
      await copyText(text);
      showToast({ kind: 'success', text: STRINGS.mcpCopied });
    } catch {
      showToast({ kind: 'error', text: STRINGS.copyFailed });
    }
  };

  const deepLink = (action: CopyPageAction, url: string, app: keyof typeof APP_DOWNLOADS) => {
    report(action);
    close(true);
    // As live: if the page neither blurs nor hides within two seconds, the app did not take the link.
    let handled = false;
    const done = () => {
      handled = true;
      window.removeEventListener('blur', done);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') done();
    };
    window.addEventListener('blur', done);
    document.addEventListener('visibilitychange', onVisibility);
    env.followDeepLink(url);
    later(() => {
      window.removeEventListener('blur', done);
      document.removeEventListener('visibilitychange', onVisibility);
      if (!handled) showToast({ kind: 'warning', text: STRINGS.appNotFound(app), app }, 10000);
    }, DEEP_LINK_WAIT_MS);
  };

  const viewMarkdown = () => {
    report('view_markdown');
    close(true);
    try {
      env.open(markdownUrl, '_blank');
    } catch {
      showToast({ kind: 'error', text: STRINGS.openFailed });
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(-1);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
      case ' ': {
        // Links activate on Enter natively; Space activates them too, as it does the button items.
        const target = event.target as HTMLElement;
        if (target.tagName === 'A') {
          event.preventDefault();
          target.click();
        }
        break;
      }
    }
  };

  const onToggleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openMenu('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu('last');
    }
  };

  const copied = copyState === 'copied';

  return (
    <div className={styles.root} ref={rootRef} data-visual="copyPage">
      <button
        type="button"
        className={styles.left}
        onClick={() => void copyMarkdown()}
        aria-busy={copyState === 'loading' ? true : undefined}
      >
        {copied ? (
          <Check className={styles.leftIcon} aria-hidden="true" strokeWidth={2} />
        ) : (
          <Copy className={styles.leftIcon} aria-hidden="true" strokeWidth={2} />
        )}
        <span>{copied ? STRINGS.copied : STRINGS.copyPage}</span>
      </button>
      <span className={styles.anchor}>
        <button
          type="button"
          ref={toggleRef}
          className={styles.right}
          aria-label={STRINGS.menuButton}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          data-open={open ? 'true' : undefined}
          // A click from Enter or Space (detail 0) moves focus into the menu, as the WAI-ARIA menu button pattern asks;
          // a pointer click leaves it on the button.
          onClick={(event) => (open ? close(false) : openMenu(event.detail === 0 ? 'first' : null))}
          onKeyDown={onToggleKeyDown}
        >
          <ChevronDown className={styles.chevron} aria-hidden="true" strokeWidth={2} />
        </button>
        {open && (
          <div className={`${styles.popover} ${alignEnd ? styles.popoverEnd : ''}`} data-visual-region="popover">
            <div
              className={styles.menu}
              id={menuId}
              role="menu"
              tabIndex={-1}
              aria-label={STRINGS.menuButton}
              ref={menuRef}
              onKeyDown={onMenuKeyDown}
            >
              <a
                role="menuitem"
                tabIndex={-1}
                className={styles.item}
                href={chatGptUrl(markdownUrl)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  report('open_chatgpt');
                  setOpen(false);
                }}
              >
                <MenuItemContent
                  icon={<OpenAiIcon className={styles.icon} />}
                  label={MENU_LABELS.open_chatgpt}
                  external
                />
              </a>
              <a
                role="menuitem"
                tabIndex={-1}
                className={styles.item}
                href={claudeUrl(markdownUrl)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  report('open_claude');
                  setOpen(false);
                }}
              >
                <MenuItemContent
                  icon={<ClaudeIcon className={styles.icon} />}
                  label={MENU_LABELS.open_claude}
                  external
                />
              </a>
              <div role="separator" className={styles.divider} />
              <div role="group" aria-labelledby={mcpHeaderId}>
                <div id={mcpHeaderId} className={styles.header}>
                  {STRINGS.mcpHeader}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={styles.item}
                  onClick={() => deepLink('connect_cursor', cursorDeepLink(mcpUrl), 'Cursor')}
                >
                  <MenuItemContent icon={<CursorIcon className={styles.icon} />} label={MENU_LABELS.connect_cursor} />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={styles.item}
                  onClick={() => deepLink('connect_vscode', vscodeDeepLink(mcpUrl), 'VS Code')}
                >
                  <MenuItemContent icon={<VsCodeIcon className={styles.icon} />} label={MENU_LABELS.connect_vscode} />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={styles.item}
                  onClick={() => void copyString('copy_mcp_config', mcpConfig(mcpUrl))}
                >
                  <MenuItemContent
                    icon={<Clipboard className={styles.icon} aria-hidden="true" strokeWidth={2} />}
                    label={MENU_LABELS.copy_mcp_config}
                  />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={styles.item}
                  onClick={() => void copyString('copy_mcp_command', mcpCommand(mcpUrl))}
                >
                  <MenuItemContent
                    icon={<Terminal className={styles.icon} aria-hidden="true" strokeWidth={2} />}
                    label={MENU_LABELS.copy_mcp_command}
                  />
                </button>
              </div>
              <div role="separator" className={styles.divider} />
              <button type="button" role="menuitem" tabIndex={-1} className={styles.item} onClick={viewMarkdown}>
                <MenuItemContent icon={<MarkdownIcon className={styles.icon} />} label={MENU_LABELS.view_markdown} />
              </button>
            </div>
          </div>
        )}
      </span>
      <div className={styles.toastRegion} role="status" aria-live="polite">
        {toast && (
          <div className={styles.toast} data-kind={toast.kind}>
            <span>{toast.text}</span>
            {toast.app && (
              <>
                {' '}
                <a href={APP_DOWNLOADS[toast.app]} target="_blank" rel="noopener noreferrer">
                  {STRINGS.downloadApp(toast.app)}
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
