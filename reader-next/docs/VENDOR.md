# Vendored code

## `vendor/sefaria-toolkit/` — Sefaria/sefaria-frontend-toolkit

- Source: https://github.com/Sefaria/sefaria-frontend-toolkit (formerly `arithmomaniac/sefaria-frontend-toolkit`, which now
  redirects there), commit in `vendor/sefaria-toolkit/UPSTREAM_COMMIT` (`6d7f259`, 2026-10-02).
- Licence: **upstream is MIT** since its commit `0d11376` (2026-10-06, "migrate toolkit ownership and distribution to Sefaria",
  upstream PR #57; see also Sefaria-Project #3870). The snapshot vendored here predates that change, so its
  `vendor/sefaria-toolkit/LICENSE` is still the GPL-3.0 text it was taken under (checked 2026-11-10 with `gh api`). Re-vendoring
  from a commit at or after `0d11376` brings the MIT licence file with it; until then the GPL-3.0 file is the accurate one for
  this copy (GPL-3.0 is also Sefaria-Project's licence).
- Taken: `packages/client/src` (typed, response-validated API client, 60 operations) and
  `packages/text-transform/src` (HTML sanitiser/normaliser, vocalization transforms).
- **Not taken:** the Lit web components. See `docs/ARCHITECTURE.md` and the decision record in the session notes:
  they target embedding, have no Talmud/aliyot/poetry/dictionary/alt-structure support, forbid a persistent cache
  by design, and don't server-render in React.
- The client's own response cache is switched off (`cache: false`); TanStack Query owns caching.

### Local modifications (search for `SEFARIA-READER EXTENSION`)

| File                          | Change                                                                           | Why                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `text-transform/normalize.ts` | Keep `span.poetry.indentAll` / `indentAllDouble` as `data-sefaria-poetry="indent | indent-double"`; keep `span.mediumGrey`as`data-sefaria-tone="muted"` | Upstream unwraps these spans, flattening every poetic line in Psalms, Isaiah, Song of Songs |

| `client/generated/zod.gen.ts` (`zWebPagesJson`) | `authors`, `articleSource`, `description` accept `null`; `authors` may be an array of strings; `articleSource` may be an object | The live `/api/related/<ref>/websites` sends `authors: null, articleSource: null`, which upstream's contract rejected, so every web-pages response failed validation |
| `client/client.ts` (response interceptor) | The validator gets a `clone()` taken before the lazy `import("./validation.js")` yields | The lazy import (our extension) put an await between receiving the response and cloning it; an in-flight request at teardown failed with "Response.clone: Body has already been consumed" (`server-catalog.test.ts`, ~2 in 5 runs) |
| `text-transform/normalize.ts` (`classifyElement` img, `classifyAnchor`) | An `<img>` with an http(s) or base64 `data:image/` source becomes `<span data-sefaria-image data-sefaria-alt>` (other sources: the alt text, as upstream); `a.categoryLink[data-category-path]` becomes `<span data-sefaria-category>`; a plain `<a>` with an http(s) or site-relative (`/…`, not `//…`) href becomes `<span data-sefaria-href>` | Upstream drops images to their alt text and unwraps every other link; Sefaria texts carry full-segment images with captions, inline images, linker category mentions and translators' links (TXD-026, TXD-023, TXD-020). `src/lib/text/prepare.ts` turns the markers into `<img>` / `<a>` |
| `text-transform/html.ts` (`VOID_TAGS`) | `img` is void | So the reader's `<img>` serialises without a closing tag |
| `text-transform/html.ts` (`serializeOpenTag`) | Attribute values also escape `<` and `>` | Security (CODE_REVIEW R-02): a raw `>` from API text let search-term highlighting break out of an attribute (stored XSS). Worth upstreaming |

Keep modifications small and marked so upstream fixes can still be merged.
