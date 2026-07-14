# Community Book Upload — Correctness, Moderation, and Test Coverage

Date: 2026-07-14
Branch: `feature/sc-44454/community-book-upload-voices`
Base commit: `07cd356f0`

## Problem

Manually exercising the upload flow on a live dev environment produced a book that
uploaded successfully (HTTP 201) and was then permanently unreadable — every view
returned HTTP 500 with `IndexError: list index out of range` in `Ref.normal()`.

Investigation showed this was not an isolated bug. The feature's tests have never
executed:

- `sefaria/pytest.ini` collects `*_test.py`; the parser test file is named
  `test_community_book_parser.py`, so it is never collected. It is red on the
  branch and nobody knew.
- `e2e-tests/tests/` is a dead `testDir`. `playwright test --list` discovers 1404
  tests and zero from `community-books.spec.ts`.
- `community-books.spec.ts` imports `getFixturePath` from `../utils`, which does
  not exist there. The spec cannot compile.

A bug shipping alongside a unit test that asserts the bug's own output is the
signature of a loop that was never closed.

## Guiding principle

Every parser defect is one defect wearing different hats: **the parser treats
"I collected content that does not fit the declared depth" as success.** Content
is either placed, or it raises a `ParseError` the user can act on. It is never
dropped silently.

## Findings

### Rendering

`build_jagged_array` emits a 3-level array (chapter -> section -> paragraph list)
under a schema declaring `depth: 2`, so `Ref.normal()` indexes
`addressTypes[len(sections)-1]` out of range. Every depth-2 book 500s on read.

The depth-1 branch joins with `'\n'`, which is also wrong. Segment text is
rendered via `dangerouslySetInnerHTML` (`static/js/ContentText.jsx:93-99`,
`static/js/TextRange.jsx:639-647`) with no `white-space: pre`, so a raw newline
collapses to a single space. Depth-1 books already render as one run-on blob.

Corpus survey (local Mongo, 1,194,528 English segments):

| separator | segments | with 2+ occurrences |
|---|---|---|
| `<br>` | 78,849 (6.60%) | 35,619 (2.98%) |
| `\n` | 18,027 (1.51%) | 5,049 mid-string (0.42%) |
| `<p>` | 0 | 0 |

`br` is in `ALLOWED_TAGS_IN_ABSTRACT_TEXT_RECORD` (`sefaria/constants/model.py:1`);
`p` is not, and `sanitize_text` runs `bleach.clean` without `strip=True`
(`sefaria/model/text.py:1195-1200`), so `<p>` is escaped into literal visible tag
text. This is why `<p>` has zero corpus hits.

**Decision: join with `<br>` in both branches.**

### Parser silent content loss

| Input | Current behavior | Decision |
|---|---|---|
| Body text before the first `## ` chapter | dropped | `ParseError` |
| Body text between `## ` and its first `### ` (depth-2) | dropped (`_make_chapter` ignores its `paragraphs` arg) | `ParseError` |
| `### ` sections present but depth-1 declared | dropped | `ParseError` |
| Orphan `### ` before any `## ` | **misfiled into the following chapter** | `ParseError` |

Erroring is chosen over auto-placement because author intent cannot be inferred,
and a wrong guess produces corruption that looks correct — a worse outcome than a
fixable error message.

### Parser heading detection

`_detect_heading_level` uses `style_name.startswith("heading 2")`, so a custom
Word style named `"Heading 20"` turns a body paragraph into a chapter title
(reproduced). The `## `/`### ` markdown fallback also fires on `Normal`-styled
paragraphs, so a body line beginning `## ` silently becomes a chapter.

**Decision:** exact style match, and apply the markdown fallback **only when the
document contains no real heading styles at all**. A document is either
style-structured or markdown-structured, never both.

### Parser validation gaps

- Section titles are never checked for uniqueness (chapter titles are).
- `build_schema` passes `title_en` straight into the index `key` with no
  validation. `/`, `.`, `:`, `,`, empty, and whitespace-only all pass through,
  into a value used in URL paths and Ref parsing.

### API and moderation

Confirmed safe, no change needed: the signed upload token carries the parse inputs,
`confirm()` reads only `upload_token` from the client, re-fetches the file from GCS
by server-known path, and re-parses server-side. A client cannot tamper with title,
depth, or content. `_check_title_uniqueness()` blocks exact-title collisions with a
409, so a community upload cannot shadow a canonical text.

Confirmed defects:

1. **Unreviewed and rejected books are publicly readable.** The only gate is
   `idx.hidden = True`, which per `sefaria/model/text.py:224` removes a book from
   the main TOC but deliberately **keeps it in the search index**. No read path
   checks `communityBook.status`. Content that has never been moderated — or was
   explicitly rejected — is readable by search or direct URL.
2. **The rollback is dead code.** `is_resubmission` is computed *after*
   `_create_or_update_index` has already saved the Index
   (`api/community_books.py:390`), so the query always finds it and
   `if not is_resubmission: idx.delete()` never fires. Any `Version.save()` failure
   leaves a permanent contentless Index.
3. **Rate limits are bypassable.** `_check_rate_limits()` is called only in
   `upload()`, and counts confirmed Indexes, which do not exist yet at upload time.
   N uploads yield N valid tokens; `confirm()` never re-checks.
4. **Malformed archives 500.** `DOCX_MAGIC` only proves "is a zip". `.xlsx`,
   `.docm`, or a renamed `.zip` pass, then `DocxDocument()` raises
   `PackageNotFoundError`/`BadZipFile`, which are not `ParseError` and are caught
   nowhere.
5. **Admin scope.** approve/reject use generic `is_staff` rather than
   `COMMUNITY_BOOK_ADMIN_IDS`, and neither forbids approving one's own submission.
6. **`license` and `topics` are silently discarded** — the frontend sends them, the
   backend never reads them.

Item 1 is the most invasive change; it alters moderation semantics the PR author
designed, and is flagged for their review.

### Deploy prerequisite

On a fresh database, `confirm()` fails with "You must create category Community
before adding texts to it" until `manage.py create_community_category` runs. This
is a deploy step, not a code bug, and is currently undocumented.

## Test plan

- Rename `test_community_book_parser.py` -> `community_book_parser_test.py` so the
  suite actually collects it. This is the root cause of the undetected red suite.
- Correct the two assertions that encode the bugs; add a depth-invariant regression
  test (output nesting depth must equal declared depth); add a case per new
  `ParseError`.
- Add API-level tests (Django test client) covering auth, the rate-limit bypass,
  the orphan-Index path, and malformed archives.
- Add `getFixturePath` to `e2e-tests/utils.ts`; add a depth-2 fixture
  (`sample-book.docx` has no `### ` sections and cannot exercise depth-2);
  **register the spec with a live Playwright project** so it is discovered at all.
- The e2e test asserts what the old mocked test never did: open the created book
  and assert it renders 200, and that `/api/texts/<title>.1` returns a flat array
  of section strings.

## Verification

- pytest locally against `./venv` (Python 3.12.8, Django 6.0.4). Parser tests need
  no database.
- Playwright against the cauldron at
  `https://voices.community-book-upload.cauldron.sefaria.org/` after the fix
  deploys.
- Manual re-upload to confirm the book renders.

## Out of scope

Suspected but unverified, left as follow-ups: decompression-bomb DoS (only the
compressed size is bounded), GCS bucket public-read ACL, and a TOCTOU race between
the uniqueness check and the write.
