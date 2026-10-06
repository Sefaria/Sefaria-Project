import { useEffect, useRef, useState } from "react";
import type { TocItem, TocLink, TocStructure } from "~/lib/toc/model";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { refToUrl } from "~/lib/ref/url";
import { Icon } from "../Icon/Icon";
import { Link } from "../Link/Link";
import { SegmentedControl } from "../SegmentedControl/SegmentedControl";
import styles from "./TocView.module.css";

export interface TocViewProps {
  structures: TocStructure[];
  /** Which structure shows (the first by default). */
  activeKey?: string;
  onActiveKeyChange?: (key: string) => void;
  /** Follows a link in place; links are real addresses regardless. */
  onOpenRef?: (ref: string) => void;
  /** A string that changes when the reader's place does (re-opens the groups holding it, scrolls it into view). */
  placeKey?: string;
  /** "page" draws the book page's larger tiles and two-column portions. */
  variant?: "sidebar" | "page";
  /** Level of the top headings (Chapters, Torah Portions): 3 in the sidebar, 2 on a page whose title is the h1. */
  headingLevel?: 2 | 3;
}

const href = (ref: string) => `/${refToUrl(ref)}`;

/**
 * A book's table of contents: grids of section numbers (chapters, dafs, aliyot), titled groups for the parts of a
 * complex text, and a toggle between structures when the book has more than one. The reader's current place is marked
 * and scrolled into view. Replaces TextTableOfContents / SchemaNode / JaggedArrayNode / ArrayMapNode / DictionaryNode.
 *
 * @feature BOK-008 TOC click navigation
 * @feature BOK-009 TOC reused in reader Connections panel
 * @feature BOK-010 Schema node: collapsible complex sections
 * @feature BOK-011 Simple section grid (jagged array)
 * @feature BOK-017 Alternate structure tabs toggle
 */
export function TocView({ structures, activeKey, onActiveKeyChange, onOpenRef, placeKey, variant = "sidebar", headingLevel = variant === "page" ? 2 : 3 }: TocViewProps) {
  const lang = useInterfaceLang();
  const code = langCode(lang);
  const [localKey, setLocalKey] = useState<string>();
  const key = activeKey ?? localKey ?? structures[0]?.key;
  const structure = structures.find((s) => s.key === key) ?? structures[0];
  const rootRef = useRef<HTMLDivElement>(null);

  // Where the reader is stays in view; groups are re-opened only when the place changes
  useEffect(() => {
    rootRef.current?.querySelector("[data-current]")?.scrollIntoView?.({ block: "center" });
  }, [placeKey, key]);

  if (!structure) return null;
  const pick = (k: string) => (onActiveKeyChange ? onActiveKeyChange(k) : setLocalKey(k));
  const text = (b: { en: string; he: string }) => (lang === "hebrew" ? b.he || b.en : b.en);

  return (
    <div className={styles.view} ref={rootRef} data-variant={variant}>
      {structures.length > 1 ? (
        <div className={styles.tabs}>
          <SegmentedControl label="Structure" value={structure.key} onValueChange={pick} options={structures.map((s) => ({ value: s.key, label: text(s.label) }))} />
        </div>
      ) : null}
      <Items items={structure.items} onOpenRef={onOpenRef} placeKey={placeKey} text={text} code={code} level={headingLevel} />
    </div>
  );
}

interface ItemsProps {
  items: TocItem[];
  onOpenRef?: (ref: string) => void;
  placeKey?: string;
  text: (b: { en: string; he: string }) => string;
  code: "en" | "he";
  level: 2 | 3;
}

function Items({ items, ...rest }: ItemsProps) {
  return (
    <div className={styles.level}>
      {items.map((item) => (
        <Item key={item.id} item={item} {...rest} />
      ))}
    </div>
  );
}

function SectionLink({ link, onOpenRef, code }: { link: TocLink; onOpenRef?: (ref: string) => void; code: "en" | "he" }) {
  return (
    <li>
      <Link
        className={styles.sectionLink}
        href={href(link.ref)}
        lang={code}
        aria-current={link.current ? "location" : undefined}
        data-current={link.current || undefined}
        onClick={(e) => {
          if (onOpenRef && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            onOpenRef(link.ref);
          }
        }}
      >
        {code === "he" ? link.label.he : link.label.en}
      </Link>
    </li>
  );
}

function Item({ item, onOpenRef, placeKey, text, code, level }: { item: TocItem } & Omit<ItemsProps, "items">) {
  const Heading = `h${level}` as "h2" | "h3";
  const [collapsed, setCollapsed] = useState(item.kind === "group" ? item.collapsed : false);
  // A new place re-opens the group that holds it (the old client re-derived collapsed state on every move)
  useEffect(() => {
    if (item.kind === "group") setCollapsed(item.collapsed);
  }, [placeKey, item]);
  const open = (e: React.MouseEvent, ref: string) => {
    if (onOpenRef && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      onOpenRef(ref);
    }
  };

  switch (item.kind) {
    case "links":
      return (
        <div>
          {item.heading ? <Heading className={styles.heading} lang={code}>{text(item.heading)}</Heading> : null}
          <ul className={styles.grid}>
            {item.links.map((l) => (
              <SectionLink key={l.ref} link={l} onOpenRef={onOpenRef} code={code} />
            ))}
          </ul>
        </div>
      );
    case "letters":
      return (
        <div>
          <Heading className={styles.heading} lang={code}>{text(item.heading)}</Heading>
          <ul className={styles.grid}>
            {item.links.map((l) => (
              <SectionLink key={l.ref} link={l} onOpenRef={onOpenRef} code={code} />
            ))}
          </ul>
        </div>
      );
    case "link":
      return (
        <Link className={styles.titleLink} href={href(item.ref)} lang={code} aria-current={item.current ? "location" : undefined} data-current={item.current || undefined} onClick={(e) => open(e, item.ref)}>
          {text(item.title)}
        </Link>
      );
    case "section":
      return (
        <div>
          {item.name.en ? <div className={styles.sectionName} lang={code}>{text(item.name)}</div> : null}
          <Items items={item.children} onOpenRef={onOpenRef} placeKey={placeKey} text={text} code={code} level={level} />
        </div>
      );
    case "group": {
      const body = collapsed ? null : <Items items={item.children} onOpenRef={onOpenRef} placeKey={placeKey} text={text} code={code} level={level} />;
      const title = text(item.title);
      if (!title) return body; // a default node: its content, no heading of its own
      if (!item.collapsible) {
        // Fixed heading, linking to the start of the part when it has a place to go
        return (
          <div className={styles.group} data-fixed-group={item.ref ? "part" : "heading"}>
            {item.ref ? (
              <Link className={styles.groupTitle} data-fixed href={href(item.ref)} lang={code} onClick={(e) => open(e, item.ref!)}>{title}</Link>
            ) : (
              <Heading className={styles.groupTitle} data-fixed lang={code}>{title}</Heading>
            )}
            {body}
          </div>
        );
      }
      return (
        <div className={styles.group}>
          <button type="button" className={styles.groupTitle} lang={code} aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>
            {title}
            <Icon name="chevron-down" className={styles.chevron} data-open={!collapsed} size="0.6em" />
          </button>
          {body}
        </div>
      );
    }
  }
}
