# Cross-cutting

What spans many product areas, and anything said in **#reader-future** that does not belong to one area. Claude Tag keeps this page
with the same rules as the area files (statuses idea · proposed · agreed · decided; every change cites its Slack message), and
links each item to the areas it touches.

## Design system and components

_Not discussed yet. Today: the new client's component library is React + Storybook (`reader-next/src/ui`), tokens in
`reader-next/src/ui/tokens`._

## Data layer and caching

_Not discussed yet in general. Today: TanStack Query with IndexedDB persistence per query (`reader-next/src/lib/cache`)._

- Connection data: counts kept long on disk, multi-MB link arrays not persisted; see [Connections](connections/architecture.md#target-architecture).
  — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322798155629?thread_ts=1792322132.117529&cid=C0C9EGTL468)

## Performance

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
