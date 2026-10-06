import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { sanitizeHtml } from "~/lib/html/sanitize";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { entityHref, type EntityHit, type EntityType } from "~/lib/search/entity-search";
import type { TopicCategory } from "~/lib/topics/topic-toc";
import { authorLifespan, formatYear, SOURCE_SORTS, selectionOf, matchesFilterText, type FilterNode, type SearchSort, type SearchTab, type SortOption } from "~/lib/search/search-page";
import { snippetOf, type MergedHit, type SearchHit } from "~/lib/search/text-search";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { Skeleton } from "../Skeleton/Skeleton";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import { categoryColor } from "../tokens/category-color";
import styles from "./SearchPage.module.css";
import { SITE_ORIGIN } from "~/lib/config";

const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
const isHebrew = (s: string) => /[֐-׿]/.test(s);

/** The big box on the results page: no suggestions, Enter or the magnifier runs it if the words changed, × clears the box. */
export function SearchBar({ query, onSubmit }: { query: string; onSubmit: (q: string) => void }) {
  const he = useInterfaceLang() === "hebrew";
  const [v, setV] = useState(query);
  useEffect(() => setV(query), [query]);
  const run = () => {
    const t = v.trim();
    if (t && t !== query) onSubmit(t);
  };
  return (
    <div className={styles.bar} role="search">
      <button type="button" aria-label={he ? "שליחת חיפוש" : "Submit search"} onClick={run}><Icon name="search" size="26px" /></button>
      <input value={v} maxLength={75} dir="auto" enterKeyHint="search" aria-label={he ? "חיפוש" : "Search"} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
      {v ? <button type="button" aria-label={he ? "ניקוי החיפוש" : "Clear search term"} onClick={() => setV("")}><Icon name="close" size="20px" /></button> : null}
    </div>
  );
}

export interface SearchTabsProps {
  active: SearchTab;
  /** Counts by tab; undefined while loading. */
  counts: Partial<Record<SearchTab, string>>;
  hrefFor: (tab: SearchTab) => string;
  onTab: (tab: SearchTab) => void;
  /** Phone layout: a strip that scrolls sideways, edges fading where more is hidden (SRC-062). */
  mobile?: boolean;
}
const TAB_LABELS: Record<SearchTab, { en: string; he: string }> = { sources: { en: "Sources", he: "מקורות" }, books: { en: "Books", he: "ספרים" }, authors: { en: "Authors", he: "מחברים" }, topics: { en: "Topics", he: "נושאים" } };
export function SearchTabs({ active, counts, hrefFor, onTab, mobile }: SearchTabsProps) {
  const he = useInterfaceLang() === "hebrew";
  const tabs = Object.keys(TAB_LABELS) as SearchTab[];
  if (mobile) return <MobileTabStrip tabs={tabs} active={active} counts={counts} onTab={onTab} he={he} />;
  return (
    <nav className={styles.tabs} aria-label={he ? "סוגי תוצאות" : "Result types"}>
      {tabs.map((t) => (
        <Link key={t} className={styles.tab} href={hrefFor(t)} aria-current={active === t ? "page" : undefined} data-current={active === t || undefined} onClick={(e) => { if (plain(e)) { e.preventDefault(); onTab(t); } }}>
          <InterfaceText en={TAB_LABELS[t].en} he={TAB_LABELS[t].he} />
          {counts[t] !== undefined ? <span className={styles.count}>{counts[t]}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

function MobileTabStrip({ tabs, active, counts, onTab, he }: { tabs: SearchTab[]; active: SearchTab; counts: SearchTabsProps["counts"]; onTab: (t: SearchTab) => void; he: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft); // RTL scrolls negative
    setEdges({ start: pos > 1, end: pos < max - 1 });
  };
  useEffect(() => {
    measure();
    // the active tab comes into view (inside the strip only: the page never scrolls)
    const el = scroller.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && tab) {
      const r = tab.getBoundingClientRect(), c = el.getBoundingClientRect();
      if (r.left < c.left || r.right > c.right) el.scrollTo({ left: el.scrollLeft + (he ? r.right - c.right : r.left - c.left) - (he ? -16 : 16), behavior: "smooth" });
    }
  }, [active, he]);
  return (
    <div className={styles.strip}>
      <div ref={scroller} className={styles.stripScroll} role="tablist" aria-label={he ? "סוגי תוצאות" : "Result types"} onScroll={measure}>
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={active === t} className={styles.stripTab} onClick={() => active !== t && onTab(t)}>
            <InterfaceText en={TAB_LABELS[t].en} he={TAB_LABELS[t].he} />
            {counts[t] !== undefined ? <span className={styles.count}>{counts[t]}</span> : null}
          </button>
        ))}
        <span className={styles.stripSpacer} aria-hidden="true" />
      </div>
      {edges.start ? <div className={`${styles.fade} ${styles.fadeStart}`} aria-hidden="true" /> : null}
      {edges.end ? <div className={`${styles.fade} ${styles.fadeEnd}`} aria-hidden="true" /> : null}
    </div>
  );
}

/** The phone's one button for sorting and filtering (SRC-063). */
export function MobileFilterButton({ onClick }: { onClick: () => void }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <button type="button" className={styles.mobileFilterBtn} aria-label={he ? "מיון וסינון תוצאות" : "Sort & filter results"} aria-haspopup="dialog" onClick={onClick}>
      <Icon name="sliders" size="1.6em" />
    </button>
  );
}

/** The phone's full-screen panel: a bar with × and its title, the sections, and Show Results at the end. */
export function MobileFilterPanel({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const he = useInterfaceLang() === "hebrew";
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div ref={ref} tabIndex={-1} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} lang={he ? "he" : "en"} dir={he ? "rtl" : "ltr"}>
      <div className={styles.panelBar}>
        <button type="button" className={styles.panelClose} aria-label={he ? "סגירה" : "Close"} onClick={onClose}><Icon name="close" size="1.6em" /></button>
        <span id={titleId} className={styles.panelTitle}>{title}</span>
      </div>
      <div className={styles.panelBody}>{children}</div>
      <div className={styles.panelFoot}>
        <button type="button" className={styles.showResults} onClick={onClose}>{he ? "הצג תוצאות" : "Show Results"}</button>
      </div>
    </div>
  );
}

/** A titled section of that panel. */
export function PanelSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <section className={styles.panelSection}><h2>{title}</h2>{children}</section>;
}

/** The sort choices as a radio list. */
export function SortRadios<V extends string>({ options, value, onChange, name }: { options: readonly SortOption<V>[]; value: V; onChange: (v: V) => void; name: string }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <div role="radiogroup" className={styles.radios}>
      {options.map((o) => (
        <label key={o.value}><input type="radio" name={name} checked={o.value === value} onChange={() => onChange(o.value)} />{he ? o.he : o.en}</label>
      ))}
    </div>
  );
}

export function ExactToggle({ exact, onChange, block }: { exact: boolean; onChange: (exact: boolean) => void; block?: boolean }) {
  const he = useInterfaceLang() === "hebrew";
  const btn = (value: boolean, en: string, hb: string) => (
    <button type="button" aria-pressed={exact === value} onClick={() => exact !== value && onChange(value)} style={{ flex: block ? 1 : undefined, padding: "6px 14px", border: 0, borderRadius: 6, cursor: "pointer", fontSize: 15, background: exact === value ? "var(--sefaria-color-surface)" : "transparent", boxShadow: exact === value ? "0 1px 3px rgb(0 0 0 / 20%)" : "none", fontWeight: exact === value ? 600 : 400, color: "var(--sefaria-color-text)" }}>{he ? hb : en}</button>
  );
  return (
    <div role="group" aria-label={he ? "סוג חיפוש" : "Search type"} style={{ display: block ? "flex" : "inline-flex", gap: 2, padding: 3, borderRadius: 8, background: "#f5f5f4", border: "1px solid var(--sefaria-color-border)" }}>
      {btn(false, "All Results", "כל התוצאות")}
      {btn(true, "Exact Phrase", "ביטוי מדויק")}
    </div>
  );
}

const SORTS = SOURCE_SORTS;
export interface SortMenuProps<V extends string = SearchSort> { sort: V; onChange: (s: V) => void; disabled?: boolean; options?: readonly SortOption<V>[] }
/** The sort dropdown: the Sources sorts by default, or the options of an entity tab; the chosen one is ticked. */
export function SortMenu<V extends string = SearchSort>({ sort, onChange, disabled, options }: SortMenuProps<V>) {
  const he = useInterfaceLang() === "hebrew";
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", key); };
  }, [open]);
  const list = (options ?? (SORTS as unknown as SortOption<V>[]));
  const cur = list.find((s) => s.value === sort) ?? list[0]!;
  return (
    <div className={styles.sort} ref={ref}>
      <button type="button" className={styles.sortBtn} aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-disabled={disabled || undefined} aria-label={he ? `מיון לפי ${cur.he}` : `Sort by ${cur.en}`} onClick={() => !disabled && setOpen((o) => !o)}>
        <Icon name="sort-arrows" /><span>{he ? cur.he : cur.en}</span><Icon name="chevron-down" size="1em" />
      </button>
      {open ? (
        <div id={id} className={styles.menu} role="menu">
          {list.map((s) => (
            <button key={s.value} type="button" role="menuitemradio" aria-checked={s.value === sort} onClick={() => { setOpen(false); if (s.value !== sort) onChange(s.value); }}>
              <span className={styles.tick}>{s.value === sort ? <Icon name="check" size="1em" /> : null}</span>{he ? s.he : s.en}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface SearchResultCardProps {
  hit: MergedHit;
  hrefFor: (hit: SearchHit) => string;
  onOpen: (hit: SearchHit) => void;
}
/** One result: ref, matched words in bold, version, and — when other versions match too — "N more versions". The whole card opens it. */
export function SearchResultCard({ hit, hrefFor, onOpen }: SearchResultCardProps) {
  const he = useInterfaceLang() === "hebrew";
  const [shown, setShown] = useState(false);
  const s = hit._source;
  const snip = snippetOf(hit);
  const dups = (hit.duplicates ?? []).filter((d) => !!d._source.version);
  const n = dups.length;
  const open = (e: MouseEvent) => {
    // a click on a link or button inside is theirs; a drag-selection is not a click
    if ((e.target as Element).closest("a, button") || window.getSelection()?.type === "Range") return;
    if (plain(e)) onOpen(hit);
  };
  return (
    <article className={styles.card} style={{ ["--_c" as string]: categoryColor(s.categories?.[0]) }} onClick={open}>
      <Link className={styles.title} href={hrefFor(hit)} lang={he ? "he" : "en"} data-result-title="" onClick={(e) => { if (plain(e)) { e.preventDefault(); onOpen(hit); } }}>{he ? s.heRef : s.ref}</Link>
      <div className={styles.snippet} lang={snip.lang} dir={snip.lang === "he" ? "rtl" : "ltr"} dangerouslySetInnerHTML={{ __html: sanitizeHtml(snip.html) }} />
      <div className={styles.version} lang={he && s.hebrew_version_title ? "he" : "en"}>{(he && s.hebrew_version_title) || s.version}</div>
      {n > 0 ? (
        <>
          <button type="button" className={styles.more} data-open={shown} aria-expanded={shown} onClick={() => setShown((v) => !v)}>
            <InterfaceText en={`${n} more version${n > 1 ? "s" : ""}`} he={`${n} ${n > 1 ? "גרסאות נוספות" : "גרסה נוספת"}`} />
            <Icon name="chevron-down" className={styles.caret} size="0.9em" />
          </button>
          {shown ? (
            <div className={styles.nested}>
              {dups.map((d) => (
                <div key={d._id}>
                  <div className={styles.snippet} lang={snippetOf(d).lang} dangerouslySetInnerHTML={{ __html: sanitizeHtml(snippetOf(d).html) }} />
                  <div className={styles.version}><Link href={hrefFor(d)} data-result-title="" onClick={(e) => { if (plain(e)) { e.preventDefault(); onOpen(d); } }}>{(he && d._source.hebrew_version_title) || d._source.version}</Link></div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

export interface SearchFiltersProps {
  tree: readonly FilterNode[];
  applied: readonly string[];
  onToggle: (node: FilterNode) => void;
}
/** The Filters module: a box to find a filter, then the categories with counts as tri-state checkboxes, each opening to its books. */
export function SearchFilters({ tree, applied, onToggle }: SearchFiltersProps) {
  const he = useInterfaceLang() === "hebrew";
  const [text, setText] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggleOpen = (k: string) => setOpen((o) => { const n = new Set(o); if (!n.delete(k)) n.add(k); return n; });
  const rows = tree.filter((n) => matchesFilterText(n, text, applied));
  return (
    <section className={styles.filters} aria-label={he ? "סינון" : "Filters"}>
      <h2 className={styles.filtersTitle}><InterfaceText en="Filters" he="סינונים" /></h2>
      <input className={styles.filterBox} type="search" placeholder={he ? "חיפוש סינון" : "Find a filter"} aria-label={he ? "חיפוש סינון" : "Find a filter"} value={text} onChange={(e) => setText(e.target.value)} />
      <div>
        {rows.map((n) => {
          const state = selectionOf(n, applied);
          const expanded = open.has(n.key) || (text.trim() !== "" && n.children.some((c) => matchesFilterText(c, text, applied)));
          return (
            <div key={n.key}>
              <div className={styles.row}>
                <label lang={he ? "he" : "en"} title={`(${n.count})`}>
                  <Checkbox state={state} onChange={() => onToggle(n)} label={n.title} />
                  <span>{he ? n.heTitle : n.title} <span className={styles.num}>({n.count})</span></span>
                </label>
                {n.children.length ? (
                  <button type="button" className={styles.chev} aria-expanded={expanded} aria-label={he ? `הצגת ספרים: ${n.heTitle}` : `Show books in ${n.title}`} onClick={() => toggleOpen(n.key)}><Icon name="chevron-down" /></button>
                ) : null}
              </div>
              {expanded ? (
                <div className={styles.books}>
                  {n.children.filter((c) => matchesFilterText(c, text, applied) || text.trim() === "").map((c) => (
                    <div key={c.key} className={styles.row}>
                      <label>
                        <Checkbox state={selectionOf(c, applied)} onChange={() => onToggle(c)} label={c.title} />
                        <span>{c.title} <span className={styles.num}>({c.count})</span></span>
                      </label>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Checkbox({ state, onChange, label }: { state: "none" | "selected" | "partial"; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === "partial"; }, [state]);
  return <input ref={ref} type="checkbox" checked={state === "selected"} aria-checked={state === "partial" ? "mixed" : state === "selected"} aria-label={label} onChange={onChange} />;
}

const isAbsolute = (h: string) => /^https?:/.test(h);
/** The category path above a book's name: one line; when it does not fit, the middle becomes "…" (as on sefaria.org). */
function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      setCollapsed(false);
      requestAnimationFrame(() => setCollapsed(el.scrollWidth > el.clientWidth + 1 && items.length > 2));
    };
    fit();
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fit(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [items]);
  const shown = collapsed ? [items[0]!, { label: "…" }, items[items.length - 1]!] : items;
  return (
    <div ref={ref} className={styles.entityCrumbs}>
      {shown.map((c, i) => (
        <span key={`${c.label}-${i}`}>
          {i ? <Icon name="chevron-right" size="0.8em" /> : null}
          {"href" in c && c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
        </span>
      ))}
    </div>
  );
}

/** One Books / Authors / Topics result: a round icon, the crumbs above the name, a date or author line, the description. */
export function EntityCard({ type, hit, topicParent, liProps }: { type: EntityType; hit: EntityHit; topicParent?: TopicCategory; liProps?: Record<string, unknown> }) {
  const he = useInterfaceLang() === "hebrew";
  const name = he ? hit.title_he || hit.title_en : hit.title_en || hit.title_he;
  const desc = he ? hit.description_he || hit.description_en : hit.description_en || hit.description_he;
  const lang = he ? "he" : "en";
  const names = hit.author_names ?? [];
  const authorName = he ? names.find(isHebrew) : names.find((n) => !isHebrew(n)) ?? names[0];
  const bookDate = type === "book" && typeof hit.compDate === "number" ? formatYear(hit.compDate) : null;
  const lifespan = type === "author" ? authorLifespan(hit) : null;
  const date = bookDate ?? lifespan;
  const cats = hit.categories ?? [];
  const crumbs = cats.length
    ? cats.map((c, i) => ({ label: c, href: `/texts/${cats.slice(0, i + 1).join("/")}` }))
    : hit.categoryLabel_en ? [{ label: he ? hit.categoryLabel_he ?? hit.categoryLabel_en : hit.categoryLabel_en }]
    : topicParent ? [{ label: he ? topicParent.he : topicParent.en, href: `${SITE_ORIGIN}/topics/category/${topicParent.slug}` }] : [];
  const accent = type === "book" ? categoryColor(cats[0] ?? "") : "#000";
  const href = hit.url ?? entityHref(type, hit);
  const icon = type === "book" ? (hit.isCategory ? "layers" : "book") : type === "author" ? "pen" : "hash";
  const titleLink = useRef<HTMLAnchorElement>(null);
  return (
    // The whole card opens the result (a click on one of its own links goes where that link does)
    <li {...liProps} className={styles.entity} style={{ "--_c": accent } as never} onClick={(e) => { if (plain(e) && !(e.target as Element).closest("a")) titleLink.current?.click(); }}>
      <span className={styles.entityIcon} style={type === "book" ? { color: accent } : undefined}><Icon name={icon} size="1.4em" /></span>
      <div className={styles.entityBody}>
        {crumbs.length ? <Crumbs items={crumbs} /> : null}
        <Link ref={titleLink} className={styles.entityTitle} href={href} lang={lang} data-result-title="">{name}</Link>
        {date || authorName ? (
          <div className={styles.entityMeta} lang={lang}>
            {date ? (he ? date.he : date.en) : null}
            {date && authorName ? " · " : null}
            {authorName ? (hit.authors?.[0] ? <Link href={`${SITE_ORIGIN}/topics/${hit.authors[0]}?tab=author-works-on-sefaria`}>{authorName}</Link> : authorName) : null}
          </div>
        ) : null}
        {desc ? <p className={`${styles.entityDesc} ${type === "book" ? styles.bookDesc : ""}`} lang={lang}>{desc}</p> : null}
      </div>
    </li>
  );
}

/** `topicParents`: slug → the topic category above it (the topic TOC), for the crumb on Author and Topic cards. */
export function EntityResults({ type, hits, empty, topicParents, itemProps }: { type: EntityType; hits: readonly EntityHit[]; empty: ReactNode; topicParents?: Record<string, TopicCategory>; itemProps?: (hit: EntityHit, index: number) => Record<string, unknown> }) {
  if (!hits.length) return <>{empty}</>;
  return (
    <ul className={styles.list}>
      {hits.map((h, i) => <EntityCard key={`${h.url ?? h.slug ?? h.path}-${i}`} type={type} hit={h} topicParent={type !== "book" && h.slug ? topicParents?.[h.slug] : undefined} liProps={itemProps?.(h, i)} />)}
    </ul>
  );
}

const NONE: Record<SearchTab, { h: [string, string]; body: [string, string]; cta: [string, string]; href: string; img: string }> = {
  sources: { h: ["No sources found for", "לא נמצאו מקורות עבור"], body: ["Try a different spelling or shorter search term, change your filter/toggle selections, or browse the library.", "נסו איות אחר או מונח חיפוש קצר יותר, תשנו את הפילטרים/טוגל, או עיינו בספרייה."], cta: ["Browse Library", "לעיון בספרייה"], href: "/texts", img: "Source" },
  books: { h: ["No books found for", "לא נמצאו ספרים עבור"], body: ["Try a different spelling or shorter search term, or browse the library.", "נסו איות אחר, או מונח חיפוש קצר יותר, או עיינו בספרייה."], cta: ["Browse Library", "לעיון בספרייה"], href: "/texts", img: "Books" },
  authors: { h: ["No authors found for", "לא נמצאו מחברים עבור"], body: ["Try a different spelling or shorter search term, or browse all authors.", "נסו איות אחר, או מונח חיפוש קצר יותר, או עיינו בכל המחברים."], cta: ["Browse Authors", "לעיון בכל המחברים"], href: `${SITE_ORIGIN}/people`, img: "Authors" },
  topics: { h: ["No topics found for", "לא נמצאו נושאים עבור"], body: ["Try a different spelling or shorter search term, or browse all topics.", "נסו איות אחר, או מונח חיפוש קצר יותר, או עיינו בכל הנושאים."], cta: ["Browse Topics", "לעיון בכל הנושאים"], href: `${SITE_ORIGIN}/topics`, img: "Topics" },
};
/** Nothing found: an illustration per tab, the words, a way on, and where to report a problem (VERIFIED on sefaria.org, SRC-064). */
export function NoResults({ tab, query }: { tab: SearchTab; query: string }) {
  const he = useInterfaceLang() === "hebrew";
  const n = NONE[tab];
  return (
    <div className={styles.empty} lang={he ? "he" : "en"}>
      <img className={styles.emptyImg} src={`/img/no-results/NoResults${n.img}.svg`} alt="" aria-hidden="true" width={140} height={140} />
      <p className={styles.emptyHeading}>{he ? `${n.h[1]} ״${query}״` : `${n.h[0]} “${query}”`}</p>
      <p className={styles.emptyBody}>{he ? n.body[1] : n.body[0]}</p>
      <Link className={styles.emptyCta} href={n.href}>{he ? n.cta[1] : n.cta[0]}</Link>
      <p className={styles.emptyCaption}>
        {he ? <>נתקלתם בבעיה? אפשר <a href="https://sefaria.formstack.com/forms/hebrew_bugs">לדווח על תקלה</a> או <a href="mailto:hello@sefaria.org">ליצור איתנו קשר</a>.</> : <>Something seems wrong? <a href="https://sefaria.formstack.com/forms/bug_report">Report a bug</a> or <a href="mailto:hello@sefaria.org">contact us</a>.</>}
      </p>
    </div>
  );
}

/** The first query is running: shimmers for the tabs, the sort and eleven cards (as on sefaria.org; hidden from assistive tech). SRC-050 */
export function SearchSkeleton() {
  const he = useInterfaceLang() === "hebrew";
  return (
    <div className={styles.skeleton}>
      <VisuallyHidden role="status">{he ? "מבצע חיפוש..." : "Searching..."}</VisuallyHidden>
      <div aria-hidden="true">
        <div className={styles.skelTabs}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} width="110px" height="32px" />)}</div>
        <div className={styles.skelSort}><Skeleton width="140px" height="34px" /></div>
        <div className={styles.list}>{Array.from({ length: 11 }, (_, i) => <div key={i} className={styles.skelCard}><Skeleton width="40%" height="24px" /><Skeleton width="100%" height="16px" /><Skeleton width="85%" height="16px" /></div>)}</div>
      </div>
    </div>
  );
}

/**
 * A search that failed — said out loud, with a way to try again (sefaria.org shows "No sources found" instead, SRC-065). `more`:
 * the next page failed; what is already shown stays.
 */
export function SearchError({ onRetry, more }: { onRetry: () => void; more?: boolean }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <div role="alert" className={styles.error}>
      <p>{more ? (he ? "לא ניתן היה לטעון עוד תוצאות." : "More results could not be loaded.") : he ? "אירעה שגיאה בחיפוש." : "Something went wrong with the search."}</p>
      <button type="button" onClick={onRetry}>{he ? "ניסיון נוסף" : "Try again"}</button>
    </div>
  );
}
