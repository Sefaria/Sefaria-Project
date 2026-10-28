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

## Data layer and caching

_Not discussed yet. Today: TanStack Query with IndexedDB persistence per query (`reader-next/src/lib/cache`)._

## Performance

_Not discussed yet._

## Accessibility and languages

_Not discussed yet. See also the `i18n-a11y` area._

## Rollout and coexistence with the legacy client

_Not discussed yet. Today: the new client answers page requests first and hands the rest to Django
(`reader-next/docs/DEPLOYMENT.md`)._

## Unplaced notes

_None yet: notes Claude could not place in an area wait here until someone places them._
