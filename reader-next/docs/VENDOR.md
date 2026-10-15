# Vendored code

## `vendor/sefaria-toolkit/` — arithmomaniac/sefaria-frontend-toolkit

- Source: https://github.com/arithmomaniac/sefaria-frontend-toolkit, commit in `vendor/sefaria-toolkit/UPSTREAM_COMMIT`.
- Licence: GPL-3.0 (`vendor/sefaria-toolkit/LICENSE`), same as Sefaria-Project.
- Taken: `packages/client/src` (typed, response-validated API client, 60 operations) and
  `packages/text-transform/src` (HTML sanitiser/normaliser, vocalization transforms).
- **Not taken:** the Lit web components. See `docs/ARCHITECTURE.md` and the decision record in the session notes:
  they target embedding, have no Talmud/aliyot/poetry/dictionary/alt-structure support, forbid a persistent cache
  by design, and don't server-render in React.
- The client's own response cache is switched off (`cache: false`); TanStack Query owns caching.

### Local modifications (search for `SEFARIA-READER EXTENSION`)

| File | Change | Why |
|---|---|---|
| `text-transform/normalize.ts` | Keep `span.poetry.indentAll` / `indentAllDouble` as `data-sefaria-poetry="indent|indent-double"`; keep `span.mediumGrey` as `data-sefaria-tone="muted"` | Upstream unwraps these spans, flattening every poetic line in Psalms, Isaiah, Song of Songs |

| `client/generated/zod.gen.ts` (`zWebPagesJson`) | `authors`, `articleSource`, `description` accept `null`; `authors` may be an array of strings; `articleSource` may be an object | The live `/api/related/<ref>/websites` sends `authors: null, articleSource: null`, which upstream's contract rejected, so every web-pages response failed validation |

Keep modifications small and marked so upstream fixes can still be merged.
