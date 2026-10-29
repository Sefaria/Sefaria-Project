# Cross-cutting

What spans many product areas, and anything said in **#reader-future** that does not belong to one area. Claude Tag keeps this page
with the same rules as the area files (statuses idea · proposed · agreed · decided; every change cites its Slack message), and
links each item to the areas it touches.

## Design system and components

Today: the new client's component library is React + Storybook (`reader-next/src/ui`), tokens in `reader-next/src/ui/tokens`.

**The Sefaria frontend toolkit and the reader.** The channel asked what the reader's components should learn from the
[Sefaria frontend toolkit](https://sefaria.github.io/sefaria-frontend-toolkit/) and whether its components fit the reader
· [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792570626028769). Checked against the toolkit at
[`03443b7`](https://github.com/Sefaria/sefaria-frontend-toolkit/tree/03443b78014f9cda9a2fead89c624d0118496535) (2026-10-20) and
`reader-next` at `837d585`. Everything here is *idea*.

- What the toolkit is: three packages, an API client, a text sanitiser (`text-transform`) and five Lit custom elements in
  shadow DOM (text segment, bilingual segment, source card, connections panel, reader), built for embedding Sefaria texts in
  other sites. Sefaria-owned and MIT since 2026-10-06, on npm as `0.1.0-alpha.0` since 2026-10-08; one maintainer; "experimental;
  names and APIs may change" ([`README.md:9`](https://github.com/Sefaria/sefaria-frontend-toolkit/blob/03443b78014f9cda9a2fead89c624d0118496535/README.md#L9),
  [`packages/web-components/README.md:9-21`](https://github.com/Sefaria/sefaria-frontend-toolkit/blob/03443b78014f9cda9a2fead89c624d0118496535/packages/web-components/README.md#L9-L21)).
- Do not use the toolkit's elements inside the reader; keep taking only its client and `text-transform`, as `reader-next`
  does today ([`docs/VENDOR.md:7-11`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/docs/VENDOR.md#L7-L11)).
  The toolkit rules out HTML server rendering, hydration and cache persistence by design
  ([`docs/design.md:15`](https://github.com/Sefaria/sefaria-frontend-toolkit/blob/03443b78014f9cda9a2fead89c624d0118496535/docs/design.md#L15),
  [`AGENTS.md:120`](https://github.com/Sefaria/sefaria-frontend-toolkit/blob/03443b78014f9cda9a2fead89c624d0118496535/AGENTS.md#L120)),
  which are two of the reader's tenets ([`docs/ARCHITECTURE.md:9, 27`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/docs/ARCHITECTURE.md#L9-L30)).
  Its elements also lack Hebrew interface text, Talmud addressing and continuous layout
  ([`docs/COMPONENT_AUDIT.md:606-612`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/docs/COMPONENT_AUDIT.md#L606-L612)).
  Their natural home is embeds on other sites; see [Linker & embeds](linker-embeds/architecture.md). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792570626028769)
- Update the vendored code's provenance. `reader-next` still names `arithmomaniac/sefaria-frontend-toolkit` under GPL-3.0
  ([`docs/VENDOR.md:3-6`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/docs/VENDOR.md#L3-L6),
  [`docs/ARCHITECTURE.md:44`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/docs/ARCHITECTURE.md#L44)).
  That was true of the snapshot it took (upstream `6d7f259`, 2026-10-02), but the project is now `Sefaria/sefaria-frontend-toolkit`
  under MIT, and `@sefaria/api-client` and `@sefaria/text-transform` are on npm. Apart from the two marked local changes, the
  vendored files are identical to upstream today. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792570626028769)
- Send the two local fixes upstream so the reader and embeds render the same text: keeping poetry indentation and muted spans
  (Psalms, Isaiah), and accepting `null` fields in web-pages responses
  ([`docs/VENDOR.md:14-20`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/docs/VENDOR.md#L14-L20)).
  Neither is in the toolkit's `main` yet. Then decide whether to keep vendoring or depend on the npm packages. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792570626028769)
- Keep the toolkit's token contract: public `--sefaria-*` names, private `--_sefaria-*` copies with defaults, and `light-dark()`
  colours ([`tokens.ts:4-53`](https://github.com/Sefaria/sefaria-frontend-toolkit/blob/03443b78014f9cda9a2fead89c624d0118496535/packages/web-components/src/tokens.ts#L4-L53)).
  `reader-next` already uses the names and, unlike the toolkit, sets `color-scheme`
  ([`src/ui/tokens/tokens.css:10`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/ui/tokens/tokens.css#L10)).
  The reader defines over 100 tokens and the toolkit 18, under different names for the same thing (`--sefaria-fg` against
  `--sefaria-color-text`). If embeds should match the site, the reader's tokens could also set the toolkit's 18. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792570626028769)
- Borrow the toolkit's testing habits for the reader's components. It asserts exact request counts, for example ten children
  from one parent request make zero child requests
  ([`docs/specs/components.md:107-113`](https://github.com/Sefaria/sefaria-frontend-toolkit/blob/03443b78014f9cda9a2fead89c624d0118496535/docs/specs/components.md#L107-L113)).
  Tests keep code examples in the docs identical to tested files
  ([`packages/web-components/README.md:33`](https://github.com/Sefaria/sefaria-frontend-toolkit/blob/03443b78014f9cda9a2fead89c624d0118496535/packages/web-components/README.md#L33)).
  The reader already fails Storybook stories on accessibility errors
  ([`.storybook/preview.tsx:33`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/.storybook/preview.tsx#L33)). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792570626028769)
- Watch for API drift. The toolkit checks Sefaria's OpenAPI document for changes every day
  ([`.github/workflows/openapi-drift.yml:3-5`](https://github.com/Sefaria/sefaria-frontend-toolkit/blob/03443b78014f9cda9a2fead89c624d0118496535/.github/workflows/openapi-drift.yml#L3-L5)).
  The reader's vendored generated contracts have no such check, and a stale contract has already rejected every web-pages
  response ([`docs/VENDOR.md:20`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/docs/VENDOR.md#L20)). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792570626028769)
- The component audit already records which toolkit ideas the reader ports: translation selection, status values with
  `role=status`/`role=alert`, cancelable events as controlled props, the bilingual grid that keeps the source first in the DOM,
  focus on navigation, and Hebrew numerals
  ([`docs/COMPONENT_AUDIT.md:589-604`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/docs/COMPONENT_AUDIT.md#L589-L604)).
  Its toolkit line numbers are from an older snapshot and have since moved.

Open questions:

- Is the toolkit Sefaria's embed product, the base for the next linker, or a separate community project, and who owns it?
- Should the reader and the toolkit share one token set and one text pipeline, so a passage looks the same on sefaria.org and
  in an embed?
- **Dark mode is supported**, on desktop and mobile, and is a high user priority. — *decided* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793181488777949) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793181661157789?thread_ts=1793181488.777949&cid=C0C9EGTL468) · areas: [text-display](text-display/product.md), [i18n-a11y](i18n-a11y/product.md), [platform-seo](platform-seo/product.md), [sheets-view](sheets-view/product.md), [linker-embeds](linker-embeds/product.md)
  - Every colour comes from a token with a light and a dark value; no hard-coded colours in components. — *decided* · same source
  - Mobile web (the responsive reader) is in scope. The native apps should use the same theme tokens so the themes match. — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793181661157789?thread_ts=1793181488.777949&cid=C0C9EGTL468)

_Today: the new client's component library is React + Storybook (`reader-next/src/ui`), tokens in
`reader-next/src/ui/tokens`._

## Integrations: other applications driving the reader

- **TanStack Router is the reader's state layer; other applications must be able to update reader state easily; every integration
  event sefaria.org's reader handles keeps its effect (parity).** — *decided* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193924097339) · areas: [routing](routing/architecture.md),
  [ai](ai/architecture.md), [reader-shell](reader-shell/architecture.md), [sheets-editor](sheets-editor/architecture.md),
  [accounts](accounts/architecture.md), [linker-embeds](linker-embeds/architecture.md)
  - Today's events: `sefaria:bootstrap-url` (the assistant opens a ref or page), `sefaria:settings-updated` (account settings), the
    `refresh-editor` BroadcastChannel (add to sheet). None is handled by the new client yet. Inventory: `routing/architecture.md`.
  - Shape: a typed command layer over `router.navigate`, a legacy-event adapter, a state-changed event from
    `router.subscribe("onResolved")`; optional window global and `postMessage`. — *proposed* (Claude Tag draft) · `routing/architecture.md`

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

Interface language, content language and version stickiness are mapped, as *ideas*, in
[Language & accessibility](i18n-a11y/architecture.md) and [Versions & translations](versions/architecture.md) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792386183143639).
See also the `i18n-a11y` area.

**Atlas marks the code does not fully back** (found while mapping; the atlas files are not changed here):

- RTE-028 *done*: no matching, redirect or removal of unmatched version parameters; title-only values are dropped
  ([`src/lib/reader/url-state.ts:51-54`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/url-state.ts#L51-L54)).
- RTE-034 *done*: cookie and redirect only; no profile save or domain switch, and Django's handler is bypassed
  ([`src/server/pass-through.ts:17-23`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/server/pass-through.ts#L17-L23)).
- SHL-007 *done*: the content default is always bilingual, not Hebrew for a Hebrew interface ([`src/lib/reader/settings.ts:61-65`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/settings.ts#L61-L65)).
- VER-014 *done*: an unknown explicit translation does not fall back to the default, and `vhe`-only URLs lose the preference
  ([`src/features/reader/TextPanel.tsx:84`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L84)).
- VER-012: the note "Corpus preference cookie (VER-002) not yet ported" is stale; the cookie is written
  ([`src/features/reader/TextPanel.tsx:413-420`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L413-L420)).
- SHL-014: done in the code and `FEATURES.md`, but missing from `rebuild-status.json` and "not started" in the
  [reader-shell](reader-shell/architecture.md) baseline.
- **Preferences and defaults in one object.** Every default behind interface language, content language, translation language,
  version choice, calendars and display settings is resolved by one pure function into a `ReaderPreferences` object. Each field
  carries its value and where it came from, for the reader and for a settings page that gives readers more control. Storage stays
  as today: profile fields when signed in, the existing cookies otherwise. — *proposed* (Claude Tag draft) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793194426019629) ·
  areas: [i18n-a11y](i18n-a11y/architecture.md) (inventory, object, gaps), [versions](versions/architecture.md),
  [text-display](text-display/architecture.md), [accounts](accounts/architecture.md), [calendars](calendars/architecture.md)

See also the `i18n-a11y` area.

## Analytics parity

- **Every current analytics event and dimension is kept and captured the same way, with the same vanilla JS data tag.** — *decided* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193685517999) · areas: [analytics](analytics/architecture.md), [reader-shell](reader-shell/architecture.md), [text-display](text-display/architecture.md), [connections](connections/architecture.md), [versions](versions/architecture.md), [search](search/architecture.md), [accounts](accounts/architecture.md), [promotions](promotions/architecture.md)
  - The new client loads the same tags as `templates/base.html` (GTM, GA4 `config`, `analyticsEventTracker.js`, Simple Analytics, Sentry, VWO, Hotjar, Unbounce), emits the same `data-anl-*` attributes on equivalent elements, fires every current event with the same names and parameters, and sends page views on client-side navigation as sefaria.org does. — *decided* · same source
  - "The same way" under server rendering: the `data-anl-*` attributes are in the server-rendered HTML; the data tag listens before hydration, as `base.html` attaches it before the bundle; hydration and head re-renders send no second page view. — *proposed* · same source
  - Parity is a launch requirement: checked against the inventory in [analytics/architecture.md](analytics/architecture.md#event-inventory) before the new client serves a page type in place of sefaria.org. — *proposed* · same source

_Today: reader-next has one analytics module (`reader-next/src/lib/analytics/`) with a TypeScript port of the data tag; 33 of the 59
rows in the event inventory are done; the rest are missing, partial or wait for features not built yet. GTM/GA4 configuration is not in
the repository._

## Rollout and coexistence with the legacy client

_Not discussed yet. Today: the new client answers page requests first and hands the rest to Django
(`reader-next/docs/DEPLOYMENT.md`)._

## Unplaced notes

_None yet: notes Claude could not place in an area wait here until someone places them._
