import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { sanitizeHtml } from "~/lib/html/sanitize";
import { MAX_QUERY_LENGTH, snippetOf, type MergedHit, type SearchHit } from "~/lib/search/text-search";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Icon } from "../Icon/Icon";
import { KeyboardLauncher } from "../VirtualKeyboard/KeyboardLauncher";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { categoryColor } from "../tokens/category-color";
import styles from "./SidebarSearch.module.css";

export interface SidebarSearchProps {
  /** The query that was run (the box starts with it). */
  query?: string;
  /** Run a new query: only called when the text in the box differs from `query`. */
  onSearch: (query: string) => void;
  /** Results, merged by ref; undefined until the first page arrives. */
  results?: readonly MergedHit[];
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Where a result lives (a real link); a plain click calls `onOpen` instead. */
  hrefFor: (hit: SearchHit) => string;
  onOpen: (hit: SearchHit, event: MouseEvent) => void;
  error?: boolean;
}

/**
 * "Search in this text": a box, and the matches in the book — each with its ref, the matched words in bold, the version
 * it was found in and "N more versions" beneath. A new query runs only when the words changed. More results load as the
 * list scrolls to its end.
 *
 * @feature SRC-094 Search in this text (sidebar)
 * @feature SRC-096 Sidebar search result display and click
 */
export function SidebarSearch({ query = "", onSearch, results, loading, loadingMore, hasMore, onLoadMore, hrefFor, onOpen, error }: SidebarSearchProps) {
  const hebrew = useInterfaceLang() === "hebrew";
  const id = useId();
  const [value, setValue] = useState(query);
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => setValue(query), [query]);
  const label = hebrew ? "חפש בטקסט" : "Search in this text";
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (value !== query) onSearch(value);
  };

  const sentinel = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loadingMore || !onLoadMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onLoadMore(), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, onLoadMore, results?.length]);

  return (
    <div className={styles.view}>
      <form role="search" className={styles.search} onSubmit={submit}>
        <button type="submit" className={styles.searchButton} aria-label={hebrew ? "חיפוש" : "Search"}>
          <Icon name="search" size="1.1em" />
        </button>
        <input ref={input} id={id} type="search" value={value} maxLength={MAX_QUERY_LENGTH} onChange={(e) => setValue(e.target.value)} onFocus={() => setFocused(true)} onBlur={(e) => !e.currentTarget.form?.contains(e.relatedTarget as Node) && setFocused(false)} placeholder={label} aria-label={label} title={label} dir="auto" />
        {!hebrew ? <KeyboardLauncher inputRef={input} value={value} onChange={setValue} onEnter={() => submit()} focused={focused} /> : null}
      </form>
      {query ? (
        <div aria-live="polite">
          {error ? (
            <p className={styles.message} role="alert"><InterfaceText en="Something went wrong. Please try again." he="משהו השתבש. אנא נסו שוב." /></p>
          ) : !results && loading ? (
            <p className={styles.message} role="status"><InterfaceText en="Searching..." he="מבצע חיפוש..." /></p>
          ) : results && results.length === 0 ? (
            <p className={styles.message}><InterfaceText en="0 results." he="0 תוצאות." /></p>
          ) : results ? (
            <ul className={styles.list} aria-label={hebrew ? "תוצאות חיפוש" : "Search results"}>
              {results.map((hit) => (
                <li key={hit._id}>
                  <Result hit={hit} hrefFor={hrefFor} onOpen={onOpen} hebrew={hebrew} />
                </li>
              ))}
              {hasMore ? <li ref={sentinel} className={styles.sentinel} aria-hidden="true" /> : null}
              {loadingMore ? <li><p className={styles.message} role="status"><InterfaceText en="Loading more results..." he="טוען עוד תוצאות..." /></p></li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Result({ hit, hrefFor, onOpen, hebrew, nested }: Pick<SidebarSearchProps, "hrefFor" | "onOpen"> & { hit: MergedHit; hebrew: boolean; nested?: boolean }) {
  const [shown, setShown] = useState(false);
  const s = hit._source;
  const snippet = snippetOf(hit);
  const duplicates = (hit.duplicates ?? []).filter((d) => !!d._source.version);
  const n = duplicates.length;
  return (
    <article className={nested ? undefined : styles.result}>
      <Link
        className={styles.refLink}
        href={hrefFor(hit)}
        lang={hebrew ? "he" : "en"}
        onClick={(e) => {
          if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            onOpen(hit, e);
          }
        }}
      >
        {hebrew ? s.heRef : s.ref}
      </Link>
      <div className={styles.snippet} lang={snippet.lang} dir={snippet.lang === "he" ? "rtl" : "ltr"} style={{ ["--_color" as string]: categoryColor(s.categories?.[0]) }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(snippet.html) }} />
      <div className={styles.version} lang={hebrew && s.hebrew_version_title ? "he" : "en"}>{(hebrew && s.hebrew_version_title) || s.version}</div>
      {n > 0 ? (
        <>
          <button type="button" className={styles.more} data-open={shown} aria-expanded={shown} onClick={() => setShown((v) => !v)}>
            <InterfaceText en={`${n} more version${n > 1 ? "s" : ""}`} he={`${n} ${n > 1 ? "גרסאות נוספות" : "גרסה נוספת"}`} />
            <Icon name="chevron-down" className={styles.caret} size="0.9em" />
          </button>
          {shown ? (
            <div className={styles.nested}>
              {duplicates.map((d) => (
                <Result key={d._id} hit={d} hrefFor={hrefFor} onOpen={onOpen} hebrew={hebrew} nested />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
