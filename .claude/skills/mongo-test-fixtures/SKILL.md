---
name: mongo-test-fixtures
description: |
  Rules for the recorded Mongo test fixtures under sefaria/tests/fixtures/mongo/. Use when editing sefaria/model/**, any *_test.py, sefaria/tests/fixtures/**, a Mongo query, filter or projection, a model's required_attrs/optional_attrs/attr_schemas, or when CI fails with "FIXTURE DRIFT", check_fixtures.py findings, the schema-digest test, "mongomock ignores hint", or the fixtures git-diff step. Tells you which command re-records the fixtures.
---

# Mongo test fixtures

## Markers
- `needs_mongo`: runs on mongomock seeded from a recorded fixture.
- `needs_corpus`: full library on a real Mongo restored from the public dump (corpus CI job).
- `needs_linker`: linker job.
- `deep`, `failing`: as in `pytest.ini`.
- Unmarked tests run in the no-Mongo job on mongomock seeded with `_base.json` only.

## Fixtures
`sefaria/tests/fixtures/mongo/` holds `_base.json`, one overlay per `needs_mongo` test, `_manifest.json` (sha256 per fixture plus the dump source stamp, written by the exporter) and `_shapes.json` (per-test query shapes plus model schema digests, written by running the `needs_mongo` tests with `SEFARIA_FIXTURE_SHAPES=write`). Never hand-edit any of them. Cap: 20 MiB total, 17 MiB base; `check_fixtures.py` reports usage and warns at 95 %.

## Re-record when you
- change a Mongo query, filter or projection;
- change a model's `required_attrs`, `optional_attrs` or `attr_schemas`;
- add, rename, re-parametrize or delete a `needs_mongo` test.

```
python scripts/pytest_minimal_dataset/rerecord_fixtures.py [--only <nodeid>] [--mongo-port 27018] [--restore auto|never|force] [--output-dir DIR] [--prune]
```
It needs docker: it restores the public dump on a loopback Mongo, records, exports, rewrites `_shapes.json` and verifies. Commit the diff under `sefaria/tests/fixtures/mongo/`.

## Failure text to command
| Failure text | Meaning | Command |
|---|---|---|
| `check_fixtures.py`: missing / orphan (with rename hint) / collision / hand-edited sha / manifest / shapes / size | fixture set out of sync with the collected `needs_mongo` tests; each finding ends with a `Fix:` line | follow the `Fix:` line; usually `python scripts/pytest_minimal_dataset/rerecord_fixtures.py [--only <nodeid>] [--prune]` |
| missing `_manifest.json` | manifest absent | `python scripts/pytest_minimal_dataset/export_mongo_fixtures.py --manifest-only` |
| `sefaria/tests/fixture_schema_test.py` fails | a model schema digest changed | re-record: `python scripts/pytest_minimal_dataset/rerecord_fixtures.py` |
| `FIXTURE DRIFT for <nodeid> ... Fix: ...` | the test queries a field or collection its fixture was not recorded with | `python scripts/pytest_minimal_dataset/rerecord_fixtures.py --only '<nodeid>'` |
| `mongomock ignores hint: ...` | the test needs real Mongo behavior | mark the test `needs_corpus` |
| CI step `git diff --exit-code -- sefaria/tests/fixtures/mongo` fails | a test wrote to its fixture | fix the test so it does not write to the fixture; do not commit the change |

## Local shape-only refresh
`SEFARIA_FIXTURE_SHAPES=write python -m pytest <nodeid>` with `SEFARIA_MOCK_MONGO=1 SEFARIA_TEST_MONGO=1 LOCAL_TEST_MONGO_PORT=27099`. Review the diff.

## Never
- Set `SEFARIA_MOCK_MONGO_INCOMPLETE_OK` or `SEFARIA_FIXTURE_SHAPES=off` in CI.
- Hand-edit a fixture, the manifest or the shapes file.

Runbook: Sefaria wiki `runbooks/pytest-fixture-maintenance.md`.
