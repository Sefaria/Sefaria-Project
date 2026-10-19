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

_Not discussed yet._

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

## Rollout and coexistence with the legacy client

_Not discussed yet. Today: the new client answers page requests first and hands the rest to Django
(`reader-next/docs/DEPLOYMENT.md`)._

## Unplaced notes

_None yet: notes Claude could not place in an area wait here until someone places them._
