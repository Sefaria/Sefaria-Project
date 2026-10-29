# Sefaria Reader (next) — Architecture

A from-scratch web client for the Sefaria library, built with React 19 and TanStack Start.
The feature scope is the **Feature Atlas** (`docs/features/features.json`, 941 features with IDs like `TXD-012`),
extracted from a full read of the current client in `Sefaria-Project`.

## Tenets

1. **The local library cache is the product's backbone.** Anything already fetched is never fetched again
   unless it might have changed, and it survives reloads. Reading must feel instant on revisit and work offline for
   anything seen before. See *Library cache* below.
2. **No clever client/server sync.** The server (Sefaria API) is the source of truth. Reads are cached;
   writes are plain requests followed by invalidating the affected cache entries. No optimistic CRDTs, no live sync.
3. **The URL is the reader state.** Every panel, ref, version, language and sidebar mode is encoded in the URL using
   Sefaria's existing scheme (`/Genesis.1.1?lang=bi&with=Rashi&ven=...`), so old links keep working and
   back/forward is free. See `inv_01_urls_routing.md` in the atlas.
   Panels and side panels: a workspace of panels arranged by a layout tree, each panel owning its side panels,
   encoded in the old `p2=`/`w2=` grammar. See `docs/WORKSPACE.md`.
4. **Every book type is a first-class citizen.** Tanakh, Talmud (daf/amud), Yerushalmi, Mishnah, commentary,
   complex schemas (Siddur, Haggadah), dictionaries, alternate structures. Behaviour is driven by index metadata
   (`textDepth`, `addressTypes`, `sectionNames`, `alts`, schema nodes), never by hard-coded titles, except where the
   old client deliberately special-cases a title and the atlas records it. See `docs/BOOK_TYPES.md`.
5. **One component per job.** The component library in `src/ui` is catalogued in Storybook. Before adding a
   component, find it in Storybook; prefer a variant over a near-duplicate. See `docs/COMPONENT_AUDIT.md`.
6. **Everything is tested, and tests point at features.** Tests and stories reference atlas IDs
   (`// @feature TXD-012`). `npm run features:coverage` reports which atlas features have coverage.
7. **Server-rendered first paint.** Text pages render on the server (SEO, first paint), then hydrate. The server
   render seeds the client cache, so hydration never refetches.

## Layers

```
src/
  routes/            TanStack Router file routes (thin: parse URL → load via cache → render feature)
  features/          Feature modules (reader, toc, search, …): composition of ui + data hooks
  ui/                Component library (tokens, primitives, layout, domain components) — Storybook-catalogued
  lib/
    api/             Typed Sefaria API access (vendored toolkit client) + query option factories
    cache/           Library cache: persistence, policies, section store, prefetch
    ref/             Ref ⇄ URL encoding, Hebrew numerals, daf/amud, ref arithmetic helpers
    layout/          Generic layout tree (rows/columns of leaves) for panels and side panels
    workspace/       Workspace model, pure operations, legacy sizing, URL codec (docs/WORKSPACE.md)
    i18n/            Interface strings (English/Hebrew), direction helpers
vendor/sefaria-toolkit/   Vendored from arithmomaniac/sefaria-frontend-toolkit (GPL-3.0): API client + text-transform
fixtures/api/        Recorded real API responses per book type (tests never hit the network)
```

## Library cache

The cache engine is TanStack Query. On top of it sits a small domain layer (`src/lib/cache`).

| Layer | What | Notes |
|---|---|---|
| L0 in-flight | Query deduplication | Two components asking for the same section share one request |
| L1 memory | Query cache | `gcTime` long (hours) so navigating back is instant |
| L2 disk | IndexedDB, **per-query** persister | Survives reloads; each entry stored separately so large libraries don't serialise one blob |
| L3 network | Sefaria public API | `fetch` via the vendored, validated client (its own memory cache disabled) |
| SSR seed | Dehydrated queries | Server-render fills L1 on the client; no refetch on hydrate |

**Data classes and policies** (`src/lib/cache/policies.ts`):

| Class | Examples | staleTime | Kept on disk |
|---|---|---|---|
| catalog | TOC, index, shape, versions list | 1 day | 30 days |
| text | v3 texts by section + version selection | 7 days | 30 days |
| connections | related, links, link counts | 1 hour | 7 days |
| reference | lexicon, dictionary entries | 30 days | 90 days |
| search | search results, autocomplete | 5 min | not persisted |
| user | profile, saved, history, notes | 0 | not persisted |

Stale data is shown immediately and revalidated in the background (stale-while-revalidate). A cache *buster*
(app schema version) invalidates disk entries when response shapes change.

**Section granularity.** Texts are always fetched and cached by *section* (e.g. `Genesis 1`, `Berakhot 2a`), never
by segment. A request for `Genesis 1:3` or `Genesis 1:3-5` resolves to its section and the segments are derived
locally. A ranged ref that spans sections is assembled from the section entries. An alias table (requested ref → section key)
is cached too, so a ref string seen once never needs the network to resolve again.

**Prefetch.** When a section renders, its `next`/`prev` sections and their link counts are prefetched at idle
priority. Hovering a table-of-contents entry prefetches that section.

## Testing

| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest (jsdom) | `lib/*` pure logic: refs, numerals, cache policies, section derivation |
| Component | Storybook stories run as Vitest browser tests (Chromium) + a11y addon | every `ui` component's states |
| Integration | Vitest + Testing Library + MSW serving `fixtures/api` | routes/features against every book type |
| E2E | Playwright (later) | critical journeys against the dev server |

Every book type in `fixtures/api/manifest.json` must render through the reader without errors (book-type matrix test).
