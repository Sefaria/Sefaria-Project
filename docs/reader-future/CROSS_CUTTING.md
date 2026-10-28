# Cross-cutting

What spans many product areas, and anything said in **#reader-future** that does not belong to one area. Claude Tag keeps this page
with the same rules as the area files (statuses idea · proposed · agreed · decided; every change cites its Slack message), and
links each item to the areas it touches.

## Design system and components

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

_Not discussed yet. Today: TanStack Query with IndexedDB persistence per query (`reader-next/src/lib/cache`)._

## Performance

_Not discussed yet._

## Accessibility and languages

_Not discussed yet. See also the `i18n-a11y` area._

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
