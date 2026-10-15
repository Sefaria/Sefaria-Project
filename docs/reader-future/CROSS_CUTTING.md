# Cross-cutting

What spans many product areas, and anything said in **#reader-future** that does not belong to one area. Claude Tag keeps this page
with the same rules as the area files (statuses idea · proposed · agreed · decided; every change cites its Slack message), and
links each item to the areas it touches.

## Design system and components

_Not discussed yet. Today: the new client's component library is React + Storybook (`reader-next/src/ui`), tokens in
`reader-next/src/ui/tokens`._

## Data layer and caching

_Not discussed yet. Today: TanStack Query with IndexedDB persistence per query (`reader-next/src/lib/cache`)._

## Performance

- Focus point for the upcoming arc: SSR and loading time minimal; repaints monitored on load and on scroll and click; the
  legacy sefaria.org reader's repainting issue designed away from ("current architecture" means legacy: [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792052319198069?thread_ts=1792048275.276949&cid=C0C9EGTL468)). — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468)
- Legacy causes of slow load and repaints, checked against `reader-next`, with the gaps still open:
  [platform-seo architecture → Legacy load/repaint issues vs. new arc](platform-seo/architecture.md#legacy-loadrepaint-issues-vs-new-arc).
- Evidence: Hotjar shows many short mobile sessions ending before content loads; Google Search Console reports LCP above 4 s
  on 100% of pages. — [Slack](https://sefaria.slack.com/archives/C0B4Q00KNCA/p1791289154906489) · Hotjar [1](https://insights.hotjar.com/r?site=2695522&recording=112659731199) · [2](https://insights.hotjar.com/r?site=2695522&recording=112659747044) · [3](https://insights.hotjar.com/r?site=2695522&recording=112659758294) · [4](https://insights.hotjar.com/r?site=2695522&recording=112659767062) · forwarded in [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048275276949)
- Detail and open questions (RUM tool; LCP, INP and CLS targets): [platform-seo product](platform-seo/product.md),
  [platform-seo architecture](platform-seo/architecture.md), [text-display architecture](text-display/architecture.md).

## Accessibility and languages

_Not discussed yet. See also the `i18n-a11y` area._

## Rollout and coexistence with the legacy client

_Not discussed yet. Today: the new client answers page requests first and hands the rest to Django
(`reader-next/docs/DEPLOYMENT.md`)._

## Unplaced notes

_None yet: notes Claude could not place in an area wait here until someone places them._
