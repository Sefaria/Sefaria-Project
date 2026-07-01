# Utilities
> Sources: `sefaria/model/lock.py`, `sefaria/model/queue.py`, `sefaria/model/history.py`, `sefaria/model/ref_data.py`, `sefaria/model/text_request_adapter.py`

## Purpose
These are infrastructure and utility models that support the core text system. They handle edit locking, indexing queues, change tracking (history), ref-level ranking data, and API response assembly. None define primary domain objects; instead they provide operational plumbing around `Index`, `Version`, and `Ref`.

## lock.py
MongoDB collection: `locks`

### Lock / LockSet
Segment-level edit locks that prevent concurrent editing of the same text segment. A lock records `ref`, `lang`, `version`, `user`, and `time`.

**Limitation:** Locks only work at the segment level. Locking a section ref (e.g., "Genesis 4") will break.

### Module-level helpers
| Function | Purpose |
|---|---|
| `set_lock(ref, lang, version, user)` | Creates a lock. User `0` = anonymous. |
| `release_lock(ref, lang, version)` | Deletes matching lock(s). |
| `check_lock(ref, lang, version)` | Returns `True` if a current lock exists. |
| `expire_locks()` | Deletes all locks older than `LOCK_TIMEOUT` (300 seconds). |

## queue.py
MongoDB collection: `index_queue`

### IndexQueue / IndexQueueSet
A deduplicating queue for indexing tasks. Required attrs: `lang`, `type`, `version`, `ref`.

`save()` is overridden to check for duplicates before inserting -- if a record with identical required attrs already exists, the save is silently aborted with a warning log.

## history.py
MongoDB collection: `history`

### History / HistorySet
An audit log of all content changes. Tracks text edits (with revert patches via `diff_match_patch`), link/note/index CRUD, sheet publishes, and reviews.

Required attrs: `rev_type`, `user`, `date`. The `rev_type` field uses strings like `"add text"`, `"edit link"`, `"delete note"`, `"publish sheet"`, `"review"`, etc.

`_sanitize()` is intentionally a no-op -- history records are assumed to contain already-clean text.

### Logging functions
| Function | Purpose |
|---|---|
| `log_text(user, action, oref, lang, vtitle, old_text, new_text)` | Logs a text edit. Recursively descends into list-type texts to log each segment individually. Generates a backward revert patch and a forward diff HTML. |
| `log_add(user, klass, new_dict)` | Logs creation of a link, note, or index. |
| `log_update(user, klass, old_dict, new_dict)` | Logs an update. |
| `log_delete(user, klass, old_dict)` | Logs a deletion. |
| `_log_general(...)` | Shared implementation. Skips private notes entirely. Adds `method` for links and `title` for indexes. |

### Dependency cascade functions
- **`process_index_title_change_in_history(indx, old, new)`** -- When an Index title changes, rewrites `ref`, `new.refs` (links), `new.ref` (notes), and `title` across all matching History records.
- **`process_version_title_change_in_history(ver, old, new)`** -- When a Version title changes, bulk-updates the `version` field on matching history records via a direct `db.history.update()` call.

## ref_data.py
MongoDB collection: `ref_data`

### RefData / RefDataSet
Stores per-segment ranking data (`pagesheetrank`) used for ordering and relevance.

| Method | Purpose |
|---|---|
| `RefData.inverse_pagesheetrank()` | Returns a value inversely proportional to pagesheetrank on a log scale. Caps at `PR_MAX_CUTOFF = 70000`. |
| `RefDataSet.from_ref(ref)` | Class method; loads RefData for all segment refs under the given ref. |
| `RefDataSet.top(n)` | Returns the top N records by pagesheetrank. |
| `RefDataSet.nth_ref(n)` / `top_ref()` | Returns the Ref of the nth-ranked (or top-ranked) segment. |

Default constants: `DEFAULT_PAGERANK = 1.0`, `DEFAULT_SHEETRANK = 0.04`, `DEFAULT_PAGESHEETRANK = 0.04`.

### Dependency cascade functions
- **`process_index_title_change_in_ref_data(indx, old, new)`** -- Renames refs in all matching RefData records when an Index title changes.
- **`process_index_delete_in_ref_data(indx)`** -- Deletes all RefData records whose ref matches the deleted Index.

## text_request_adapter.py

### TextRequestAdapter
Assembles the JSON response for the `api/v3/text` endpoint (and SSR). This is the main orchestrator that turns a `Ref` + version parameters into a complete client-facing payload.

**Constructor params:** `oref` (Ref), `versions_params` (list of `[lang, vtitle]` pairs), `fill_in_missing_segments` (bool), `return_format` (string), `debug_mode` (optional).

**Special lang constants:** `ALL`, `PRIMARY`, `SOURCE`, `TRANSLATION` -- these are virtual language selectors, not actual language codes.

**Key method: `get_versions_for_query()`** -- Entry point. Calls the private methods in order:
1. Resolves `default_child_ref()` for complex texts.
2. `_append_required_versions()` -- Selects versions matching lang/vtitle params. When no specific vtitle is given (and not `ALL`), picks the highest-priority version per language. Deduplicates across version params.
3. `_add_ref_data_to_return_obj()` -- Adds navigation metadata (sections, next/prev refs, spanning info).
4. `_add_index_data_to_return_obj()` -- Adds index metadata (categories, alt structs, collective title).
5. `_add_node_data_to_return_obj()` -- Adds schema node metadata (depth, sectionNames, addressTypes, lengths).
6. `_add_linker_output()` -- Only in `debug_mode="linker"`; loads `LinkerOutput` records per segment.
7. `_format_text()` -- Applies text transformations based on `return_format`:
   - `wrap_all_entities`: applies `MarkedUpTextChunk` spans (inline citations).
   - `text_only`: strips iTags, HTML, and collapses whitespace.
   - `strip_only_footnotes`: strips iTags and collapses whitespace (keeps HTML).
   - `default`: no transformation.

## Non-Obvious Patterns
- **History's `log_text` is recursive:** For list-type (section-level) text, it walks down to individual segments before logging, producing one History record per segment rather than one per section.
- **IndexQueue deduplication is in `save()`:** It silently drops duplicates rather than raising or upserting, so callers can fire-and-forget.
- **`process_version_title_change_in_history` bypasses the ORM:** It uses `db.history.update()` directly for bulk efficiency, unlike the Index title change handler which loads and saves each record individually.
- **TextRequestAdapter mutates `self.oref`:** The `get_versions_for_query()` method reassigns `self.oref` to `self.oref.default_child_ref()`, so downstream methods see the resolved ref.
- **Lock expiry is passive:** `expire_locks()` must be called explicitly (e.g., by a cron job or workflow); there is no TTL index on the MongoDB collection.

## Relationships
- **Lock** is used by `workflow.py` and `reader.views.translation_flow` to manage concurrent editing.
- **History** is populated by save/delete hooks in `text.py`, `link.py`, and `note.py` via the `log_*` functions.
- **RefData** is consumed by search ranking and topic-model code to weight segment importance.
- **TextRequestAdapter** depends on `Ref`, `Version`, `VersionSet`, `TextRange`, `JaggedTextArray`, `MarkedUpTextChunk`, and `LinkerOutput`.

### Dependency subscriptions
| Event | Handler | Effect |
|---|---|---|
| Index title change | `process_index_title_change_in_history` | Updates `ref`, `new.refs`, `new.ref`, `title` in History records |
| Index title change | `process_index_title_change_in_ref_data` | Renames refs in RefData records |
| Index delete | `process_index_delete_in_ref_data` | Deletes matching RefData records |
| Version title change | `process_version_title_change_in_history` | Bulk-updates `version` field in History records |

## Common Tasks

### Check if a segment is locked
```python
from sefaria.model.lock import check_lock
is_locked = check_lock("Genesis 1:1", "en", "Tanakh: The Holy Scriptures")
```

### Log a text edit
```python
from sefaria.model.history import log_text
log_text(user_id, "edit", oref, "en", "Version Title", old_text, new_text, method="API")
```

### Get top-ranked segments for a ref
```python
from sefaria.model.ref_data import RefDataSet
top_refs = RefDataSet.from_ref(Ref("Genesis")).top(10)
```

### Fetch text for the API
```python
from sefaria.model.text_request_adapter import TextRequestAdapter
adapter = TextRequestAdapter(oref, [["english", "all"]], fill_in_missing_segments=True, return_format="default")
result = adapter.get_versions_for_query()
```
