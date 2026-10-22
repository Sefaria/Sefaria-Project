import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { containsEnglish, type Completion } from "~/lib/lexicon/completion";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Icon } from "../Icon/Icon";
import { KeyboardLauncher } from "../VirtualKeyboard/KeyboardLauncher";
import styles from "./DictionarySearch.module.css";

export interface DictionarySearchProps {
  /** Headword completions for the typed Hebrew (at most ten). */
  getCompletions: (term: string, signal: AbortSignal) => Promise<readonly Completion[]>;
  /** A word chosen, or typed and resolved to the nearest completion (its vowelled form). */
  onSubmit: (word: string) => void;
}

/**
 * The dictionary word box: type Hebrew, pick a headword from the list (Arrow keys, Enter, click) or press Enter / the magnifier to
 * go to the nearest one. Latin letters get "Invalid entry. Please type a Hebrew word." instead of a list. The Hebrew keyboard
 * icon shows in the English interface.
 *
 * @feature SRC-021 Dictionary word search box with autocomplete
 * @feature SRC-022 Dictionary headword search box
 */
export function DictionarySearch({ getCompletions, onSubmit }: DictionarySearchProps) {
  const he = useInterfaceLang() === "hebrew";
  const id = useId();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<readonly Completion[]>([]);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [shut, setShut] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const invalid = q.trim() !== "" && containsEnglish(q);
  const label = he ? "חיפוש במילון" : "Search Dictionary";

  useEffect(() => {
    setActive(-1);
    setShut(false);
    if (!q.trim() || invalid) return setItems([]);
    const ctl = new AbortController();
    const t = setTimeout(() => getCompletions(q.trim(), ctl.signal).then((d) => !ctl.signal.aborted && setItems(d), () => !ctl.signal.aborted && setItems([])), 100);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, invalid, getCompletions]);

  const go = (word: string) => { setShut(true); setItems([]); onSubmit(word); };
  // Enter on typed text: the nearest completion's form, or the text as it is
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const v = q.trim();
    if (!v || invalid) return;
    if (active >= 0 && items[active]) return go(items[active]![1]);
    let list = items;
    if (!list.length) list = await getCompletions(v, new AbortController().signal).catch(() => []);
    go(list[0]?.[1] ?? v);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" && items.length) { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
    else if (e.key === "Escape") setShut(true);
  };
  const open = focused && !shut && (invalid || items.length > 0);

  return (
    <form role="search" className={styles.box} onSubmit={submit} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setFocused(false)}>
      <div className={styles.field} data-focused={focused || undefined}>
        <button type="submit" className={styles.btn} aria-label={he ? "חיפוש" : "Search"}><Icon name="search" size="1.1em" /></button>
        <input
          ref={input}
          className={styles.input}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          aria-label={label}
          placeholder={label}
          maxLength={75}
          dir="auto"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
        />
        {!he ? <KeyboardLauncher inputRef={input} value={q} onChange={setQ} onEnter={() => void submit()} focused={focused} /> : null}
      </div>
      <ul id={`${id}-list`} role="listbox" aria-label={he ? "הצעות" : "Suggestions"} className={styles.list} hidden={!open}>
        {invalid ? (
          <li role="presentation" className={styles.invalid}>{he ? "קלט לא תקין. יש להקליד מילה בעברית." : "Invalid entry.  Please type a Hebrew word."}</li>
        ) : (
          items.map((c, i) => (
            <li key={`${c[0]}-${c[1]}-${i}`} id={`${id}-${i}`} role="option" aria-selected={active === i} data-active={active === i} lang="he" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => go(c[1])}>
              {c[1]}
            </li>
          ))
        )}
      </ul>
    </form>
  );
}
