# Semantic search: first-phase cutover

This change switches the default to `new` (chunk_metadata + vectors), keeps all legacy
code and data, and adds `X-Sefaria-Semantic-Backend` to successful authenticated KNN responses.
The header uses the same validated backend-selection helper as the search implementation.
It identifies the backend selected by the responding worker, including when no results exist.
It is not a SQL trace, a database identity, or proof that every worker in the deployment updated.
Successful responses use `Cache-Control: no-store`.

## Run from your laptop

Python 3.10+ is sufficient; no pip install, Django, database credentials, or port forwarding.
The checker looks for a token in this order: `SEFARIA_KNN_AUTH_TOKEN`,
`SEMANTIC_SEARCH_API_TOKEN`, then a simple token assignment in this checkout's
`sefaria/local_settings.py`. The file is parsed as data, never imported or executed.
A literal string or an `os.environ.get`/`os.getenv` expression with a literal fallback
is supported; more complex settings require an exported token. The token is never printed.
Ensure the chosen token belongs to the endpoint you target.

If your local settings already contain the correct token, run the checker directly.
Otherwise, from the Sefaria-Project repository root, supply it with a hidden zsh prompt:

```zsh
read -rs 'SEFARIA_KNN_AUTH_TOKEN?Semantic search API token: '
export SEFARIA_KNN_AUTH_TOKEN
```

Capture a baseline **before deployment** (the old server has no backend header):

```bash
python3 scripts/check_semantic_search.py --expect-backend any \
  --label before --output /tmp/semantic-before.json
```

Deploy this change, wait for rollout completion, then run:

```bash
python3 scripts/check_semantic_search.py \
  --label after-switch --baseline /tmp/semantic-before.json \
  --output /tmp/semantic-after.json
```

The default endpoint is `https://www.sefaria.org/api/knn-search`; the default expected backend
is **new**. A successful search with a missing header or `legacy` is a **failure**, not a pass.
The header is checked on each of the eight successful-search cases. `--expect-backend any`
relaxes that requirement only for an old baseline. HTTP errors are still failures unless
explicitly expected by the two negative cases. A previous version of this checker used a
different report format; capture a fresh baseline with this version.

Use `--api-url http://127.0.0.1:8000/api/knn-search` to check a local server with its token.
Remote URLs require HTTPS; redirects are rejected so a wrong endpoint cannot silently pass.

## Test logic and duration

Ten sequential requests, no retries or load testing:

| Case | Assertions |
|---|---|
| English and Hebrew conceptual queries | HTTP 200, nonempty results, expected metadata and text |
| Linked-ref search | Results plus correctly shaped linked refs; validate expanded chunk numbering and parent limit |
| English-language and Hebrew-language filters | Every semantic result has the requested language |
| Genesis filter | Every semantic result belongs to Genesis |
| Metadata-only response | Required metadata present, text omitted |
| Limit of one | Exactly one semantic result |
| Empty query, valid auth | HTTP 400 and JSON error |
| No authentication | HTTP 401 and JSON error |

Every successful-search case requires the selected backend header. Results must respect the
requested limit. Empty linked refs are legal and produce a coverage warning; omitted linked
text is also flagged. The chosen query cannot guarantee that oversized linked-ref chunk
replacement runs on every corpus snapshot.

There are eight embedding/search operations; these incur ordinary query embedding charges.
Healthy runs should be short, but duration depends on production latency. Defaults are a
30-second socket timeout per request and a 180-second run budget. The script stops starting
requests when the budget expires and fails unexecuted cases. This is not a strict wall-clock
kill: an in-flight response can extend the run (the timeout applies to socket operations).
Adjust with `--timeout` and `--budget` if needed.

JSON reports save refs, versions, languages, text hashes, backend headers and elapsed times.
They exclude tokens, full text and embeddings; output files are never overwritten. Keep them
outside Git. Console output shows pass/fail and comparisons; inspect `warnings` and `error`
fields in the JSON for details.

With `--baseline`, the checker compares identical cases for ref overlap, ordered result/text
fingerprints, linked refs and latency. Differences are **review information**, not automatic
failures: corpus updates and approximate search can change ranking. Investigate missing
results, unexpectedly low overlap, lost linked refs or slower responses. This is a smoke and
contract check, not a relevance benchmark or proof of corpus parity.

Exit codes: 0 = all checks pass; 1 = one or more checks fail; 2 = invalid arguments/setup.
An API failure is reported and the remaining cases continue within the budget.

## Deployment and rollback

Tracked defaults in `sefaria/settings.py`, `sefaria/local_settings_example.py`, and the Helm
`local-settings-file` ConfigMap now select `new`. The search helper also defaults to `new`
when the setting is absent. An explicit environment/configuration override can still select
`legacy`. A custom local_settings.py can override the shared default; check the response
header rather than assuming a code deployment changed the effective setting.

For rollback, set `SEMANTIC_SEARCH_TABLE_VERSION=legacy` in the deployment's effective
configuration and restart/roll out the web workers. All legacy code and tables remain.
Verify with `--expect-backend legacy`. This script never deploys, changes settings or drops data.

## Test the checker itself

```bash
python3 -m unittest discover -s scripts/tests -p 'test_check_semantic_search.py' -v
```

Application routing/header regression tests are in
`semantic_search/tests/semantic_search_test.py` and `reader/tests/test_knn_backend_header.py`, and run in the normal configured Sefaria
Python environment. The checker tests use mocked transport and require no services.
