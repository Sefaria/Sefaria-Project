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
