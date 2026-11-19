# fixtures

Recorded answers from the Sefaria API that unit tests and stories run against, offline.

- `api/` holds the API answers. `test/msw/fixtures.ts` serves them to unit tests (by URL through `api/requests.json`,
  search posts through `api/search-requests.json`, or by path with `readFixture`); stories import them directly.
- `varnish/related-client-urls.json` pins the `/api/related` URLs the client requests (checked by
  `src/lib/connections/related.test.ts` and by Django's `reader/tests/related_api_test.py`).

Only the files listed in `scripts/fixtures/keep.txt` are kept: the ones a unit test, story or script reads. `api/manifest.json`
still describes the whole recording, including entries whose files are not kept.

## Personal data

The repository is public, so no fixture may hold personal data about Sefaria users. `scripts/fixtures/scrub.mjs` replaces it with
placeholders and minifies every file. Sheet owners and other users become `Sheet Author 12` (profile `/profile/sheet-author-12`,
user id `12`, no picture), a sheet's own title, summary, attribution and topic tags become neutral values, web page authors become
`Web Author 3`, and email addresses become `user7@example.com` (Sefaria's service addresses are kept). Library texts, version credits,
topics and other public catalogue data stay as recorded. The numbering is deterministic and shared across files, so a person keeps the
same number everywhere, and running the scrub twice changes nothing.

## Re-recording

```sh
node scripts/record-fixtures.mjs            # or record-search-fixtures.mjs; writes the full set
node scripts/fixtures/scrub.mjs --prune     # keep only keep.txt's files, scrub and minify them
node scripts/fixtures/scrub.mjs --check     # exit 1 if anything is unscrubbed, unminified or looks personal
```

A new test or story that reads a fixture not yet kept: add its path to `scripts/fixtures/keep.txt`, then run the two commands above.

The full recording (every book type, `links.json`, `related.json`, name completions) is not kept here. To work with it, record it
locally with the commands above but without `--prune`; scrub it before sharing it anywhere. The e2e suite does not use this folder: it
replays its own cassette, which `scripts/cassette/bundle.mjs` fetches from a release asset pinned by `e2e/cassette.lock`.
