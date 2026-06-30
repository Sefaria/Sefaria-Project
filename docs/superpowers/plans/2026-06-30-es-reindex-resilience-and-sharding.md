# Elasticsearch Reindex — Resilience & Scatter-Gather Sharding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the weekly full Elasticsearch reindex reliable and fast by fixing the connection-hang root causes, restoring lost sheet coverage, and splitting the one 26-hour serial job into an isolated, parallel scatter-gather (init → N sharded workers → finalize).

**Architecture:** Two layers. **Layer 1 (resilience)** fixes the actual production failures: bound MongoDB dead-socket hangs with `socketTimeoutMS`, route Elasticsearch index-management and sheet writes through a retrying client, add bulk-helper retries, and tune the index for bulk load. **Layer 2 (isolation/parallelism)** refactors `index_all_of_type` into separable `init`/`shard`/`finalize` phases, adds size-aware sharding to `TextIndexer.index_all`, and drives them from a Kubernetes orchestrator pod that creates an Indexed Job (parallelism = N), waits on the barrier, then finalizes behind a doc-count sanity gate. **Layer 3 (standalone bug)** restores graceful fallbacks in `index_sheet` so the ~48k public sheets dropped since commit `12e9a845f` are searchable again.

**Tech Stack:** Python 3.12, Django (`sefaria.settings`), pymongo 4.15.x, elasticsearch-py 8.x, pytest, Helm, Kubernetes (GKE), `kubernetes` Python client (new dependency).

## Global Constraints

- Python 3.12; pymongo `4.15.*`; elasticsearch-py 8.x. Verify any client kwarg against the installed version before use.
- **No Shortcut story IDs** (e.g. `sc-xxxxx`) in any source file content, comment, string, identifier, or CSS. Branch names and commit messages may reference them.
- Tests run via pytest; `DJANGO_SETTINGS_MODULE = sefaria.settings`. Test files must match `pytest.ini` `python_files` globs (e.g. `sefaria/tests/*_test.py`, `sefaria/system/tests/*_test.py`, `sefaria/helper/tests/*_test.py`).
- The reindex MongoClient is the **global** app client (`sefaria/system/database.py`) shared by the online web path — timeout values must be safe for online requests (a generous ceiling that prevents infinite hangs, not a tight deadline that breaks slow admin queries).
- The dual-index a/b alias swap must remain **atomic and exactly-once**: readers always hit the stable alias; a partially-built index must never receive the alias.
- The reindex indexer ES client (`get_elasticsearch_client_for_indexer`) must **never** be used on the online request path.
- Sharding must be **deterministic across pods with zero coordination**: every worker computes the same shard assignment from the same inputs.
- Default shard count `N = 8` (configurable via env/Helm). Keep total concurrent ES writers modest to avoid `429 es_rejected_execution_exception`.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `sefaria/system/database.py` | Modify (`MongoClient` calls ~L64-77) | Add `socketTimeoutMS`, `connectTimeoutMS`, `serverSelectionTimeoutMS` to global client |
| `sefaria/helper/search.py` | Modify (`get_elasticsearch_client` ~L152) | Harden the default ES client (retry/timeout); add bulk-load settings helpers |
| `sefaria/search.py` | Modify | Sheet fallback fix; bulk-load tuning; `TextIndexer.index_all` shard params + size-aware sharding; split `index_all_of_type` into `init`/`index`/`finalize`; bulk-helper `max_retries` |
| `scripts/scheduled/reindex_elasticsearch_cronjob.py` | Modify | Add `--mode {monolith,init,shard,finalize}` + `--shard-index/--shard-count` entrypoints |
| `scripts/scheduled/reindex_orchestrator.py` | Create | Run init, create Indexed Job via k8s API, watch barrier, run finalize |
| `helm-chart/sefaria/templates/cronjob/reindex-elasticsearch.yaml` | Modify | Launch orchestrator; mount RBAC ServiceAccount |
| `helm-chart/sefaria/templates/rbac/reindex-orchestrator-rbac.yaml` | Create | ServiceAccount + Role (`jobs`, `pods` create/get/list/watch/delete) + RoleBinding |
| `helm-chart/sefaria/templates/job/reindex-shard-job.yaml` | Create | Indexed Job manifest template rendered by the orchestrator (or a ConfigMap-embedded spec) |
| `helm-chart/sefaria/values.yaml` | Modify (`cronJobs.reindexElasticSearch` ~L427) | Add `shardCount`, `mode`, image/resources for shard + orchestrator |
| `requirements.txt` | Modify | Add `kubernetes` client |
| `sefaria/tests/search_test.py` | Modify | Unit tests for sharding determinism + sheet fallback |
| `sefaria/system/tests/database_timeout_test.py` | Create | Assert MongoClient timeout kwargs are applied |

---

## Task 1: Bound MongoDB dead-socket hangs (Layer 1 — the primary killer)

**Root cause:** `sefaria/system/database.py` builds `MongoClient` with no `socketTimeoutMS`; pymongo defaults it to `None` (infinite), so a dead Mongo TCP socket blocks reads (`walk_thru_contents` dictionary lookups) until OS TCP keepalive (~2h) tears it down. Production logs show ~11h of the 26h run in silent multi-hour gaps. Setting a finite `socketTimeoutMS` lets the existing `AutoReconnect` retry + pymongo `retryReads` recover in minutes.

**Files:**
- Modify: `sefaria/system/database.py:60-77`
- Test: `sefaria/system/tests/database_timeout_test.py` (create)

**Interfaces:**
- Produces: a module-level `MONGO_CLIENT_TIMEOUT_KWARGS` dict reused by every `MongoClient(...)` call in this module.

- [ ] **Step 1: Write the failing test**

```python
# sefaria/system/tests/database_timeout_test.py
"""The global MongoClient must set finite socket/selection timeouts so a dead
Mongo TCP connection fails in minutes (and AutoReconnect retry recovers)
instead of hanging ~2h on OS TCP keepalive."""
import pytest
from sefaria.system import database


def test_timeout_kwargs_are_finite_and_sane():
    kw = database.MONGO_CLIENT_TIMEOUT_KWARGS
    # socketTimeoutMS bounds the dead-socket hang (was infinite/None)
    assert kw["socketTimeoutMS"] == 300_000
    # serverSelectionTimeoutMS waits through a full replica election
    assert kw["serverSelectionTimeoutMS"] == 60_000
    assert kw["connectTimeoutMS"] == 20_000


def test_live_client_has_timeouts_applied():
    # pymongo exposes resolved options on the client
    opts = database.client.options
    assert opts.pool_options.socket_timeout == 300.0          # seconds
    assert opts.server_selection_timeout == 60.0
    assert opts.pool_options.connect_timeout == 20.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest sefaria/system/tests/database_timeout_test.py -v`
Expected: FAIL — `AttributeError: module 'sefaria.system.database' has no attribute 'MONGO_CLIENT_TIMEOUT_KWARGS'`.

- [ ] **Step 3: Add the timeout kwargs and apply to every MongoClient call**

In `sefaria/system/database.py`, just above the `if MONGO_REPLICASET_NAME is None:` block (currently ~L62), add:

```python
    # Resilience for long-running batch jobs (the weekly ES reindex) AND the
    # online path: bound dead-socket hangs. Without socketTimeoutMS, pymongo
    # defaults to None (infinite) and a dead Mongo TCP connection blocks reads
    # until OS TCP keepalive (~2h) notices. 5 min is 2-3x the slowest legitimate
    # query and lets AutoReconnect retry / retryReads recover quickly.
    MONGO_CLIENT_TIMEOUT_KWARGS = {
        "socketTimeoutMS": 300_000,         # 5 min ceiling on any single socket read
        "connectTimeoutMS": 20_000,         # pymongo default, set explicitly
        "serverSelectionTimeoutMS": 60_000, # wait through a full replica election
    }
```

Then thread `**MONGO_CLIENT_TIMEOUT_KWARGS` into all three `MongoClient(...)` calls:

```python
    if MONGO_REPLICASET_NAME is None:
        if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
            client = pymongo.MongoClient(MONGO_HOST, MONGO_PORT, username=SEFARIA_DB_USER, password=SEFARIA_DB_PASSWORD, event_listeners=_event_listeners, **MONGO_CLIENT_TIMEOUT_KWARGS)
        else:
            client = pymongo.MongoClient(MONGO_HOST, MONGO_PORT, event_listeners=_event_listeners, **MONGO_CLIENT_TIMEOUT_KWARGS)
    else:
        if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
            username = urllib.parse.quote_plus(SEFARIA_DB_USER)
            password = urllib.parse.quote_plus(SEFARIA_DB_PASSWORD)
            connection_uri = 'mongodb://{}:{}@{}/?ssl=false&readPreference=primaryPreferred&replicaSet={}'.format(username, password, MONGO_HOST, MONGO_REPLICASET_NAME)
        else:
            connection_uri = 'mongodb://{}/?ssl=false&readPreference=primaryPreferred&replicaSet={}'.format(MONGO_HOST, MONGO_REPLICASET_NAME)
        client = pymongo.MongoClient(connection_uri, event_listeners=_event_listeners, **MONGO_CLIENT_TIMEOUT_KWARGS)
```

Note: `MONGO_CLIENT_TIMEOUT_KWARGS` must be defined at module scope (not inside the `else` branch). Place the dict assignment before the `if hasattr(sys, '_doc_build'):` guard so the name exists even in doc-build mode.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest sefaria/system/tests/database_timeout_test.py -v`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add sefaria/system/database.py sefaria/system/tests/database_timeout_test.py
git commit -m "fix(db): bound Mongo dead-socket hangs with finite socketTimeoutMS"
```

---

## Task 2: Harden the Elasticsearch index-management & sheet-write client

**Root cause:** `get_elasticsearch_client()` returns `Elasticsearch(SEARCH_URL)` with no retry/timeout config. `index_client = IndicesClient(es_client)` and all sheet `es_client.create()` writes use it, so the **alias swap**, index create/mapping, and 67k sheet writes have no retry — a transient ES error (common during the documented ES disk-full crash-loops) is fatal. Give this client the same resilience as the indexer client.

**Files:**
- Modify: `sefaria/helper/search.py:152-167`
- Test: `sefaria/helper/tests/search_test.py` (extend; create test fn)

**Interfaces:**
- Consumes: nothing new.
- Produces: `get_elasticsearch_client()` now returns a client configured with `request_timeout=90, retry_on_timeout=True, max_retries=3, http_compress=True`.

- [ ] **Step 1: Write the failing test**

```python
# append to sefaria/helper/tests/search_test.py
from sefaria.helper.search import get_elasticsearch_client

def test_default_es_client_is_hardened():
    es = get_elasticsearch_client()
    transport_kwargs = es._transport.__dict__
    # elasticsearch-py 8.x stores max_retries/retry_on_timeout on the transport
    assert es._max_retries == 3
    assert es._retry_on_timeout is True
```

(If the installed elasticsearch-py exposes these under different private attrs, assert via `es.options(...)` round-trip instead; verify the exact attribute on the installed version before finalizing the assertion.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest sefaria/helper/tests/search_test.py::test_default_es_client_is_hardened -v`
Expected: FAIL — `assert 0 == 3` (defaults).

- [ ] **Step 3: Harden the client factory**

In `sefaria/helper/search.py`, replace `get_elasticsearch_client`:

```python
def get_elasticsearch_client():
    from elasticsearch import Elasticsearch
    from sefaria.settings import SEARCH_URL
    # Hardened for index-management (alias swap, create/mapping) and sheet writes.
    # These previously used a bare client with no retries — a single transient ES
    # error during the alias swap or sheet load would abort the whole reindex.
    return Elasticsearch(
        SEARCH_URL,
        request_timeout=90,
        retry_on_timeout=True,
        max_retries=3,
        http_compress=True,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest sefaria/helper/tests/search_test.py::test_default_es_client_is_hardened -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sefaria/helper/search.py sefaria/helper/tests/search_test.py
git commit -m "fix(search): harden default ES client used by alias swap and sheet writes"
```

---

## Task 3: Add helper-level retries to the bulk text flush

**Root cause:** `elasticsearch.helpers.bulk` defaults `max_retries=0` — `429 es_rejected_execution_exception` (back-pressure, more likely with parallel writers in Layer 2) is not retried at the helper level. Add helper retries with backoff to `_flush_bulk_actions`.

**Files:**
- Modify: `sefaria/search.py:539-560` (`_flush_bulk_actions`)
- Test: `sefaria/tests/search_test.py` (extend)

**Interfaces:**
- Consumes: `bulk` (already imported).
- Produces: `_flush_bulk_actions` calls `bulk(...)` with `max_retries=3, initial_backoff=2, max_backoff=60`.

- [ ] **Step 1: Write the failing test**

```python
# append to sefaria/tests/search_test.py
def test_flush_passes_retry_kwargs(monkeypatch):
    from sefaria import search
    captured = {}
    def fake_bulk(client, actions, **kwargs):
        captured.update(kwargs)
        return (len(actions), [])
    monkeypatch.setattr(search, "bulk", fake_bulk)
    search.TextIndexer._bulk_actions = [{"_id": "x"}]
    search.TextIndexer._flush_bulk_actions([])
    assert captured["max_retries"] == 3
    assert captured["initial_backoff"] == 2
    assert captured["max_backoff"] == 60
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest sefaria/tests/search_test.py::test_flush_passes_retry_kwargs -v`
Expected: FAIL — `KeyError: 'max_retries'`.

- [ ] **Step 3: Add retry kwargs to the bulk call**

In `sefaria/search.py` `_flush_bulk_actions`, change the `bulk(...)` call:

```python
            bulk(_indexer_es_client, cls._bulk_actions, stats_only=True,
                 raise_on_error=False, request_timeout=120,
                 max_retries=3, initial_backoff=2, max_backoff=60)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest sefaria/tests/search_test.py::test_flush_passes_retry_kwargs -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sefaria/search.py sefaria/tests/search_test.py
git commit -m "fix(search): retry bulk 429 rejections at the helper level"
```

---

## Task 4: Restore graceful fallbacks in sheet indexing (Layer 3 — recover ~48k sheets)

**Root cause:** Commit `12e9a845f` turned optional sheet fields (`summary`, `datePublished`, `dateCreated`, `dateModified`) and optional user-profile fields into hard-required validation (`search.py:155,167` + `make_sheet_text` raise at `209-211`). `index_public_sheets` indexes `{"status": "public"}` sheets, so all 67,389 should be searchable — but 48,053 (71%, all old low-id sheets predating those fields) are silently dropped. Restore the pre-`12e9a845f` fallbacks: only `owner` is truly required.

**Files:**
- Modify: `sefaria/search.py:145-211` (`index_sheet`, `make_sheet_text`)
- Test: `sefaria/tests/search_test.py` (extend)

**Interfaces:**
- Produces: `index_sheet(index_name, id)` returns `True` for a public sheet missing `summary`/dates as long as `owner` resolves; missing profile fields fall back to `""`.

- [ ] **Step 1: Write the failing test**

```python
# append to sefaria/tests/search_test.py
def test_index_sheet_indexes_legacy_sheet_without_summary(monkeypatch):
    from sefaria import search
    legacy_sheet = {"id": 7, "owner": 42, "title": "Old Sheet", "sources": []}
    monkeypatch.setattr(search.db.sheets, "find_one", lambda q: legacy_sheet)
    monkeypatch.setattr(search, "public_user_data",
                        lambda uid: {"name": "A", "imageUrl": "", "profileUrl": ""})
    monkeypatch.setattr(search, "user_link", lambda uid: "<a>A</a>")
    monkeypatch.setattr(search, "make_sheet_topics", lambda s: [])
    monkeypatch.setattr(search, "CollectionSet", lambda q: [])
    created = {}
    monkeypatch.setattr(search.es_client, "create",
                        lambda index, id, body: created.update({"id": id, "body": body}))
    result = search.index_sheet("sheet-a", 7)
    assert result is True
    assert created["id"] == 7
    assert created["body"]["summary"] is None  # legacy null is fine for ES
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest sefaria/tests/search_test.py::test_index_sheet_indexes_legacy_sheet_without_summary -v`
Expected: FAIL — `index_sheet` returns `False` at the `summary is None` validation.

- [ ] **Step 3: Replace the strict validation with fallbacks**

In `sefaria/search.py`, replace lines `147-168` (the two validation blocks) with:

```python
    # Only `owner` is truly required. summary/dates are optional schema fields
    # (absent on legacy sheets) — ES indexes them as null. Treating them as
    # required silently dropped ~71% of public sheets (regression from 12e9a845f).
    owner_id = sheet.get("owner")
    if not owner_id:
        return False  # genuinely cannot build a sheet doc without an owner

    sheet_title = sheet.get("title") or ""
    summary = sheet.get("summary")
    datePublished = sheet.get("datePublished")
    dateCreated = sheet.get("dateCreated")
    dateModified = sheet.get("dateModified")

    pud = public_user_data(owner_id)
    if not pud:
        pud = {"name": "", "imageUrl": "", "profileUrl": ""}

    owner_name = pud.get("name", "")
    owner_image = pud.get("imageUrl", "")
    profile_url = pud.get("profileUrl", "")
    owner_link = user_link(owner_id) or ""
```

Then update the `try` doc dict (the `"title"` key) to use the now-fallback'd `sheet_title` and the `except` to log instead of swallowing silently:

```python
    try:
        doc = {
            "title": strip_tags(sheet_title),
            "content": make_sheet_text(sheet, pud),
            "owner_id": owner_id,
            "owner_name": owner_name,
            "owner_image": owner_image,
            "profile_url": profile_url,
            "version": "Source Sheet by " + owner_link,
            "topic_slugs": [topic_obj.slug for topic_obj in topics],
            "topics_en": [topic_obj.get_primary_title('en') for topic_obj in topics],
            "topics_he": [topic_obj.get_primary_title('he') for topic_obj in topics],
            "sheetId": id,
            "summary": summary,
            "collections": collection_names,
            "datePublished": datePublished,
            "dateCreated": dateCreated,
            "dateModified": dateModified,
            "views": sheet.get("views", 0)
        }
        es_client.create(index=index_name, id=id, body=doc)
        return True
    except Exception as e:
        logger.warning(f"Failed to index sheet {id}: {type(e).__name__}: {e}")
        return False
```

- [ ] **Step 4: Make `make_sheet_text` tolerate a missing summary**

In `sefaria/search.py` `make_sheet_text` (`200-211`), replace the raise:

```python
def make_sheet_text(sheet, pud):
    """Returns a plain text representation of the content of sheet."""
    title = sheet.get("title") or ""
    summary = sheet.get("summary") or ""
    text = " ".join([t for t in [title, summary] if t])
    # ... keep the remainder of the original body (source recursion / outsideText),
    # using `text` as the seed instead of the prior title+summary concatenation.
```

Read the current `make_sheet_text` body in full before editing and preserve its source-recursion logic; only the title/summary seeding and the removed `raise` change.

- [ ] **Step 5: Run tests**

Run: `pytest sefaria/tests/search_test.py::test_index_sheet_indexes_legacy_sheet_without_summary -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add sefaria/search.py sefaria/tests/search_test.py
git commit -m "fix(search): restore sheet-index fallbacks so legacy public sheets index"
```

---

## Task 5: Bulk-load index tuning (refresh_interval / replicas)

**Goal:** Cut indexing cost 30–50% by disabling refresh and replicas during the build, then restoring + forcing a refresh. Add reusable helpers; wire into the create/finalize phases (Task 6 consumes them).

**Files:**
- Modify: `sefaria/search.py` (add two module functions near `create_index`)
- Test: `sefaria/tests/search_test.py` (extend)

**Interfaces:**
- Produces:
  - `set_index_bulk_load_settings(index_name)` → puts `{"refresh_interval": "-1", "number_of_replicas": 0}`.
  - `restore_index_settings(index_name, refresh_interval="1s", number_of_replicas=1)` → restores, then `index_client.refresh(index=index_name)`.

- [ ] **Step 1: Write the failing test**

```python
# append to sefaria/tests/search_test.py
def test_bulk_load_settings_disable_refresh_and_replicas(monkeypatch):
    from sefaria import search
    calls = {}
    monkeypatch.setattr(search.index_client, "put_settings",
                        lambda index, body: calls.update({"settings": body, "index": index}))
    search.set_index_bulk_load_settings("text-a")
    assert calls["settings"]["index"]["refresh_interval"] == "-1"
    assert calls["settings"]["index"]["number_of_replicas"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest sefaria/tests/search_test.py::test_bulk_load_settings_disable_refresh_and_replicas -v`
Expected: FAIL — `AttributeError: ... has no attribute 'set_index_bulk_load_settings'`.

- [ ] **Step 3: Add the helpers**

In `sefaria/search.py`, after `create_index`:

```python
def set_index_bulk_load_settings(index_name):
    """Disable refresh + replicas for fast bulk ingest. Restore via restore_index_settings()."""
    index_client.put_settings(index=index_name, body={
        "index": {"refresh_interval": "-1", "number_of_replicas": 0}
    })
    logger.info(f"Set bulk-load settings (refresh=-1, replicas=0) - index: {index_name}")


def restore_index_settings(index_name, refresh_interval="1s", number_of_replicas=1):
    """Restore production settings after bulk ingest and force a refresh so docs are searchable."""
    index_client.put_settings(index=index_name, body={
        "index": {"refresh_interval": refresh_interval, "number_of_replicas": number_of_replicas}
    })
    index_client.refresh(index=index_name)
    logger.info(f"Restored settings (refresh={refresh_interval}, replicas={number_of_replicas}) + refreshed - index: {index_name}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest sefaria/tests/search_test.py::test_bulk_load_settings_disable_refresh_and_replicas -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sefaria/search.py sefaria/tests/search_test.py
git commit -m "feat(search): add bulk-load index settings helpers"
```

---

## Task 6: Deterministic size-aware sharding in `TextIndexer.index_all`

**Goal:** Let `TextIndexer.index_all` index only its shard of the `(title, language)` groups, balanced by size so the heavy head (first ~100 books ≈ 2.8h) spreads evenly. Deterministic across pods: every worker sorts the same groups by a size proxy and takes a snake-distributed slice. Also add `create` control so workers don't recreate the index.

**Files:**
- Modify: `sefaria/search.py` — `TextIndexer.index_all` signature + group selection (`660-697`); add a `_select_shard_groups` classmethod.
- Test: `sefaria/tests/search_test.py` (extend)

**Interfaces:**
- Consumes: `versions_by_index` (built in `index_all`); `VersionStateSet` for the size map.
- Produces:
  - `TextIndexer.index_all(cls, index_name, debug=False, for_es=True, action=None, shard_index=None, shard_count=None)` — when `shard_index`/`shard_count` are set, only that shard's groups are indexed.
  - `TextIndexer._select_shard_groups(versions_by_index, shard_index, shard_count) -> dict` — pure, deterministic.

- [ ] **Step 1: Write the failing test (determinism + full coverage + balance)**

```python
# append to sefaria/tests/search_test.py
def test_shard_selection_is_deterministic_partition():
    from sefaria.search import TextIndexer
    # 20 fake groups with varied sizes; keys are (title, lang)
    vbi = {(f"Book{i}", "en"): list(range(i % 5 + 1)) for i in range(20)}
    N = 4
    shards = [TextIndexer._select_shard_groups(vbi, i, N) for i in range(N)]
    # 1. Partition: every group appears in exactly one shard, no loss, no dup
    seen = {}
    for s in shards:
        for k in s:
            assert k not in seen
            seen[k] = True
    assert set(seen) == set(vbi)
    # 2. Determinism: same call → same result
    assert TextIndexer._select_shard_groups(vbi, 1, N) == shards[1]
    # 3. Balance: shard group-counts differ by at most 1
    counts = [len(s) for s in shards]
    assert max(counts) - min(counts) <= 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest sefaria/tests/search_test.py::test_shard_selection_is_deterministic_partition -v`
Expected: FAIL — `AttributeError: ... '_select_shard_groups'`.

- [ ] **Step 3: Implement `_select_shard_groups` (snake distribution over size-sorted groups)**

In `sefaria/search.py`, add to `TextIndexer`:

```python
    @classmethod
    def _index_size_map(cls):
        """Cheap per-title size proxy from VersionState (one set load, no per-index Mongo).
        Returns {title: weight}; missing/unparseable -> weight 1."""
        sizes = {}
        try:
            for vs in VersionStateSet():
                title = getattr(vs, "title", None)
                if not title:
                    continue
                weight = 1
                try:
                    # top-level availableCounts is a small list per language; sum as proxy
                    for lang in ("he", "en"):
                        counts = vs.content_node.get_available_counts(lang) if hasattr(vs, "content_node") else None
                        if counts:
                            weight += sum(c for c in counts if isinstance(c, int))
                except Exception:
                    pass
                sizes[title] = max(weight, 1)
        except Exception as e:
            logger.warning(f"Could not build index size map, falling back to uniform weights: {e}")
        return sizes

    @classmethod
    def _select_shard_groups(cls, versions_by_index, shard_index, shard_count, size_map=None):
        """Deterministically pick this shard's (title, lang) groups.
        Snake-distribute groups sorted by descending size so the heavy head spreads evenly."""
        size_map = size_map or {}
        def weight(key):
            title = key[0]
            return size_map.get(title, len(versions_by_index[key]))
        # stable, deterministic ordering: by descending weight, then by key
        ordered = sorted(versions_by_index.keys(), key=lambda k: (-weight(k), k))
        selected = {}
        for pos, key in enumerate(ordered):
            # snake: 0..N-1, then N-1..0, repeating -> balances big items across shards
            cycle = pos // shard_count
            offset = pos % shard_count
            assigned = offset if cycle % 2 == 0 else (shard_count - 1 - offset)
            if assigned == shard_index:
                selected[key] = versions_by_index[key]
        return selected
```

- [ ] **Step 4: Run the selection test**

Run: `pytest sefaria/tests/search_test.py::test_shard_selection_is_deterministic_partition -v`
Expected: PASS.

- [ ] **Step 5: Wire sharding into `index_all`**

Change the signature and group-loop seed in `TextIndexer.index_all`:

```python
    @classmethod
    def index_all(cls, index_name, debug=False, for_es=True, action=None, shard_index=None, shard_count=None):
```

After `versions_by_index` is fully built (current `685`), before `total_versions = len(versions)`, insert:

```python
        if shard_index is not None and shard_count is not None:
            size_map = cls._index_size_map()
            versions_by_index = cls._select_shard_groups(versions_by_index, shard_index, shard_count, size_map)
            logger.info(f"Shard {shard_index}/{shard_count}: indexing {len(versions_by_index)} of the title groups")
```

(`VersionStateSet` is already importable via `from sefaria.model import *` at the top of `search.py`; confirm it is in scope — if not, add `from sefaria.model.version_state import VersionStateSet`.)

- [ ] **Step 6: Add a sharded smoke test that exercises index_all's selection branch**

```python
# append to sefaria/tests/search_test.py
def test_index_all_only_processes_its_shard(monkeypatch):
    from sefaria import search
    indexed = []
    monkeypatch.setattr(search.TextIndexer, "create_version_priority_map", classmethod(lambda cls: None))
    monkeypatch.setattr(search.TextIndexer, "create_terms_dict", classmethod(lambda cls: None))
    monkeypatch.setattr(search.TextIndexer, "_index_size_map", classmethod(lambda cls: {}))
    monkeypatch.setattr(search.Ref, "clear_cache", staticmethod(lambda: None))
    # 4 single-version groups; stub get_all_versions + priority map membership
    vers = [search.Version({"title": t, "versionTitle": "v", "language": "en"}) if False else type("V", (), {"title": t, "versionTitle": "v", "language": "en"})() for t in ["A", "B", "C", "D"]]
    monkeypatch.setattr(search.TextIndexer, "get_all_versions", classmethod(lambda cls, *a, **k: vers))
    search.TextIndexer.version_priority_map = {(v.title, "v", "en"): (0, []) for v in vers}
    monkeypatch.setattr(search.TextIndexer, "index_version", classmethod(lambda cls, v, **k: indexed.append(v.title)))
    monkeypatch.setattr(search.TextIndexer, "_flush_bulk_actions", classmethod(lambda cls, ifv: 0))
    monkeypatch.setattr(search.TextIndexer, "excluded_from_search", classmethod(lambda cls, v: False))
    # make get_index cheap
    for v in vers:
        v.get_index = lambda self=v: type("I", (), {"title": self.title, "best_time_period": lambda: type("TP", (), {"start": 0})()})()
    search.TextIndexer.clear_cache()
    search.TextIndexer.index_all("text-a", for_es=False, shard_index=0, shard_count=4)
    assert len(indexed) == 1  # exactly one of the 4 groups belongs to shard 0
```

(This test is illustrative of intent; adapt the `Version`/index stubbing to the existing `_FakeVersion`/`_FakeIndex` helpers already in `search_test.py` rather than re-rolling them.)

- [ ] **Step 7: Run tests**

Run: `pytest sefaria/tests/search_test.py -v -k "shard"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add sefaria/search.py sefaria/tests/search_test.py
git commit -m "feat(search): deterministic size-aware sharding for TextIndexer.index_all"
```

---

## Task 7: Split `index_all_of_type` into init / index-shard / finalize phases

**Goal:** Decompose the monolith so the orchestrator can call each phase from a different pod. `init` creates the index (bulk-load settings on) exactly once; `index_shard` indexes one shard into the existing index; `finalize` restores settings, runs a doc-count sanity gate, swaps the alias, drops the old index. Keep the old monolithic `index_all_of_type` working (calls the three in sequence) so `--mode monolith` remains a safe fallback.

**Files:**
- Modify: `sefaria/search.py:1155-1253` (`index_all_of_type`, `index_all_of_type_by_index_name`)
- Test: `sefaria/tests/search_test.py` (extend)

**Interfaces:**
- Produces:
  - `reindex_init(type, debug=False) -> dict` — returns `get_new_and_current_index_names(...)`; creates the `new` index via `create_index(force_recreate)` and calls `set_index_bulk_load_settings(new)`. Idempotent (safe to re-run).
  - `reindex_index_shard(type, shard_index, shard_count, debug=False)` — indexes one shard into the current `new` index (no create, no swap).
  - `reindex_finalize(type, debug=False, min_doc_ratio=0.9)` — `restore_index_settings(new)`, sanity gate (new docs ≥ `min_doc_ratio` × current docs, unless current is empty/first run), then the alias swap + drop old (existing tail of `index_all_of_type`).
  - `index_all_of_type(type, skip=0, debug=False)` — now: `reindex_init` → `reindex_index_shard(no shard args = whole corpus)` → `reindex_finalize`.

- [ ] **Step 1: Write the failing test (sanity gate refuses a too-small new index)**

```python
# append to sefaria/tests/search_test.py
def test_finalize_sanity_gate_refuses_undersized_index(monkeypatch):
    from sefaria import search
    names = {"new": "text-a", "current": "text-b", "alias": "text"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search, "restore_index_settings", lambda *a, **k: None)
    # current has 1,000,000 docs; new only has 10 -> must refuse and NOT swap
    counts = {"text-a": 10, "text-b": 1_000_000}
    monkeypatch.setattr(search, "_index_doc_count", lambda name: counts.get(name, 0))
    swapped = {"v": False}
    monkeypatch.setattr(search.index_client, "put_alias", lambda index, name: swapped.update(v=True))
    with pytest.raises(ValueError, match="sanity"):
        search.reindex_finalize("text", min_doc_ratio=0.9)
    assert swapped["v"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest sefaria/tests/search_test.py::test_finalize_sanity_gate_refuses_undersized_index -v`
Expected: FAIL — `AttributeError: ... 'reindex_finalize'`.

- [ ] **Step 3: Implement the three phase functions + a doc-count helper**

In `sefaria/search.py`, add a small helper and the three functions (reuse the existing alias-swap tail from `index_all_of_type`):

```python
def _index_doc_count(index_name):
    try:
        if not index_client.exists(index=index_name):
            return 0
        stats = index_client.stats(index=index_name)
        return stats.get('_all', {}).get('primaries', {}).get('docs', {}).get('count', 0)
    except Exception:
        return 0


def reindex_init(type, debug=False):
    names = get_new_and_current_index_names(type=type, debug=debug)
    create_index(names['new'], type, force=True)
    set_index_bulk_load_settings(names['new'])
    logger.info(f"reindex_init complete - type: {type}, new_index: {names['new']}")
    return names


def reindex_index_shard(type, shard_index=None, shard_count=None, debug=False):
    names = get_new_and_current_index_names(type=type, debug=debug)
    if type == 'text':
        TextIndexer.clear_cache()
        TextIndexer.index_all(names['new'], debug=debug, shard_index=shard_index, shard_count=shard_count)
    elif type == 'sheet':
        index_public_sheets(names['new'])
    else:
        raise ValueError(f"Unknown index type: {type}")
    logger.info(f"reindex_index_shard complete - type: {type}, shard: {shard_index}/{shard_count}")


def reindex_finalize(type, debug=False, min_doc_ratio=0.9):
    names = get_new_and_current_index_names(type=type, debug=debug)
    restore_index_settings(names['new'])
    new_count = _index_doc_count(names['new'])
    current_count = _index_doc_count(names['current'])
    # Sanity gate: never swap the alias onto an index that lost a large fraction of docs.
    if current_count > 0 and new_count < current_count * min_doc_ratio:
        raise ValueError(
            f"Reindex sanity gate failed for {type}: new index {names['new']} has {new_count} docs "
            f"but current {names['current']} has {current_count} (< {min_doc_ratio:.0%}). Refusing alias swap."
        )
    # --- alias swap + cleanup (moved verbatim from index_all_of_type tail) ---
    try:
        index_client.delete_alias(index=names['current'], name=names['alias'])
    except NotFoundError:
        pass
    clear_index(names['alias'])
    index_client.put_alias(index=names['new'], name=names['alias'])
    if names['new'] != names['current']:
        clear_index(names['current'])
    logger.info(f"reindex_finalize complete - type: {type}, alias -> {names['new']} ({new_count} docs)")
```

- [ ] **Step 4: Rewrite `index_all_of_type` to compose the phases**

Replace the body of `index_all_of_type` (keep the 10s countdown if desired) with:

```python
def index_all_of_type(type, skip=0, debug=False):
    reindex_init(type, debug=debug)
    reindex_index_shard(type, debug=debug)  # whole corpus, no sharding
    reindex_finalize(type, debug=debug)
```

(`index_all_of_type_by_index_name` is now only used by the monolith path; leave it in place but it is no longer on the primary route.)

- [ ] **Step 5: Run tests**

Run: `pytest sefaria/tests/search_test.py::test_finalize_sanity_gate_refuses_undersized_index -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add sefaria/search.py sefaria/tests/search_test.py
git commit -m "refactor(search): split reindex into init/shard/finalize with sanity gate"
```

---

## Task 8: Cronjob entrypoint modes

**Goal:** Make `reindex_elasticsearch_cronjob.py` callable as `init`, `shard`, `finalize`, or `monolith`. Shard mode reads `--shard-index`/`--shard-count` (defaulting from `JOB_COMPLETION_INDEX` / `SHARD_COUNT` env). PageSheetRank runs in `init`; sheets + sheets-catch-up run in `finalize`.

**Files:**
- Modify: `scripts/scheduled/reindex_elasticsearch_cronjob.py` (argparse + dispatch in `main`)
- Test: manual (script smoke) — no unit test (thin CLI wrapper over tested functions)

**Interfaces:**
- Consumes: `reindex_init`, `reindex_index_shard`, `reindex_finalize`, `index_all`, `update_pagesheetrank`, `run_sheets_by_timestamp`.

- [ ] **Step 1: Add `--mode` and shard args to argparse**

```python
    parser.add_argument("--mode", choices=["monolith", "init", "shard", "finalize"], default="monolith")
    parser.add_argument("--type", choices=["text", "sheet"], default="text")
    parser.add_argument("--shard-index", type=int, default=None)
    parser.add_argument("--shard-count", type=int, default=None)
```

- [ ] **Step 2: Resolve shard identity from env when not passed**

```python
    import os
    shard_index = args.shard_index
    if shard_index is None and os.environ.get("JOB_COMPLETION_INDEX") is not None:
        shard_index = int(os.environ["JOB_COMPLETION_INDEX"])
    shard_count = args.shard_count or (int(os.environ["SHARD_COUNT"]) if os.environ.get("SHARD_COUNT") else None)
```

- [ ] **Step 3: Dispatch on mode**

Replace the `STEP 1/2/3` body of `main` with:

```python
    from sefaria.search import reindex_init, reindex_index_shard, reindex_finalize
    if args.mode == "monolith":
        run_pagesheetrank_update(result)
        run_index_all(result)
        run_sheets_by_timestamp(last_sheet_timestamp, result)
    elif args.mode == "init":
        run_pagesheetrank_update(result)         # 2.5h shared prerequisite, once
        reindex_init("text"); reindex_init("sheet")
    elif args.mode == "shard":
        reindex_index_shard("text", shard_index=shard_index, shard_count=shard_count)
    elif args.mode == "finalize":
        reindex_finalize("text")
        reindex_index_shard("sheet")             # sheets are small; index serially here
        reindex_finalize("sheet")
        run_sheets_by_timestamp(last_sheet_timestamp, result)
```

- [ ] **Step 4: Smoke-test argparse**

Run: `python scripts/scheduled/reindex_elasticsearch_cronjob.py --help`
Expected: usage shows `--mode {monolith,init,shard,finalize}`.

- [ ] **Step 5: Commit**

```bash
git add scripts/scheduled/reindex_elasticsearch_cronjob.py
git commit -m "feat(reindex): add init/shard/finalize cronjob entrypoint modes"
```

---

## Task 9: Orchestrator script (creates Indexed Job, waits, finalizes)

**Goal:** A single entrypoint the weekly CronJob runs. It runs `init` in-process, creates a Kubernetes **Indexed Job** (`completionMode: Indexed`, `parallelism=N`, `completions=N`) whose pods run `--mode shard`, watches it to completion, then runs `finalize` in-process. Holds no ES/Mongo connection during the long phase — only polls Job status.

**Files:**
- Create: `scripts/scheduled/reindex_orchestrator.py`
- Modify: `requirements.txt` (add `kubernetes`)
- Test: a pure-logic unit test for the watch/exit decision

**Interfaces:**
- Consumes: `reindex_init`, `reindex_finalize` from `sefaria.search`; the `kubernetes` client; env `SHARD_COUNT`, `SHARD_JOB_IMAGE`, `SHARD_JOB_NAME`, `K8S_NAMESPACE`.
- Produces: `build_shard_job_manifest(name, namespace, image, shard_count, command) -> dict`; `job_terminal_state(job_status) -> str|None` returning `"complete"`, `"failed"`, or `None`.

- [ ] **Step 1: Add the dependency**

Append to `requirements.txt`:

```
kubernetes==31.*
```

Run: `pip install 'kubernetes==31.*'`

- [ ] **Step 2: Write the failing test for the terminal-state logic**

```python
# sefaria/system/tests/reindex_orchestrator_test.py
import importlib.util, pathlib
spec = importlib.util.spec_from_file_location(
    "reindex_orchestrator",
    pathlib.Path("scripts/scheduled/reindex_orchestrator.py"))
orch = importlib.util.module_from_spec(spec)

def test_job_terminal_state():
    spec.loader.exec_module(orch)
    assert orch.job_terminal_state({"succeeded": 8, "failed": 0}, completions=8) == "complete"
    assert orch.job_terminal_state({"succeeded": 3, "failed": 1}, completions=8) is None
    assert orch.job_terminal_state({"succeeded": 5, "failed": 3}, completions=8, backoff_exhausted=True) == "failed"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest sefaria/system/tests/reindex_orchestrator_test.py -v`
Expected: FAIL — module/file does not exist.

- [ ] **Step 4: Implement the orchestrator**

```python
#!/usr/bin/env python
"""Reindex orchestrator: init -> Indexed Job (N shards) -> finalize.
Runs as the weekly CronJob. Holds no ES/Mongo connection during the shard phase."""
import os, sys, time, logging, django
django.setup()
from kubernetes import client, config, watch
from sefaria.search import reindex_init, reindex_finalize, setup_logging

logger = logging.getLogger(__name__)


def job_terminal_state(status, completions, backoff_exhausted=False):
    if status.get("succeeded", 0) >= completions:
        return "complete"
    if backoff_exhausted:
        return "failed"
    return None


def build_shard_job_manifest(name, namespace, image, shard_count, command, env=None, resources=None):
    return {
        "apiVersion": "batch/v1", "kind": "Job",
        "metadata": {"name": name, "namespace": namespace},
        "spec": {
            "completionMode": "Indexed",
            "completions": shard_count,
            "parallelism": shard_count,
            "backoffLimitPerIndex": 2,        # retry a failed shard, not the whole job
            "maxFailedIndexes": 0,
            "ttlSecondsAfterFinished": 86400,
            "template": {"spec": {
                "restartPolicy": "Never",
                "containers": [{
                    "name": "reindex-shard", "image": image,
                    "command": command,
                    "env": (env or []) + [{"name": "SHARD_COUNT", "value": str(shard_count)}],
                    "resources": resources or {"requests": {"memory": "8Gi"}, "limits": {"memory": "12Gi"}},
                }],
            }},
        },
    }


def main():
    setup_logging(False)
    config.load_incluster_config()
    namespace = os.environ["K8S_NAMESPACE"]
    shard_count = int(os.environ.get("SHARD_COUNT", "8"))
    image = os.environ["SHARD_JOB_IMAGE"]
    job_name = os.environ.get("SHARD_JOB_NAME", "reindex-shard")
    command = ["bash", "-c",
               "pip install numpy && /app/run /app/scripts/scheduled/reindex_elasticsearch_cronjob.py --mode shard --type text"]

    batch = client.BatchV1Api()

    # 1. INIT (pagesheetrank + create indexes + bulk-load settings)
    logger.info("Orchestrator: running init (pagesheetrank + create indexes)")
    from sefaria.pagesheetrank import update_pagesheetrank
    update_pagesheetrank()
    reindex_init("text"); reindex_init("sheet")

    # 2. Create the Indexed Job; delete a stale one first
    try:
        batch.delete_namespaced_job(job_name, namespace, propagation_policy="Background")
        time.sleep(10)
    except client.exceptions.ApiException:
        pass
    manifest = build_shard_job_manifest(job_name, namespace, image, shard_count, command)
    batch.create_namespaced_job(namespace, manifest)
    logger.info(f"Orchestrator: created Indexed Job {job_name} with {shard_count} shards")

    # 3. Watch to completion
    while True:
        job = batch.read_namespaced_job_status(job_name, namespace)
        st = job.status
        status = {"succeeded": st.succeeded or 0, "failed": st.failed or 0}
        backoff_exhausted = bool(getattr(st, "conditions", None)) and any(
            c.type == "Failed" and c.status == "True" for c in st.conditions)
        state = job_terminal_state(status, shard_count, backoff_exhausted)
        logger.info(f"Orchestrator: shard job {status}, state={state}")
        if state == "complete":
            break
        if state == "failed":
            logger.error("Orchestrator: shard job failed; NOT finalizing (alias unchanged)")
            sys.exit(1)
        time.sleep(60)

    # 4. FINALIZE (restore settings, sanity gate, alias swap; then sheets)
    logger.info("Orchestrator: all shards complete; finalizing")
    reindex_finalize("text")
    from sefaria.search import reindex_index_shard
    reindex_index_shard("sheet")
    reindex_finalize("sheet")
    logger.info("Orchestrator: reindex complete")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the logic test**

Run: `pytest sefaria/system/tests/reindex_orchestrator_test.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/scheduled/reindex_orchestrator.py sefaria/system/tests/reindex_orchestrator_test.py requirements.txt
git commit -m "feat(reindex): orchestrator creates Indexed Job and finalizes behind barrier"
```

---

## Task 10: RBAC for the orchestrator

**Goal:** ServiceAccount + Role (manage Jobs/Pods in the namespace) + RoleBinding so `load_incluster_config()` can create/watch/delete the shard Job.

**Files:**
- Create: `helm-chart/sefaria/templates/rbac/reindex-orchestrator-rbac.yaml`

- [ ] **Step 1: Write the manifest**

```yaml
{{- if .Values.cronJobs.reindexElasticSearch.enabled }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ .Values.deployEnv }}-reindex-orchestrator
  labels:
    {{- include "sefaria.labels" . | nindent 4 }}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: {{ .Values.deployEnv }}-reindex-orchestrator
rules:
  - apiGroups: ["batch"]
    resources: ["jobs", "jobs/status"]
    verbs: ["create", "get", "list", "watch", "delete"]
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: {{ .Values.deployEnv }}-reindex-orchestrator
subjects:
  - kind: ServiceAccount
    name: {{ .Values.deployEnv }}-reindex-orchestrator
roleRef:
  kind: Role
  name: {{ .Values.deployEnv }}-reindex-orchestrator
  apiGroup: rbac.authorization.k8s.io
{{- end }}
```

- [ ] **Step 2: Render to verify it templates**

Run: `helm template helm-chart/sefaria --set cronJobs.reindexElasticSearch.enabled=true --show-only templates/rbac/reindex-orchestrator-rbac.yaml`
Expected: three documents render with the env-prefixed names.

- [ ] **Step 3: Commit**

```bash
git add helm-chart/sefaria/templates/rbac/reindex-orchestrator-rbac.yaml
git commit -m "feat(helm): RBAC for reindex orchestrator to manage the shard Job"
```

---

## Task 11: Point the CronJob at the orchestrator + values

**Goal:** The weekly CronJob runs the orchestrator (with the ServiceAccount and the shard config in env). `backoffLimit: 0` on the CronJob (the orchestrator owns retries via the Indexed Job's `backoffLimitPerIndex`).

**Files:**
- Modify: `helm-chart/sefaria/templates/cronjob/reindex-elasticsearch.yaml`
- Modify: `helm-chart/sefaria/values.yaml` (`cronJobs.reindexElasticSearch`)

- [ ] **Step 1: Add values**

In `helm-chart/sefaria/values.yaml` under `reindexElasticSearch`:

```yaml
  reindexElasticSearch:
    enabled: false
    SEARCH_HOST_ES6: ""
    SEARCH_HOST_ES8: ""
    shardCount: 8
    orchestratorResources:
      requests: { memory: "4Gi" }
      limits: { memory: "6Gi" }
    shardResources:
      requests: { memory: "8Gi" }
      limits: { memory: "12Gi" }
```

- [ ] **Step 2: Update the CronJob container**

In `reindex-elasticsearch.yaml`, set the pod's `serviceAccountName`, the orchestrator command, and the shard env. Replace the `command/args` and add `serviceAccountName` + env:

```yaml
          serviceAccountName: {{ .Values.deployEnv }}-reindex-orchestrator
          containers:
          - name: reindex-elastic-search
            image: "{{ .Values.web.containerImage.imageRegistry }}:{{ .Values.web.containerImage.tag }}"
            resources:
              {{- toYaml .Values.cronJobs.reindexElasticSearch.orchestratorResources | nindent 14 }}
            env:
            - name: K8S_NAMESPACE
              valueFrom: { fieldRef: { fieldPath: metadata.namespace } }
            - name: SHARD_COUNT
              value: "{{ .Values.cronJobs.reindexElasticSearch.shardCount }}"
            - name: SHARD_JOB_IMAGE
              value: "{{ .Values.web.containerImage.imageRegistry }}:{{ .Values.web.containerImage.tag }}"
            - name: SHARD_JOB_NAME
              value: "{{ .Values.deployEnv }}-reindex-shard"
            # ... keep existing SEARCH_HOST/PORT/REDIS/NODEJS/VARNISH env and envFrom ...
            command: ["bash"]
            args: ["-c", "pip install numpy kubernetes && /app/run /app/scripts/scheduled/reindex_orchestrator.py"]
```

Keep the existing `schedule`, `envFrom`, `volumeMounts`, `volumes`, and the Mongo `podAntiAffinity`. The shard Job inherits the same image, so it has the codebase; its env (`SEARCH_HOST`, secrets) must be propagated — pass the same `envFrom` into `build_shard_job_manifest` env in a follow-up if shard pods miss settings (verify by reading the rendered shard pod env during the dry run in Task 12).

- [ ] **Step 3: Render to verify**

Run: `helm template helm-chart/sefaria --set cronJobs.reindexElasticSearch.enabled=true --show-only templates/cronjob/reindex-elasticsearch.yaml`
Expected: orchestrator command + `serviceAccountName` + `SHARD_COUNT=8` present.

- [ ] **Step 4: Commit**

```bash
git add helm-chart/sefaria/templates/cronjob/reindex-elasticsearch.yaml helm-chart/sefaria/values.yaml
git commit -m "feat(helm): run reindex via orchestrator + Indexed shard Job"
```

---

## Task 12: End-to-end dry run on staging/debug indexes

**Goal:** Validate the whole flow without touching production aliases, using the `-debug` index suffix and a small shard count.

- [ ] **Step 1: Unit suite green**

Run: `pytest sefaria/tests/search_test.py sefaria/system/tests/ sefaria/helper/tests/search_test.py -v`
Expected: all PASS.

- [ ] **Step 2: Local phase smoke (against a dev ES + Mongo, debug indexes)**

```bash
python scripts/scheduled/reindex_elasticsearch_cronjob.py --mode init --type text --debug
python scripts/scheduled/reindex_elasticsearch_cronjob.py --mode shard --type text --shard-index 0 --shard-count 2 --debug
python scripts/scheduled/reindex_elasticsearch_cronjob.py --mode shard --type text --shard-index 1 --shard-count 2 --debug
python scripts/scheduled/reindex_elasticsearch_cronjob.py --mode finalize --type text --debug
```
Expected: init creates `text-a-debug` (or `-b-debug`); each shard indexes a disjoint subset; finalize passes the sanity gate and swaps the `text-debug` alias. Confirm doc count ≈ a monolith run's count.

- [ ] **Step 3: Helm lint + template**

Run: `helm lint helm-chart/sefaria && helm template helm-chart/sefaria --set cronJobs.reindexElasticSearch.enabled=true >/dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit any fixes, then open PR**

```bash
git commit -am "test(reindex): e2e dry-run fixes" || true
```

Open one PR containing all tasks. PR description: link this plan, summarize the 4 root causes, and note the staging dry-run evidence (doc counts, shard balance, finalize sanity-gate pass).

---

## Self-Review Notes (coverage map)

- Root cause #1 (Mongo socket hang) → Task 1.
- Root cause #2 (un-hardened ES client) → Task 2 (+ Task 3 bulk retries).
- Root cause #3 (71% sheet loss) → Task 4.
- Root cause #4 (single failure domain / no isolation) → Tasks 6–11 (sharding + Indexed Job + per-shard `backoffLimitPerIndex` + finalize sanity gate).
- Secondary (bulk-load tuning) → Task 5 (+ wired in Task 7). PageSheetRank serial floor → runs once in `init` (Tasks 8/9). Heavy-head skew → size-aware snake sharding (Task 6).

**Open verification items for the executor (do not skip):**
1. Confirm `VersionStateSet` iteration exposes a `.title` and a usable available-counts accessor on the installed model; if the `content_node.get_available_counts` path differs, fall back to `weight = len(versions_by_index[key])` (the snake distribution still balances by count).
2. Confirm the shard pods receive the same `envFrom` (SEARCH_HOST, local-settings secrets) as the orchestrator — propagate into `build_shard_job_manifest` env if the dry run shows missing settings.
3. Confirm elasticsearch-py private attrs asserted in Task 2's test match the installed version; adjust the assertion if needed.
4. TCP keepalive (`net.ipv4.tcp_keepalive_time=120`) is a node-level defense-in-depth — track as a separate infra ticket, not in this PR.
