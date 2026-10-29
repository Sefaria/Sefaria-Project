import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./TopicSearch.module.css";

export interface TopicSearchSuggestion {
  name: string;
  /** The topic's slug; "" for the "Create a new topic: …" row. */
  key: string;
}

export interface TopicSearchProps {
  /** Up to four topics for what was typed, then the create row (the caller asks /api/name). */
  getSuggestions: (word: string) => Promise<TopicSearchSuggestion[]>;
  /** Connect the chosen topic to the passage; rejects with the server's message. */
  onAdd: (slug: string) => Promise<void>;
  /** Where a moderator can create a topic (the old inline TopicEditor is not built here). */
  createHref: (title: string) => string;
  /** "Create a new topic: " in the sidebar's language. */
  createPrefix: string;
}

/**
 * Moderators only: tag the selected passage with a topic, above the Topics list. Typing lists matching topics; choosing one
 * fills the box, and Add Topic (or Enter) connects it. The old TopicSearch over the old Autocompleter, with its rules: the
 * text must match a suggestion, else "Please select an option through the dropdown menu."; the last row offers to create a
 * topic. The old client used alert() for both outcomes; here they are spoken status lines under the box.
 *
 * @feature CON-047 Add topic to ref (moderator)
 */
export function TopicSearch({ getSuggestions, onAdd, createHref, createPrefix }: TopicSearchProps) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<TopicSearchSuggestion[] | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [chosen, setChosen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // the arrow keys move a highlight while focus stays in the box (aria-activedescendant), as HeaderSearch does
  const [active, setActive] = useState(-1);
  const id = useId();
  const latest = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  const type = (v: string) => {
    setValue(v);
    setChosen(false);
    setStatus(null);
    setActive(-1);
    latest.current = v;
    if (!v.trim()) {
      setSuggestions(null);
      return;
    }
    setListOpen(true);
    getSuggestions(v).then(
      (s) => latest.current === v && setSuggestions(s),
      () => latest.current === v && setSuggestions(null),
    );
  };

  const choose = (s: TopicSearchSuggestion) => {
    if (!s.key) {
      setCreating(s.name.slice(createPrefix.length));
      return;
    }
    setValue(s.name);
    setChosen(true);
    setListOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  };

  const submit = async () => {
    const match = suggestions?.find((s) => s.key && s.name.toLowerCase() === value.toLowerCase());
    if (!match) {
      setStatus({ kind: "error", text: "Please select an option through the dropdown menu." });
      return;
    }
    setBusy(true);
    try {
      await onAdd(match.key);
      setValue("");
      setSuggestions(null);
      setChosen(false);
      setStatus({ kind: "ok", text: "Topic added." });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = listOpen && suggestions ? suggestions.length : 0;
    if (e.key === "ArrowDown" && n) {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, n - 1));
    } else if (e.key === "ArrowUp" && n) {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Escape" && listOpen) {
      setListOpen(false);
      setActive(-1);
    } else if (e.key === "Enter" && suggestions) {
      e.preventDefault();
      if (n && active >= 0) choose(suggestions[active]!);
      else void submit();
    }
  };

  if (creating !== null) {
    return (
      <div className={styles.creating} role="group" aria-label="Create a new topic">
        <p>
          <InterfaceText en="Creating a topic is not in the new reader yet." he="יצירת נושא עדיין אינה זמינה בקורא החדש." />{" "}
          <a href={createHref(creating)} target="_blank" rel="noopener noreferrer">
            <InterfaceText en={`Create “${creating}” on sefaria.org`} he={`יצירת „${creating}” בספריא`} />
          </a>
        </p>
        <button type="button" className={styles.button} onClick={() => setCreating(null)}>
          <InterfaceText en="Cancel" he="ביטול" />
        </button>
      </div>
    );
  }

  const showList = listOpen && !!suggestions?.length;
  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <span className={styles.field}>
          <span className={styles.magnifier} aria-hidden="true"><Icon name="search" size="18px" /></span>
          <input
          ref={inputRef}
          type="text"
          className={styles.input}
          data-chosen={chosen || undefined}
          placeholder="Search for a Topic"
          aria-label="Search for a Topic"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-${active}` : undefined}
          value={value}
          onChange={(e) => type(e.target.value)}
          onKeyDown={onInputKey}
          />
        </span>
        {suggestions ? (
          <button type="button" className={styles.button} disabled={busy} onClick={() => void submit()}>
            <InterfaceText en="Add Topic" he="הוספת נושא" />
          </button>
        ) : null}
      </div>
      {showList ? (
        <ul id={`${id}-list`} className={styles.list} role="listbox" aria-label="Topics">
          {suggestions!.map((s, i) => (
            // mousedown would take focus from the box; the click still chooses
            <li key={`${s.key}|${i}`} id={`${id}-${i}`} role="option" aria-selected={i === active} className={styles.option} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)}>
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}
      {status ? (
        <p className={status.kind === "ok" ? styles.ok : styles.error} role={status.kind === "ok" ? "status" : "alert"}>
          <InterfaceText en={status.text} he={status.kind === "ok" ? "הנושא נוסף." : status.text === "Please select an option through the dropdown menu." ? "יש לבחור אפשרות מהרשימה." : status.text} />
        </p>
      ) : null}
    </div>
  );
}
