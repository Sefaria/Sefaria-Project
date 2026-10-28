# Cross-cutting

What spans many product areas, and anything said in **#reader-future** that does not belong to one area. Claude Tag keeps this page
with the same rules as the area files (statuses idea · proposed · agreed · decided; every change cites its Slack message), and
links each item to the areas it touches.

## Design system and components

_Not discussed yet. Today: the new client's component library is React + Storybook (`reader-next/src/ui`), tokens in
`reader-next/src/ui/tokens`._

## Data layer and caching

_Today: TanStack Query with IndexedDB persistence per query (`reader-next/src/lib/cache`)._

- **Adapter boundary over the text model.** Text, version, link and catalog data reach features and components only through the
  domain modules in `reader-next/src/lib` (`text`, `versions`, `connections`, `catalog`, `cache`), which turn API responses into the
  reader's own types (`TextPassage`, `Segment`, `VersionMeta`, `RelatedLink`). Components never call the API client and never read
  a raw response. This is mostly true today (one client, `reader-next/src/lib/api/client.ts:29-32`; one normaliser,
  `reader-next/src/lib/text/model.ts:219`); keep it as a rule, so a change in the backend text model is absorbed by rewriting
  adapters, not screens. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792041146749969?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- A change of response shape bumps the cache buster (`reader-next/src/lib/cache/policies.ts:31`), so old disk entries are dropped
  rather than misread. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792041146749969?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- Connection data: counts kept long on disk, multi-MB link arrays not persisted; see [Connections](connections/architecture.md#target-architecture).
  — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322798155629?thread_ts=1792322132.117529&cid=C0C9EGTL468)

### Assessment: a new backend text model

Requested in [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792041146749969?thread_ts=1792041146.749969&cid=C0C9EGTL468), against Yishai Glasner's [Rethinking Sefaria's text data model](https://github.com/YishaiGlasner/textual-systems-notes/blob/main/papers/rethinking-sefarias-text-data-model.md). The paper separates work, structure (address space), location (*chunk*, with a
stable id), edition and string; stores ranges by their end chunks (*anchors*) instead of expanded segment lists; lets one work have
several complete structures; and keeps ref strings and today's APIs working for each work's default structure. Paths below are
under `reader-next/` on `reader-next`. This is an assessment, not a decision.

**Overall:** forward compatible. Because the paper keeps today's APIs for the default structure, the reader keeps working
unchanged if the backend moves. Using the new capabilities is adapter work in `src/lib`, except several structures per work,
which also reaches the planner, cache keys and the URL.

| Paper proposal | `reader-next` today | Fit |
|---|---|---|
| Ref strings stay for people and URLs; old titles keep resolving through aliases | The URL is the reader state, in sefaria.org's ref grammar (`docs/ARCHITECTURE.md:14-16`); an alias table maps any ref spelling to its canonical ref once (`src/lib/cache/ref-index.ts`) | Fits as is |
| Chunks: stable location ids, independent of addresses | A segment's identity is its ref string and address (`src/lib/text/model.ts:92-101`); texts are cached by section ref string (`src/lib/text/queries.ts:66`, `docs/ARCHITECTURE.md:74-77`) | Small change when the API exposes ids: an optional `id` on `Segment`, used for keys; refs stay for display and URLs |
| Several complete structures per work (Yerushalmi by halakha and by Vilna page; one Tosefta instead of two) | The planner resolves refs offline from one depth, address types and section names per book (`src/lib/text/plan.ts:17-25`, `src/lib/ref/address.ts`); alternate structures are only markers on segments (`src/lib/text/model.ts:78`) | Gap: a structure has to be added to book meta, the planner, cache keys and the URL. See Risks |
| Editions separate from text; an edition may segment differently (a string split by a page break) | A segment holds one primary and one translation string (`src/lib/text/model.ts:100-101`); a version is chosen per side as `languageFamilyName\|versionTitle` (`src/lib/text/queries.ts:24-27`, `src/lib/versions/preferences.ts:64`) | Fits while the API returns one string per segment and side; edition-specific segmentation needs segment content as a list of pieces (adapter and renderer) |
| Links between anchors (end chunks) instead of expanded segment lists; commentary as derived nodes | Link matching and counts read `anchorRefExpanded`, the field the paper drops (`src/lib/connections/links.ts:21`, `:45-47`, `:111`; `src/lib/connections/queries.ts:44`); `related.ts:49` already falls back to expanding `anchorRef` | Fits while the API sends it; otherwise range containment in `src/lib/connections` only (localised) |
| Version state computed from stored text | The reader only reads what the API reports (`available_versions`, `isPrimary`: `src/lib/text/model.ts:73`, `:215-216`) | Fits as is |

Risks and open questions:

- Several structures per work is the one direction that touches routing: how would a URL name the structure (a new parameter,
  or a title per structure as the "(Lieberman)" indexes do today), and must old URLs keep their meaning? See
  [URLs & routing](routing/architecture.md). Needs a decision before it is built.
- `RelatedLink` is close to the API's own link shape and is used directly by the sidebar
  (`src/features/reader/ConnectionsPane.tsx:4`). If links change shape, the adapter should map to a reader-owned link type first.
- Saved items, notes and history store ref strings, as the paper's sheets do; renamed titles depend on server-side aliases.

## Performance

- Focus point for the upcoming arc: SSR and loading time minimal; repaints monitored on load and on scroll and click; the
  legacy sefaria.org reader's repainting issue designed away from ("current architecture" means legacy: [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792052319198069?thread_ts=1792048275.276949&cid=C0C9EGTL468)). — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468)
- Legacy causes of slow load and repaints, checked against `reader-next`, with the gaps still open:
  [platform-seo architecture → Legacy load/repaint issues vs. new arc](platform-seo/architecture.md#legacy-loadrepaint-issues-vs-new-arc).
- Evidence: Hotjar shows many short mobile sessions ending before content loads; Google Search Console reports LCP above 4 s
  on 100% of pages. — [Slack](https://sefaria.slack.com/archives/C0B4Q00KNCA/p1791289154906489) · Hotjar [1](https://insights.hotjar.com/r?site=2695522&recording=112659731199) · [2](https://insights.hotjar.com/r?site=2695522&recording=112659747044) · [3](https://insights.hotjar.com/r?site=2695522&recording=112659758294) · [4](https://insights.hotjar.com/r?site=2695522&recording=112659767062) · forwarded in [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048275276949)
- Detail and open questions (RUM tool; LCP, INP and CLS targets): [platform-seo product](platform-seo/product.md),
  [platform-seo architecture](platform-seo/architecture.md), [text-display architecture](text-display/architecture.md).
- `/api/related` is the reader's heaviest call (Genesis 1: 12.3 MB, 504 when not cached). Ideas: stored per-segment counts,
  sheets as counts, leaner link rows, no connection requests with the sidebar closed and dots off; see
  [Public API](api-data/architecture.md) and [Connections](connections/architecture.md). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322132117529) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322798155629?thread_ts=1792322132.117529&cid=C0C9EGTL468)

## Accessibility and languages

_Not discussed yet. See also the `i18n-a11y` area._

## Rollout and coexistence with the legacy client

_Not discussed yet. Today: the new client answers page requests first and hands the rest to Django
(`reader-next/docs/DEPLOYMENT.md`)._

## Unplaced notes

_None yet: notes Claude could not place in an area wait here until someone places them._
