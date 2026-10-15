import { searchBoxAnalytics } from "~/lib/analytics/search-box";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { GROUP_TITLES, MIN_SUGGEST_LENGTH, type Suggestion, type SuggestionType } from "~/lib/search/autocomplete";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Icon, type IconName } from "../Icon/Icon";
import { KeyboardLauncher } from "../VirtualKeyboard/KeyboardLauncher";
import styles from "./HeaderSearch.module.css";
import { SITE_ORIGIN } from "~/lib/config";

export interface HeaderSearchProps {
  /** Suggestions for the typed words (three or more characters). */
  getSuggestions: (query: string, signal: AbortSignal) => Promise<Suggestion[]>;
  /** Enter with nothing highlighted: open a text or topic if the words name one, else search. */
  onSmartSubmit: (query: string) => void;
  /** "Search for “…”": the full-text search of exactly the typed words. */
  onSearch: (query: string) => void;
  /** A suggestion chosen (a book, a category, a topic). */
  onChoose: (suggestion: Suggestion) => void;
  mobile?: boolean;
}

const ICON: Record<SuggestionType, IconName> = { search: "search", ref: "book", Collection: "file", TocCategory: "list", Topic: "hash", AuthorTopic: "pen", User: "user", Term: "scroll" };
const isHebrew = (s: string) => /[֐-׿]/.test(s);

/**
 * The header's search box with suggestions as you type: a "Search for" row, then books, categories, topics, authors… grouped.
 * A combobox: Arrow keys move through the suggestions, Enter chooses (or runs the smart submit when none is highlighted),
 * Escape closes. Suggestions start at three characters; a slower answer never replaces a newer one.
 *
 * @feature SRC-001 Header search suggestions
 * @feature SRC-004 Minimum 3 characters for suggestions
 * @feature SRC-007 Suggestion grouping, headers and icons
 * @feature SRC-009 'Search for' row
 * @feature SRC-010 Submit search with Enter or button
 * @feature SRC-018 Search box focus/blur behavior
 * @feature SRC-019 Search input limits and labels
 * @feature SRC-110 Search accessibility behaviors
 */
export function HeaderSearch({ getSuggestions, onSmartSubmit, onSearch, onChoose, mobile }: HeaderSearchProps) {
  const he = useInterfaceLang() === "hebrew";
  const id = useId();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActive(-1);
    if (q.trim().length < MIN_SUGGEST_LENGTH) return setItems([]);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      getSuggestions(q.trim(), ctl.signal).then((s) => !ctl.signal.aborted && setItems(s), () => !ctl.signal.aborted && setItems([]));
    }, 100);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, getSuggestions]);

  const open = focused && items.length > 0;
  const clear = () => {
    setQ("");
    setItems([]);
  };
  const choose = (s: Suggestion, how: "keyboard" | "mouse") => {
    // the old box: a clicked "Search for" row is a search; Enter on it just opens the results; others report the choice
    if (s.type === "search") {
      if (how === "mouse") searchBoxAnalytics.search(s.label);
    } else searchBoxAnalytics.navTo(how, s, q);
    clear();
    if (s.type === "search") onSearch(s.label);
    else onChoose(s);
  };
  const submit = () => {
    const v = q.trim();
    if (!v) return;
    clear();
    onSmartSubmit(v);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Escape") {
      setItems([]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && items[active]) choose(items[active]!, "keyboard");
      else submit();
    }
  };
  const click = (s: Suggestion) => (e: MouseEvent) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      choose(s, "mouse");
    }
  };

  // Groups in order of first appearance; the flat index drives the keyboard
  const groups: { type: SuggestionType; items: { s: Suggestion; i: number }[] }[] = [];
  items.forEach((s, i) => {
    let g = groups.find((x) => x.type === s.type);
    if (!g) groups.push((g = { type: s.type, items: [] }));
    g.items.push({ s, i });
  });
  const label = he ? "חיפוש טקסט או מילות מפתח" : "Search for Texts or Keywords Here";

  return (
    <div className={styles.box} data-mobile={mobile || undefined} ref={root} onBlur={(e) => {
        if (root.current?.contains(e.relatedTarget as Node)) return;
        setFocused(false);
        searchBoxAnalytics.defocus(q);
      }}>
      <div className={styles.field} role="search" aria-label={he ? "חיפוש באתר" : "Site search"} data-focused={focused || undefined}>
        <button type="button" className={styles.btn} aria-label={he ? "חיפוש" : "Search"} onClick={submit}><Icon name="search" size="1.1em" /></button>
        <input
          ref={input}
          className={styles.input}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          aria-label={label}
          title={label}
          placeholder={he ? "חיפוש" : "Search"}
          maxLength={75}
          dir="auto"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (!focused) searchBoxAnalytics.focus();
            setFocused(true);
          }}
          onKeyDown={onKeyDown}
        />
        {!he && !mobile ? <KeyboardLauncher inputRef={input} value={q} onChange={setQ} onEnter={submit} focused={focused} /> : null}
      </div>
      <div id={`${id}-list`} role="listbox" aria-label={he ? "הצעות" : "Suggestions"} className={styles.dropdown} hidden={!open}>
        {groups.map((g) => (
          <div key={g.type} className={styles.group} role="group" aria-label={GROUP_TITLES[g.type][he ? "he" : "en"] || undefined}>
            {g.type !== "search" ? <div className={styles.groupTitle} aria-hidden="true">{GROUP_TITLES[g.type][he ? "he" : "en"]}</div> : null}
            {g.items.map(({ s, i }) => (
              <a
                key={`${s.type}:${s.label}:${i}`}
                id={`${id}-${i}`}
                role="option"
                aria-selected={active === i}
                data-active={active === i}
                className={styles.item}
                lang={isHebrew(s.label) ? "he" : "en"}
                href={s.url ?? `${SITE_ORIGIN}/search?q=${encodeURIComponent(s.label)}`}
                onClick={click(s)}
                onMouseEnter={() => setActive(i)}
                // clicks must not blur the input first
                onMouseDown={(e) => e.preventDefault()}
              >
                <span className={styles.icon}><Icon name={ICON[s.type]} /></span>
                {s.type === "search" ? (
                  <span className={styles.override}>{he ? "חיפוש: " : "Search for: "}<strong>{"“" + s.label + "”"}</strong></span>
                ) : (
                  <span>{s.label}</span>
                )}
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
