/**
 * The table of contents of a book as a tree to render, built from its index record (schema + alternate structures).
 * A port of the old BookPage components SchemaNode / JaggedArrayNode / JaggedArrayNodeSection / ArrayMapNode /
 * DictionaryNode, without the DOM: the view only draws what this returns.
 *
 * @feature BOK-010 Schema node: collapsible complex sections
 * @feature BOK-011 Simple section grid (jagged array)
 * @feature BOK-012 Deep-nested text headings
 * @feature BOK-013 Zoomed-out TOC levels
 * @feature BOK-015 Alternate structure nodes (ArrayMap)
 * @feature BOK-016 Dictionary node letter browse
 * @feature BOK-017 Alternate structure tabs toggle
 * @feature BOK-018 Torah books: Chapters plus Torah Portions
 */
import { hebrewTerm, sectionLabel, type Bilingual } from "./labels";
import { refContains, splitSpanningRefNaive, zoomOutRef } from "./refs";

/** The slice of an index record the table of contents reads. Loose on purpose: the record is a union of node types. */
export interface TocNodeRecord {
  nodeType?: string;
  title?: string;
  heTitle?: string;
  default?: boolean;
  includeSections?: boolean;
  depth?: number;
  addressTypes?: string[];
  sectionNames?: string[];
  content_counts?: unknown;
  lengths?: number[];
  index_offsets_by_depth?: Record<string, number[] | number>;
  toc_zoom?: number;
  refs?: string[];
  wholeRef?: string;
  offset?: number;
  addresses?: number[];
  skipped_addresses?: number[];
  headwordMap?: [string, string][];
  displayFixedTitleSubSections?: boolean;
  nodes?: TocNodeRecord[];
}
export interface TocIndexRecord {
  title: string;
  schema: TocNodeRecord;
  alts?: Record<string, TocNodeRecord>;
  default_struct?: string;
  exclude_structs?: string[];
  categories?: string[];
}

export interface TocLink {
  label: Bilingual;
  ref: string;
  current: boolean;
}
export type TocItem =
  /** A heading (with children): collapsed unless it holds the current place. */
  | { kind: "group"; id: string; title: Bilingual; children: TocItem[]; collapsed: boolean; collapsible: boolean; ref?: string }
  /** A grid of numbered links. */
  | { kind: "links"; id: string; links: TocLink[]; heading?: Bilingual }
  /** A section with its own sub-grids ("Chapter 3" over its verse numbers), for texts three or more levels deep. */
  | { kind: "section"; id: string; name: Bilingual; children: TocItem[] }
  /** One link standing for a whole alternate-structure node (an ArrayMapNode with no section list). */
  | { kind: "link"; id: string; title: Bilingual; ref: string; current: boolean }
  /** Browse a dictionary by letter. */
  | { kind: "letters"; id: string; heading: Bilingual; links: TocLink[] };

export interface Current {
  /** The ref on screen (a verse, a range). */
  ref?: string;
  /** The section it's in ("Genesis 2"), which is what grid links are compared with. */
  sectionRef?: string;
}

export interface TocStructure {
  /** "schema" or the name of an alternate structure. */
  key: string;
  label: Bilingual;
  items: TocItem[];
}

const bi = (en: string | undefined, he: string | undefined): Bilingual => ({ en: en ?? "", he: he || en || "" });
const term = (en: string): Bilingual => ({ en, he: hebrewTerm(en) });

const isEmptyCount = (c: unknown): boolean => (typeof c === "number" ? c === 0 : Array.isArray(c) ? c.every(isEmptyCount) : !c);

/** Link suffix for "zoomed" arrays whose counts run deeper than the grid: ":1" down to the first non-empty branch. */
function refPathTerminal(count: unknown): string {
  if (typeof count === "number" || !Array.isArray(count)) return "";
  const i = count.findIndex(Boolean);
  return i < 0 ? ":" : `:${i + 1}${refPathTerminal(count[i])}`;
}

/** Counts per section for a jagged array node: its content counts, or one entry per section from `lengths`. */
function countsOf(node: TocNodeRecord): unknown {
  if (node.content_counts !== undefined) return node.content_counts;
  const first = node.lengths?.[0];
  if (first === undefined) return [];
  return node.depth === 1 ? first : new Array(first).fill(1);
}

const offsetOf = (node: TocNodeRecord): number => {
  const o = node.index_offsets_by_depth?.["1"];
  return typeof o === "number" ? o : 0;
};

interface Ctx {
  current: Current;
}

function jaggedSection(
  node: { depth: number; sectionNames: string[]; addressTypes: string[]; counts: unknown; refPath: string; offset: number },
  ctx: Ctx,
  idPrefix: string,
  currentSection: string | undefined,
): TocItem {
  if (node.depth > 2) {
    const counts = node.counts as unknown[];
    const children: TocItem[] = [];
    counts.forEach((count, i) => {
      if (isEmptyCount(count)) return;
      const label = sectionLabel(node.addressTypes[0], i);
      children.push({
        kind: "section",
        id: `${idPrefix}/${i}`,
        name: { en: `${node.sectionNames[0]} ${label.en}`, he: `${hebrewTerm(node.sectionNames[0]!)} ${label.he}` },
        children: [
          jaggedSection(
            { ...node, depth: node.depth - 1, sectionNames: node.sectionNames.slice(1), addressTypes: node.addressTypes.slice(1), counts: count, refPath: `${node.refPath}:${label.en}`, offset: 0 },
            ctx,
            `${idPrefix}/${i}`,
            currentSection,
          ),
        ],
      });
    });
    return { kind: "section", id: idPrefix, name: { en: "", he: "" }, children };
  }
  const counts: unknown[] = node.depth === 1 && typeof node.counts === "number" ? new Array(node.counts).fill(1) : (node.counts as unknown[]);
  const links: TocLink[] = [];
  counts.forEach((count, i) => {
    if (isEmptyCount(count)) return;
    const label = sectionLabel(node.addressTypes[0], i, node.offset);
    const ref = `${node.refPath}:${label.en}`.replace(":", " ") + refPathTerminal(count);
    const current =
      ref === currentSection || ref === ctx.current.ref || (node.depth > 1 && !!refContains(currentSection, ref)); // depth-1 texts: the section ref names the whole text
    links.push({ label, ref, current });
  });
  return { kind: "links", id: idPrefix, links };
}

function jaggedItems(node: TocNodeRecord, refPath: string, ctx: Ctx, id: string, header?: string, topLevel = false): TocItem[] {
  const depth = node.depth ?? 1;
  const sectionNames = node.sectionNames ?? [];
  const addressTypes = node.addressTypes ?? ["Integer"];
  const counts = countsOf(node);
  const offset = offsetOf(node);
  if (node.toc_zoom !== undefined) {
    const zoom = node.toc_zoom - 1;
    const cur = ctx.current.sectionRef && zoom ? zoomOutRef(ctx.current.sectionRef, zoom) : ctx.current.sectionRef;
    const sliced = zoom ? { sectionNames: sectionNames.slice(0, -zoom), addressTypes: addressTypes.slice(0, -zoom) } : { sectionNames, addressTypes };
    return [jaggedSection({ depth: depth - zoom, ...sliced, counts, refPath, offset }, ctx, id, cur)];
  }
  const heading = header ?? sectionNames[0] ?? "Chapters";
  const out: TocItem[] = [];
  const section = jaggedSection({ depth, sectionNames, addressTypes, counts, refPath, offset }, ctx, id, ctx.current.sectionRef);
  if (section.kind === "links" && topLevel && (depth <= 2 || header)) section.heading = term(heading);
  out.push(section);
  return out;
}

function arrayMapItem(node: TocNodeRecord, refPath: string, ctx: Ctx, id: string): TocItem {
  const title = bi(node.title, node.heTitle);
  const includeSections = node.includeSections ?? true;
  if (node.refs?.length && includeSections) {
    let skip = 0;
    const links: TocLink[] = [];
    node.refs.forEach((ref, idx) => {
      let i = idx;
      if (node.addresses) i = node.addresses[idx]! - 1;
      else {
        i += node.offset ?? 0;
        if (node.skipped_addresses) {
          i += skip;
          while (node.skipped_addresses.includes(i + 1)) {
            skip++;
            i++;
          }
        }
      }
      if (ref === "") return;
      const label = sectionLabel(node.addressTypes?.[0], i);
      const current = ref === ctx.current.sectionRef || ref === ctx.current.ref || !!refContains(ref, ctx.current.ref);
      links.push({ label, ref, current });
    });
    const ref = node.wholeRef ? splitSpanningRefNaive(node.wholeRef) : undefined;
    return {
      kind: "group",
      id,
      title,
      ref,
      collapsible: !node.displayFixedTitleSubSections,
      collapsed: false,
      children: [{ kind: "links", id: `${id}/links`, links }],
    };
  }
  const whole = node.wholeRef ?? refPath;
  const current = !!ctx.current.sectionRef && (whole === ctx.current.ref || !!refContains(whole, ctx.current.ref));
  return { kind: "link", id, title, ref: whole, current };
}

function dictionaryItem(node: TocNodeRecord, ctx: Ctx, id: string): TocItem {
  const heading = node.title ? bi(node.title, node.heTitle) : { en: "Browse By Letter", he: 'לפי סדר הא"ב' };
  const rf = ctx.current.sectionRef;
  const currentLetter = rf ? rf.substring(0, rf.lastIndexOf(",") + 3) : undefined;
  const links = (node.headwordMap ?? []).map(([letter, ref]) => ({ label: { en: letter, he: letter }, ref, current: ref === currentLetter }));
  return { kind: "letters", id, heading, links };
}

function shouldCollapse(node: TocNodeRecord, refPath: string, ctx: Ctx): boolean {
  const full = refPath + (node.default ? "" : `, ${node.title}`);
  return !refContains(full, ctx.current.ref) && !node.default && !node.includeSections;
}

/** One schema (or alternate structure) level: children as items; `top` suppresses collapsing (the old topLevel). */
function schemaItems(schema: TocNodeRecord, refPath: string, ctx: Ctx, id: string, opts: { top?: boolean; header?: string; fixed?: boolean }): TocItem[] {
  if (!schema.nodes) {
    if (schema.nodeType === "JaggedArrayNode") return jaggedItems(schema, refPath, ctx, id, opts.header, opts.top);
    if (schema.nodeType === "ArrayMapNode") return [arrayMapItem(schema, refPath, ctx, id)];
    if (schema.nodeType === "DictionaryNode") return [dictionaryItem(schema, ctx, id)];
    return [];
  }
  const items: TocItem[] = [];
  schema.nodes.forEach((node, i) => {
    const childId = `${id}/${i}`;
    const path = `${refPath}, ${node.title}`;
    if (node.nodeType === "ArrayMapNode") {
      items.push(arrayMapItem(opts.fixed ? { ...node, displayFixedTitleSubSections: true } : node, refPath, ctx, childId));
    } else if (node.nodes) {
      items.push({
        kind: "group",
        id: childId,
        title: bi(node.title, node.heTitle),
        collapsible: !opts.fixed,
        collapsed: opts.top || opts.fixed ? false : shouldCollapse(node, refPath, ctx),
        children: schemaItems(node, path, ctx, childId, {}),
      });
    } else if (node.nodeType === "DictionaryNode") {
      items.push(dictionaryItem(node, ctx, childId));
    } else {
      if (node.depth === 1 && !node.default) {
        // A title that points straight to content
        items.push({ kind: "link", id: childId, title: bi(node.title, node.heTitle), ref: path, current: path === ctx.current.sectionRef });
        return;
      }
      const children = schemaItems(node, node.default ? refPath : path, ctx, childId, {});
      items.push({
        kind: "group",
        id: childId,
        // a default node has no heading of its own: its grid sits at the level above
        title: node.default ? { en: "", he: "" } : bi(node.title, node.heTitle),
        collapsible: !opts.fixed && !node.default,
        collapsed: opts.top || opts.fixed ? false : shouldCollapse(node, refPath, ctx),
        children,
      });
    }
  });
  return items;
}

const TORAH_BOOKS = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"];
export const isTorahBook = (rec: TocIndexRecord): boolean => TORAH_BOOKS.includes(rec.title) && !!rec.alts?.["Parasha"];

/** The structures a reader can switch between, in the old order: the default one first, then the others. */
export function tocStructures(rec: TocIndexRecord, current: Current = {}): TocStructure[] {
  const ctx: Ctx = { current };
  const alts = rec.alts ?? {};
  const excluded = new Set(rec.exclude_structs ?? []);
  const torah = isTorahBook(rec);
  const out: TocStructure[] = [];
  if (!excluded.has("schema")) {
    if (torah) {
      // Chapters and Torah portions side by side, no toggle
      out.push({
        key: "schema",
        label: term("Chapters"),
        items: [
          ...schemaItems(rec.schema, rec.title, ctx, "schema", { top: true, header: "Chapters" }),
          {
            kind: "group",
            id: "parasha",
            title: term("Torah Portions"),
            collapsible: false,
            collapsed: false,
            children: schemaItems(alts["Parasha"]!, rec.title, ctx, "parasha", { top: true, fixed: true }),
          },
        ],
      });
    } else {
      out.push({ key: "schema", label: term(rec.schema.sectionNames?.[0] ?? "Contents"), items: schemaItems(rec.schema, rec.title, ctx, "schema", { top: true }) });
    }
  }
  for (const [key, alt] of Object.entries(alts)) {
    if (excluded.has(key) || (torah && key === "Parasha")) continue;
    out.push({ key, label: { en: key, he: hebrewTerm(key) }, items: schemaItems(alt, rec.title, ctx, `alt:${key}`, { top: true }) });
  }
  const preferred = rec.default_struct && alts[rec.default_struct] ? rec.default_struct : "schema";
  const sorted = [...out.filter((s) => s.key === preferred), ...out.filter((s) => s.key !== preferred)];
  // With a toggle, a grid headed with the name of its own tab drops the heading (the tab says it already)
  if (sorted.length > 1 && !torah) {
    const names = new Set(sorted.map((s) => s.label.en));
    for (const s of sorted) for (const item of s.items) if (item.kind === "links" && item.heading && names.has(item.heading.en)) delete item.heading;
  }
  return sorted;
}
