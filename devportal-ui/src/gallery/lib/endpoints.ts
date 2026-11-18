/** Base paths from Sefaria's public API reference (developers.sefaria.org). */
export const KNOWN_ENDPOINTS = [
  '/api/texts',
  '/api/v3/texts',
  '/api/texts/versions',
  '/api/texts/translations',
  '/api/texts/random-by-topic',
  '/api/bulktext',
  '/api/passages',
  '/api/index',
  '/api/v2/raw/index',
  '/api/shape',
  '/api/links',
  '/api/related',
  '/api/ref-topic-links',
  '/api/link-summary',
  '/api/search-wrapper',
  '/api/find-refs',
  '/api/name',
  '/api/topics',
  '/api/v2/topics',
  '/api/topics-graph',
  '/api/recommend/topics',
  '/api/calendars',
  '/api/calendars/next-read',
  '/api/sheets',
  '/api/collections',
  '/api/counts',
  '/api/authors',
  '/api/manuscripts',
  '/api/img-gen',
  '/api/ref',
  '/api/profile',
  '/api/async',
  '/api/words/completion',
  '/api/words',
] as const;

// Longest base first so a specific base wins over a shorter one it also matches.
const BY_LENGTH_DESC = [...KNOWN_ENDPOINTS].sort((a, b) => b.length - a.length);

/** Collapse query strings, trailing slashes and extra segments onto a known base path. */
export function normalizeEndpoint(raw: string): string {
  const withoutQuery = (raw.trim().split('?')[0] ?? '').trim();
  const path = withoutQuery.length > 1 && withoutQuery.endsWith('/') ? withoutQuery.slice(0, -1) : withoutQuery;
  return BY_LENGTH_DESC.find((base) => path === base || path.startsWith(`${base}/`)) ?? path;
}

export const RESOURCE_GROUPS = [
  'Texts',
  'Index & structure',
  'Calendars',
  'Links & Related',
  'Search',
  'Dictionary (Words)',
  'Documentation',
  'Name Lookup',
  'Sefaria-Export',
  'Sefaria MCP',
  'Manuscripts',
] as const;
export type ResourceGroup = (typeof RESOURCE_GROUPS)[number];

const NAMED: Record<string, ResourceGroup> = {
  text: 'Texts',
  calendars: 'Calendars',
  documentation: 'Documentation',
  'sefaria-export': 'Sefaria-Export',
  'sefaria mcp': 'Sefaria MCP',
  manuscripts: 'Manuscripts',
};

/**
 * Map a raw `sefaria_tools_used` value to a friendly group, or null when it is
 * the generic "Sefaria API" or otherwise unmapped (excluded from the chart).
 */
export function resourceGroup(raw: string): ResourceGroup | null {
  const named = NAMED[raw.trim().toLowerCase()];
  if (named) return named;
  const path = normalizeEndpoint(raw);
  if (!path.startsWith('/')) return null;
  if (path === '/api/text' || path.startsWith('/api/texts') || path === '/api/v3/texts') {
    return 'Texts';
  }
  if (
    path.startsWith('/api/index') ||
    path === '/api/v2/raw/index' ||
    path === '/api/v2/index' ||
    path === '/api/shape' ||
    path === '/api/counts'
  ) {
    return 'Index & structure';
  }
  if (path.startsWith('/api/calendars')) return 'Calendars';
  if (path === '/api/links' || path === '/api/related') return 'Links & Related';
  if (path.startsWith('/api/search')) return 'Search';
  if (path.startsWith('/api/words')) return 'Dictionary (Words)';
  if (path === '/api/name') return 'Name Lookup';
  if (path === '/api/manuscripts') return 'Manuscripts';
  return null;
}
