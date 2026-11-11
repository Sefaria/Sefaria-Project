# Local patches to the vendored sefaria-toolkit

`UPSTREAM_COMMIT` names the toolkit commit this copy was taken from. The files here are **not** that commit byte for byte: the
changes below were made in this repository since. Every one is marked in the code with a `SEFARIA-READER EXTENSION` comment
(`grep -rn "SEFARIA-READER EXTENSION" reader-next/vendor/sefaria-toolkit`). A re-vendor must carry each one over, or replace it with
an upstream equivalent, and keep the tests named below green. Several are security-relevant (the sanitiser's URL rules): dropping
them silently would either break text display or, worse, loosen what the sanitiser lets through.

Recorded 2026-11-10. Update this list in the same commit as any change under this folder.

## text-transform (the sanitiser and the HTML writer)

| File | Change | Why | Commits |
|---|---|---|---|
| `normalize.ts` (`classifyAnchor`, the end) | Keeps a plain link whose `href` is `http(s)://…` or a site path as a `data-sefaria-href` marker span (upstream unwraps every link). **Security:** a site path is `/` not followed by `/` or a backslash; no backslash or `%5C` anywhere (browsers read `/\evil.org` as `//evil.org`). Anything else (`javascript:`, `data:`, `//host`, relative) is unwrapped as upstream does | TXD-020 plain links in the text | `52992ec5b5`, `b97a49b38f` |
| `normalize.ts` (`classifyAnchor`) | Keeps a linker category mention (`a.categoryLink[data-category-path]`) as a `data-sefaria-category` marker span | TXD-023 | `52992ec5b5` |
| `normalize.ts` (`img`) | Keeps an image whose `src` is `http(s)://…` or a base64 `data:image/(png|jpeg|gif|webp|svg+xml)` URI as a `data-sefaria-image` marker (with alt, and a numeric width/height of at most 5 digits); any other source becomes the alt text as upstream. **Security:** the marker's value is only ever used as an `<img src>` | TXD-026 images in the text | `52992ec5b5`, `b97a49b38f` |
| `normalize.ts` (module doc comment) | States that this copy emits vetted image and link addresses (upstream: "emits no URLs") | keeps the contract honest | `52992ec5b5` |
| `normalize.ts` (`classifySpan`) | Keeps the poetry indentation classes (`indentAll`, `indentAllDouble`) and muted emphasis instead of unwrapping them | Psalms and Isaiah lose their line indents otherwise | inherited (sefaria-reader history) |
| `html.ts` | `img` is a void element | the reader turns image markers into `<img>` (TXD-026) | `52992ec5b5` |
| `html.ts` (attribute escaping) | `<` and `>` escaped in attribute values as well as `&` and `"` | A raw `>` in a value misleads anything that scans the output for tags | inherited (sefaria-reader history) |

Tests that pin these: `src/lib/text/normalize-extensions.test.ts` (links, backslash addresses, images, categories) and the
SegmentText stories.

## client (the API client and its generated contracts)

| File | Change | Why | Commits |
|---|---|---|---|
| `client/client.ts` | `validate` option (default true): responses checked against the generated zod contracts; `isValidating()` | contract checks can be switched off | inherited (sefaria-reader history) |
| `client/client.ts` | The validator reads `response.clone()` taken before the lazy import yields | "Body has already been consumed" at a test server's teardown | `0709b367e9` |
| `client/runtime.ts` | A runtime entry without the zod contracts | keeps zod out of bundles that never validate | inherited (sefaria-reader history) |
| `client/response-cache.ts` | The contracts are imported lazily | same | inherited (sefaria-reader history) |
| `client/generated/sdk.gen.ts` | Validators loaded lazily, only when the client validates | same; regenerate with this change re-applied | inherited (sefaria-reader history) |
| `client/generated/zod.gen.ts` | `authors`, `articleSource`, `description` accept `null` | the live API sends null there | inherited (sefaria-reader history) |

"Inherited" changes were made in the retired sefaria-reader repository; this repository's history (`eb21ba1b18`, `74aa87c8d3`) does
not show where each began. The `SEFARIA-READER EXTENSION` markers are the complete list; diff against `UPSTREAM_COMMIT` in the toolkit
repository before re-vendoring.
