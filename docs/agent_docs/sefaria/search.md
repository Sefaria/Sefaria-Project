# Search
> Source: `sefaria/search.py`

## Purpose

Elasticsearch integration for Sefaria's full-text search. Manages two separate ES indices -- one for library texts and one for source sheets. Handles index creation, mapping definitions, document indexing (both individual and bulk), alias-based zero-downtime reindexing, and a MongoDB-backed queue for incremental updates. This module is called both from `sheets.py` (on sheet save) and from management commands for full reindexing.

## Key Functions/Classes

### Index Management

- **`create_index(index_name, type, force=False)`** -- Creates an ES index with custom analyzers (stemmed English via Snowball, exact English via ICU). Has a safety check: refuses to recreate an index that already contains documents unless `force=True`. Calls `put_text_mapping()` or `put_sheet_mapping()` depending on type.
- **`clear_index(index_name)`** -- Deletes an ES index. Handles race conditions where the index is deleted between the existence check and the delete call.
- **`get_new_and_current_index_names(type, debug=False)`** -- Returns a dict with `new`, `current`, and `alias` index names. Implements an A/B index swap pattern: two physical indices (`-a` and `-b`) alternate behind an alias. Whichever is currently aliased is `current`; the other is `new` (the target for the next reindex).

### Full Reindexing

- **`index_all(skip=0, debug=False)`** -- Top-level entry point for a complete reindex. Indexes texts, then sheets, then clears the index queue. Logs timing for each phase.
- **`index_all_of_type(type, skip, debug)`** -- Creates a new index, populates it, swaps the alias to point to the new index, and deletes the old one. Includes a 10-second countdown before starting (legacy behavior).
- **`index_all_of_type_by_index_name(type, index_name, skip, debug, force_recreate)`** -- Lower-level function that creates the index and dispatches to `TextIndexer.index_all()` or `index_public_sheets()`.

### Text Indexing

- **`TextIndexer`** -- Class (used as a namespace for classmethods) that handles indexing all text versions into ES.
  - **`index_all(index_name, debug, for_es, action)`** -- Fetches all versions, sorts by priority, groups by (title, language), and indexes each group. Uses `bulk()` from the `elasticsearch` library for batch inserts. Tracks failed and skipped versions.
  - **`index_version(version, tries, action)`** -- Indexes a single version by walking through its content tree via `version.walk_thru_contents()`. Retries on MongoDB `AutoReconnect` errors up to 200 times.
  - **`index_ref(index_name, oref, version_title, lang)`** -- Indexes a single ref. Slower than `index_version` but useful for incremental updates without loading everything into memory.
  - **`_cache_action(segment_str, tref, heTref, version)`** -- The callback passed to `walk_thru_contents()`. Builds the document and appends it to `_bulk_actions` for later batch insert.
  - **`make_text_index_document(...)`** -- Builds the ES document dict for a text segment. Includes ref, version info, categories, `pagesheetrank`, `comp_date`, and processed content in `exact` and `naive_lemmatizer` fields.
  - **`modify_text_in_doc(content)`** -- Cleans content for indexing: strips images, extracts footnotes into inline text, removes cantillation, strips HTML tags, removes parenthetical content.
  - **`create_version_priority_map()`** -- Builds a map of `(title, versionTitle, lang) -> (priority, categories)` by traversing the TOC tree. Priority determines which version ranks higher in search results.
  - **`excluded_from_search(version)`** -- Hardcoded list of version titles to skip during indexing.

### Sheet Indexing

- **`index_sheet(index_name, id)`** -- Indexes a single sheet. Validates all critical fields (title, summary, dates, owner data) upfront. Builds a doc with title, flattened content, owner info, topics, collections, and metadata. Returns `True`/`False` for success tracking.
- **`make_sheet_text(sheet, pud)`** -- Converts a sheet into plain text for the ES `content` field. Concatenates title, summary, author name, topics, and recursively flattened source content.
- **`source_text(source)`** -- Recursively extracts text from a source dict, handling `ref`, `comment`, `outsideText`, `outsideBiText`, `customTitle`, and nested `subsources`.
- **`index_public_sheets(index_name)`** -- Indexes all public sheets. Returns list of failed IDs.
- **`index_sheets_by_timestamp(timestamp)`** -- Indexes sheets modified after a given timestamp. Used for incremental updates.
- **`make_sheet_topics(sheet)`** -- Converts sheet topic slugs into `Topic` objects for extracting multilingual titles.

### Incremental Indexing (Queue)

- **`add_ref_to_index_queue(ref, version, lang)`** -- Adds a text ref to the MongoDB `index_queue` collection for deferred indexing.
- **`index_from_queue()`** -- Processes all items in the index queue, indexing each ref and deleting the queue record on success.
- **`add_recent_to_queue(ndays)`** -- Scans the activity log for text edits in the last N days and adds them to the queue.

### Deletion

- **`delete_text(oref, version, lang)`** -- Deletes a single text document from ES by constructed ID.
- **`delete_version(index, version, lang)`** -- Deletes all documents for a version (both section and segment refs, with special handling for Bavli).
- **`delete_sheet(index_name, id)`** -- Deletes a sheet document from ES.

### ES Mappings

- **`put_text_mapping(index_name)`** -- Defines field types for text documents. Key fields: `categories` and `index_title` as keywords, `exact` with the exact English analyzer, `naive_lemmatizer` with the stemmed analyzer, `pagesheetrank` as a non-indexed double, `comp_date` as a non-indexed integer.
- **`put_sheet_mapping(index_name)`** -- Defines field types for sheet documents. `content` uses stemmed English analyzer. Most metadata fields (`owner_name`, `tags`, `topics_en/he`, `collections`) are keywords for exact filtering.

### Utility

- **`make_text_doc_id(ref, version, lang)`** -- Constructs an ES document ID. Non-ASCII version titles are converted to a numeric hash via `unicode_number()` (acknowledged as a hack with potential collisions).
- **`get_search_categories(oref, categories)`** -- Resolves `searchRoot` overrides in the TOC tree. Some categories are remapped for search purposes (e.g., a text might appear under a different category in search than in the library).

## Non-Obvious Patterns

1. **A/B index swapping**: Two physical indices (`{name}-a` and `{name}-b`) alternate behind a single alias. `get_new_and_current_index_names()` determines which is active. During reindexing, the new index is built from scratch, then the alias is atomically swapped, and the old index is deleted. This provides zero-downtime reindexing.

2. **Separate indices for text vs sheets**: Texts and sheets have completely different ES mappings and are stored in separate indices (`SEARCH_INDEX_NAME_TEXT` and `SEARCH_INDEX_NAME_SHEET` from settings). They are reindexed independently.

3. **Version priority**: Not all versions of a text are equal in search. `create_version_priority_map()` traverses the TOC to assign priority numbers. Lower priority = more important. This affects search result ranking via the `version_priority` field.

4. **Bulk indexing pattern**: `TextIndexer` accumulates documents in `_bulk_actions` per index (title, language group), then flushes them via `elasticsearch.helpers.bulk()`. This is much faster than individual inserts but means documents are batched by their parent index.

5. **Footnote extraction**: Before indexing, footnotes are extracted from their HTML markup (sup + i tags) and appended as plain text to the content. This makes footnote content searchable.

6. **`pagesheetrank`**: A pre-computed score stored in `RefData` that influences search ranking. Similar in concept to PageRank but based on how often a ref appears on sheets.

7. **Queue-based incremental indexing**: For text changes that happen during normal operation, refs are added to a MongoDB `index_queue` collection and processed later by `index_from_queue()`. This decouples the write path from ES availability. Sheet indexing, by contrast, is done synchronously on save (controlled by `SEARCH_INDEX_ON_SAVE`).

8. **Retry logic**: MongoDB `AutoReconnect` errors are retried up to 200 times with 5-second sleeps. This is defensive against transient connection issues during long-running reindex operations.

9. **`searchRoot` category remapping**: Some categories in the TOC tree have a `searchRoot` attribute that overrides which category path is stored in the ES document. This allows texts to appear under different categories in search results than in the library navigation.

## Relationships

- **`sefaria.sheets`**: Called by `sheets.save_sheet()` for real-time sheet indexing/deletion on publication changes. The functions `index_sheet()`, `delete_sheet()`, and `get_new_and_current_index_names()` are the primary interface used by sheets.
- **`sefaria.model.text`**: `TextIndexer` uses `Version`, `VersionSet`, `Ref`, `TextChunk`, `AbstractTextRecord` for traversing and extracting text content. `walk_thru_contents()` on a `Version` object is the core iteration mechanism.
- **`sefaria.model.topic`**: `Topic.init()` is used to resolve topic slugs to objects for extracting multilingual titles during sheet indexing.
- **`sefaria.model.collection`**: `CollectionSet` is queried during sheet indexing to include collection names in the search document.
- **`sefaria.model.user_profile`**: `public_user_data()` and `user_link()` provide author information for sheet search documents.
- **`sefaria.model.queue`**: `IndexQueue` model is used for the deferred text indexing queue.
- **`sefaria.helper.search`**: Provides `get_elasticsearch_client()` for ES connection setup.
- **`sefaria.settings`**: `SEARCH_INDEX_NAME_TEXT` and `SEARCH_INDEX_NAME_SHEET` define base index names.
- **`sefaria.system.database`**: Direct MongoDB access for `db.sheets`, `db.index_queue`, `db.history`.
- **`sefaria.utils.hebrew`**: `strip_cantillation()` is used during text content preparation.

## Common Tasks

### Trigger a full reindex
Call `index_all()`. This will create new indices, populate them, swap aliases, and clean up old indices. Expect it to take a long time for texts (walks every version of every text).

### Debug why a text isn't appearing in search
1. Check if the version is in `excluded_from_search()`.
2. Check if `(title, versionTitle, lang)` appears in the version priority map (versions not in the TOC are silently skipped).
3. Check that the content is non-empty after `modify_text_in_doc()` processing.
4. Check `_failed_versions` / `_skipped_versions` on `TextIndexer` after a reindex.

### Debug why a sheet isn't appearing in search
1. Sheet must have `status: "public"`.
2. `index_sheet()` validates: title, summary, datePublished, dateCreated, dateModified, owner, and owner profile data must all be non-null.
3. Check `SEARCH_INDEX_ON_SAVE` setting.

### Add a new field to the search index
1. Add the field to the appropriate mapping function (`put_text_mapping` or `put_sheet_mapping`).
2. Add the field to the document construction (`make_text_index_document` or the doc dict in `index_sheet`).
3. A full reindex is required for the new field to appear on existing documents.

### Incrementally index recent text changes
Call `add_recent_to_queue(ndays)` followed by `index_from_queue()`. Or for sheets, use `index_sheets_by_timestamp(timestamp)`.
