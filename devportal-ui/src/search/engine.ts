// The in-browser search engine (PLAN §2.9): a MiniSearch index over the search documents (contract C3),
// built the first time the modal opens from /_portal/search-docs.<sha>.json.
import MiniSearch, { type SearchResult as MiniSearchResult } from 'minisearch';
import type { HttpMethod, PortalPath, SearchDocument, SearchDocuments, Section } from '../contracts';

/** The modal's tabs, in order. `all` counts every result; the others count one section each. */
export type SearchTabId = 'all' | Section;

export const SEARCH_TABS: readonly { id: SearchTabId; label: string; icon: SearchTabIcon }[] = [
  { id: 'all', label: 'All', icon: 'search' },
  { id: 'docs', label: 'Docs', icon: 'book-open' },
  { id: 'reference', label: 'API Reference', icon: 'code' },
  { id: 'page', label: 'Pages', icon: 'custom-pages' },
];

/** Icon names of `icons.tsx` used by the tabs and the result rows. */
export type SearchTabIcon = 'search' | 'book-open' | 'code' | 'custom-pages';

/** Results per page, as on live ("Back · 1 of N · Next"). */
export const PAGE_SIZE = 15;

/** Characters of context shown before the first match in a body snippet. */
const SNIPPET_LEAD = 40;
const SNIPPET_LENGTH = 220;

/** A piece of snippet text; `match` pieces are drawn highlighted. */
export interface SnippetPart {
  text: string;
  match: boolean;
}

/**
 * What the row shows under the title. `text` is a plain line (title, API path, body window);
 * `response` is live's "Response Body • 200 • …"; `param` is "Parameter • name • …".
 */
export type Snippet =
  | { kind: 'text'; parts: SnippetPart[] }
  | { kind: 'response'; status: string; parts: SnippetPart[] }
  | { kind: 'param'; name: string; parts: SnippetPart[] };

export interface SearchHit {
  id: string;
  title: string;
  path: PortalPath;
  section: Section;
  kind: SearchDocument['kind'];
  method: HttpMethod | null;
  snippet: Snippet;
}

export interface SearchOutcome {
  hits: SearchHit[];
  counts: Record<SearchTabId, number>;
}

const FIELDS = ['title', 'path', 'headings', 'excerpt', 'body', 'params'] as const;
type Field = (typeof FIELDS)[number];

function fieldText(doc: SearchDocument, field: Field): string {
  switch (field) {
    case 'path':
      // The slug only: every reference path starts with /reference/, which would match "ref" everywhere.
      return doc.path.replace(/^\/(docs|reference|page)\//, '');
    case 'headings':
      return doc.headings.join('\n');
    case 'params':
      return [...doc.params.map((p) => `${p.name} ${p.description}`), ...doc.responses.map((r) => r.description)].join(
        '\n'
      );
    default:
      return doc[field];
  }
}

/** Light fuzziness: one edit for terms of five letters or more, none below. */
function fuzzy(term: string): number | false {
  return term.length >= 5 ? 1 : false;
}

export class SearchIndex {
  readonly documents: ReadonlyMap<string, SearchDocument>;
  private readonly mini: MiniSearch<SearchDocument>;

  constructor(documents: readonly SearchDocument[]) {
    this.documents = new Map(documents.map((doc) => [doc.id, doc]));
    this.mini = new MiniSearch<SearchDocument>({
      idField: 'id',
      fields: [...FIELDS],
      extractField: (doc, field) => (field === 'id' ? doc.id : fieldText(doc, field as Field)),
      searchOptions: {
        boost: { title: 5, path: 3, headings: 2, excerpt: 2 },
        prefix: true,
        fuzzy,
        combineWith: 'AND',
      },
    });
    this.mini.addAll([...this.documents.values()]);
  }

  search(query: string): SearchOutcome {
    const counts: Record<SearchTabId, number> = { all: 0, docs: 0, reference: 0, page: 0 };
    const trimmed = query.trim();
    if (trimmed === '') return { hits: [], counts };
    let raw = this.mini.search(trimmed);
    if (raw.length === 0) raw = this.mini.search(trimmed, { combineWith: 'OR' });
    const queryTerms = tokenize(trimmed);
    const hits: SearchHit[] = [];
    for (const result of raw) {
      const doc = this.documents.get(String(result.id));
      if (doc === undefined) continue;
      hits.push(toHit(doc, highlightTerms(queryTerms, result)));
      counts.all += 1;
      counts[doc.section] += 1;
    }
    return { hits, counts };
  }
}

function tokenize(text: string): string[] {
  return MiniSearch.getDefault('tokenize')(text)
    .map((t: string) => t.toLowerCase())
    .filter((t: string) => t !== '');
}

/** The words to highlight: what was typed plus the index terms that matched (prefix and fuzzy hits). */
function highlightTerms(queryTerms: string[], result: MiniSearchResult): string[] {
  const all = new Set<string>([...queryTerms, ...result.terms.map((t) => t.toLowerCase())]);
  return [...all].filter((t) => t.length > 0).sort((a, b) => b.length - a.length);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matcher(terms: string[]): RegExp | null {
  if (terms.length === 0) return null;
  return new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
}

/** Splits `text` into plain and highlighted parts. */
export function highlight(text: string, terms: string[]): SnippetPart[] {
  const re = matcher(terms);
  if (re === null || text === '') return [{ text, match: false }];
  const parts: SnippetPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (m[0] === '') continue;
    if (start > last) parts.push({ text: text.slice(last, start), match: false });
    parts.push({ text: m[0], match: true });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

function firstMatch(text: string, terms: string[]): number {
  const re = matcher(terms);
  if (re === null) return -1;
  const m = re.exec(text);
  return m === null ? -1 : m.index;
}

/** A one-line window of `text` around its first match, with "…" where it was cut. */
export function windowAround(text: string, terms: string[]): string | null {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = firstMatch(flat, terms);
  if (at < 0) return null;
  let start = Math.max(0, at - SNIPPET_LEAD);
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    if (space > -1 && space < at) start = space + 1;
  }
  const end = Math.min(flat.length, start + SNIPPET_LENGTH);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

function textSnippet(text: string, terms: string[]): Snippet {
  return { kind: 'text', parts: highlight(text, terms) };
}

function snippetFor(doc: SearchDocument, terms: string[]): Snippet {
  const has = (text: string) => firstMatch(text, terms) >= 0;
  if (doc.kind === 'endpoint') {
    if (has(doc.title)) return textSnippet(doc.title, terms);
    const lines = doc.body.split('\n');
    const apiPath = lines[0] ?? '';
    if (apiPath.startsWith('/') && has(apiPath)) return textSnippet(apiPath, terms);
    const inBody = windowAround(lines.slice(1).join(' '), terms);
    if (inBody !== null) return textSnippet(inBody, terms);
    for (const response of doc.responses) {
      const window = windowAround(response.description, terms);
      if (window !== null) return { kind: 'response', status: response.status, parts: highlight(window, terms) };
    }
    for (const param of doc.params) {
      const window = has(param.name) ? param.description || param.name : windowAround(param.description, terms);
      if (window !== null) return { kind: 'param', name: param.name, parts: highlight(window, terms) };
    }
    return textSnippet(apiPath.startsWith('/') ? apiPath : doc.title, terms);
  }
  const window = windowAround(doc.body, terms) ?? windowAround(doc.excerpt, terms);
  if (window !== null) return textSnippet(window, terms);
  for (const heading of doc.headings) if (has(heading)) return textSnippet(heading, terms);
  if (has(doc.title)) return textSnippet(doc.title, terms);
  return textSnippet(doc.excerpt || doc.body.slice(0, SNIPPET_LENGTH) || doc.title, terms);
}

function toHit(doc: SearchDocument, terms: string[]): SearchHit {
  return {
    id: doc.id,
    title: doc.title,
    path: doc.path,
    section: doc.section,
    kind: doc.kind,
    method: doc.method,
    snippet: snippetFor(doc, terms),
  };
}

const cache = new Map<string, Promise<SearchIndex>>();

/** Fetches the search documents once per URL and builds the index; a failure is not cached. */
export function loadSearchIndex(url: string, fetcher: typeof fetch = fetch): Promise<SearchIndex> {
  let pending = cache.get(url);
  if (pending === undefined) {
    pending = fetcher(url, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`search documents: HTTP ${response.status}`);
        return response.json() as Promise<SearchDocuments>;
      })
      .then((file) => new SearchIndex(file.documents));
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return pending;
}

/** Tests only: forget loaded indexes. */
export function clearSearchIndexCache(): void {
  cache.clear();
}
