# Tracker and History
> Sources: `sefaria/tracker.py` (~267 lines), `sefaria/history.py` (~390 lines)

## Purpose

These two modules form the change-tracking system for Sefaria. `tracker.py` is the write-side gateway -- all text and object mutations flow through it so that every change is logged, caches are invalidated, and links are refreshed. `history.py` is the read-side layer -- it queries the `history` MongoDB collection to build activity feeds, reconstruct past text states, and compute contributor leaderboards.

## Key Components

### tracker.py -- Mutation Gateway

**Text modification functions:**

- `modify_text(user, oref, vtitle, lang, text, ...)` -- Updates a single text chunk (identified by ref, version title, and language). Checks version lock status, records old text, saves, then delegates to `_post_modify_changed_segments` for per-segment history logging. Finally calls `count_and_index()`.
- `modify_bulk_text(user, version, text_map, ...)` -- Bulk-updates many segments of a single `Version` at once. Walks the version's existing content via `version.walk_thru_contents()` to build a change map of `(old_text, new_text, oref)` tuples, applies changes in-place, then calls `post_modify_text()` per changed segment. Counts only once at the end.
- `modify_version(user, version_dict, patch=True, ...)` -- Creates or patches an entire Version from a dict. Walks the index tree via `visit_content(modify_node)` to detect node-level changes. Supports both patch mode (only overwrite non-empty nodes) and full replacement.

**Post-modification pipeline (`post_modify_text`):**

1. Calls `model.log_text()` to write a history record.
2. Invalidates Varnish cache for the ref and adjacent sections (if `USE_VARNISH`).
3. Generates auto-links via `MarkedUpTextChunkGenerator` (if Celery enabled) and `oref.autolinker()`.
4. Calls `count_and_index()` to update segment counts and enqueue for search indexing.

**`_post_modify_changed_segments`** -- Recursively walks old/new text (which may be nested lists for multi-level refs) and calls `post_modify_text` only for segments that actually changed. This avoids logging unchanged segments when a section-level save is performed.

**Generic CRUD for model objects:**

- `add(user, klass, attrs, ...)` -- Creates or updates a `AbstractMongoRecord` subclass, logging either `log_add` or `log_update`. Supports `criteria_override_field` for upsert-like behavior.
- `update(user, klass, attrs, ...)` -- Loads an existing record, snapshots `old_dict`, saves new attrs, logs `log_update`.
- `delete(user, klass, _id, ...)` -- Loads by `_id`, optionally runs a callback before deletion, then deletes and logs `log_delete`.

### history.py -- Activity Queries and Diffs

**Activity feeds:**

- `get_activity(query, page_size, page, filter_type)` -- Core query function. Reads from `db.history`, sorted by date descending, with pagination. Excludes `revert_patch` from projection for performance. Joins with user info and builds `history_url`.
- `collapse_activity(activity)` -- Collapses consecutive edits to the same section by the same user into summary items, with an `updates_count`. A "streak" continues if the same user edits/adds text in the same version and section.
- `get_maximal_collapsed_activity(...)` -- Wrapper that fetches enough raw activity to fill a full page after collapsing. Makes repeat DB calls with increasing batch sizes to compensate for collapse compression.
- `text_history(oref, version, lang, ...)` -- Returns the full history for a specific text segment, querying by both text ref and link refs.
- `filter_type_to_query(filter_type)` -- Translates filter strings (`"translate"`, `"flagged"`, `"index_change"`, etc.) into MongoDB query dicts. Special cases: `"translate"` matches SCT additions; `"flagged"` matches reviews scored <= 0.4.

**Text reconstruction:**

- `text_at_revision(tref, version, lang, revision)` -- Reconstructs text at a historical revision by loading current text and applying `revert_patch` diffs backwards using `diff_match_patch`. Walks from most recent change down to the target revision.

**Event logging (direct DB writes):**

- `record_index_deletion(title, uid)` -- Logs `"delete index"` events.
- `record_version_deletion(title, version, lang, uid)` -- Logs `"delete text"` events.
- `record_sheet_publication(sheet_id, uid)` / `delete_sheet_publication(sheet_id, user_id)` -- Logs and removes `"publish sheet"` events.

**Leaderboards:**

- `top_contributors(days=None)` -- Reads from pre-calculated `leaders_N` or `leaders_alltime` collections.
- `make_leaderboard(condition)` -- Computes leaderboards on the fly using `db.history.group()` with a JavaScript reducer. Assigns weighted scores: translations (SCT) get ~10x more points than raw adds; reviews get 15 points; links get 2.
- `make_leaderboard_condition(start, end, ref_regex, version, actions, api)` -- Builds the MongoDB condition dict for leaderboard queries.

## Non-Obvious Patterns

- **Segment-level granularity**: `modify_text` receives a potentially nested list (section-level text), but `_post_modify_changed_segments` recursively walks it to log history only at the segment level. This means a section save produces N history entries, one per changed segment.
- **Lock checking**: Only `modify_text` checks `version.status == "locked"`. The bulk and version-level functions do not, so callers must ensure authorization themselves.
- **Revert patches are stored but excluded from reads**: The `revert_patch` field (a diff-match-patch string) is stored on every text history entry but excluded from `get_activity` projections via `{"revert_patch": 0}`. It is only used by `text_at_revision`.
- **Leaderboard scoring uses server-side JavaScript**: `make_leaderboard` uses MongoDB's deprecated `group()` command with a JS `Code` reducer. This is a legacy pattern.
- **Count-after optimization**: Bulk operations set `count_after=False` per segment and call `count_segments()` once at the end for the whole index.

## Relationships

- **`sefaria.model`**: `tracker.py` calls `model.log_text`, `model.log_add`, `model.log_update`, `model.log_delete` (defined in `sefaria/model/history.py` -- the model-layer history, not to be confused with `sefaria/history.py`). Also uses `model.TextChunk`, `model.Version`, `model.IndexQueue`, `model.library`.
- **`sefaria.system.varnish`**: Cache invalidation on text changes when `USE_VARNISH` is enabled.
- **`sefaria.helper.marked_up_text_chunk_generator`**: Generates marked-up text chunks (e.g., auto-wrapped refs) via Celery when `CELERY_ENABLED`.
- **`sefaria.system.multiserver.coordinator`**: Publishes recount events to other servers in multi-server deployments.
- **`diff_match_patch`**: Used in `history.py` for applying revert patches to reconstruct historical text.
- **`db.history`**: Both modules read/write the same MongoDB `history` collection.

## Common Tasks

**Log a text edit (happens automatically through tracker):**
```python
from sefaria.tracker import modify_text
chunk = modify_text(user_id, oref, "Version Title", "en", "New text content")
```

**Bulk update many segments at once:**
```python
from sefaria.tracker import modify_bulk_text
text_map = {"Genesis 1:1": "New text", "Genesis 1:2": "More text"}
error_map = modify_bulk_text(user_id, version_obj, text_map)
```

**Query the activity feed:**
```python
from sefaria.history import get_activity, collapse_activity
activity = get_activity(query={"user": user_id}, page_size=50, page=1)
collapsed = collapse_activity(activity)
```

**Reconstruct text at a past revision:**
```python
from sefaria.history import text_at_revision
old_text = text_at_revision("Genesis 1:1", "Tanakh: The Holy Scriptures", "en", revision=42)
```

**Add/update a generic model object with tracking:**
```python
from sefaria.tracker import add
link = add(user_id, model.Link, {"refs": ["Gen.1.1", "Rashi on Gen.1.1"], "type": "commentary"})
```
