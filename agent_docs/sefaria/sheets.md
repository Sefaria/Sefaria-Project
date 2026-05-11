# Sheets
> Source: `sefaria/sheets.py`

## Purpose

Backend for Sefaria Source Sheets -- user-created documents that combine references to traditional texts with original commentary, outside text, and media. Sheets are stored directly in MongoDB (`db.sheets`) and are one of the few core entities that use raw MongoDB operations rather than the `AbstractMongoRecord` model layer. The module handles CRUD, publication lifecycle, topic tagging, collection membership, search indexing triggers, notifications, and LLM-based sheet scoring.

## Key Functions/Classes

### CRUD

- **`get_sheet(id)`** -- Fetches a sheet by numeric id. Annotates with topic language data and public collection membership before returning. Converts `_id` to string for JSON serialization.
- **`get_sheet_for_panel(id)`** -- Extended version of `get_sheet` used by the frontend panel. Adds owner profile data, via-owner info, assigner info, collection images, and annotates user links in sources. Raises `Http404` for quarantined spam sheets.
- **`save_sheet(sheet, user_id)`** -- The central save function (~170 lines). Handles both create and update:
  - **Optimistic concurrency**: compares `lastModified` against `dateModified` in DB; rejects saves if the sheet was modified since the client last fetched it (returns `{"error": "Sheet updated.", "rebuild": True}`).
  - **Protected fields**: `views`, `owner`, `likes`, `dateCreated`, `datePublished` cannot be overwritten by the client.
  - **New sheets**: assigns a unique auto-incrementing `id` via `next_sheet_id()` with retry on `DuplicateKeyError`.
  - **Publication**: when status changes to `"public"`, records publication history, broadcasts notifications to followers, triggers LLM scoring via `generate_and_save_sheet_scoring()`.
  - **Unpublication**: deletes from search index, removes publication history, deletes publish notifications.
  - **Topic diffing**: compares old vs new topics and calls `update_sheet_topics()` / `update_sheet_topic_links()`.
  - **Search indexing**: if `SEARCH_INDEX_ON_SAVE` is enabled, indexes/deletes from Elasticsearch on save.
  - **Ref extraction**: populates `includedRefs` and `expandedRefs` from sources.
  - **Media duplication**: when creating a sheet from a copy, duplicates Google Cloud Storage media files so each sheet owns its own copy.
- **`add_source_to_sheet(id, source)`** -- Appends a source dict to an existing sheet's sources list. Assigns a node id.
- **`add_ref_to_sheet(id, ref, request)`** -- Simpler version that adds just a ref string. Requires the requesting user to be the sheet owner.
- **`change_sheet_owner(sheet_id, new_owner_id)`** -- Transfers ownership. Strips cached owner profile fields that would become stale.

### Querying

- **`user_sheets(user_id, sort_by, limit, skip, private)`** -- Returns sheets for a user. If `private=True`, annotates with all collections the user has added each sheet to; otherwise annotates with the displayed collection only.
- **`public_sheets(sort, limit, skip, lang, filtered)`** -- Returns public sheets. `filtered=True` limits to sheets that contain at least one textual ref source.
- **`get_sheets_for_ref(tref, uid, in_collection)`** -- Core function for the sidebar: returns all sheets containing a given ref. Uses `expandedRefs` index for lookup. Calculates `combined_score` via LLM scoring data (title interest, ref relevance, creativity). Batch-loads user profiles for performance.
- **`get_sheets_by_topic(topic, public, proj, limit, page)`** -- Fetches sheets by topic slug with pagination.
- **`sheet_list(query, sort, skip, limit)`** -- Low-level list query that returns only display-relevant fields via projection.

### Topics

- **`update_sheet_topics(sheet_id, topics, old_topics)`** -- Normalizes topic titles, finds or creates Topic objects for missing slugs, deduplicates, and persists. Then calls `update_sheet_topic_links`.
- **`update_sheet_topic_links(sheet_id, new_topics, old_topics)`** -- Diffs old/new topics and creates/deletes `RefTopicLink` records. Links are only created for public sheets. The "ref" for a sheet topic link is the string `"Sheet {id}"`.
- **`create_topic_from_title(title)`** -- Creates a new `Topic` document from a user-typed string. Detects Hebrew vs English for the language field.
- **`choose_existing_topic_for_title(title)`** -- Finds the best existing topic for a given title string, preferring primary title matches and topics with more sources.
- **`add_langs_to_topics(topic_list)`** -- Enriches topic dicts with `en` and `he` title fields from the topic cache. Contains a defensive check for topics missing the `slug` field (a known frontend bug).
- **`sheet_topics_counts(query, sort_by)`** -- Aggregation pipeline that returns topic slugs with counts for sheets matching a query.
- **`trending_topics(days, ntags)`** -- Returns topics trending in the last N days, filtered to require multiple distinct authors.

### Collections

- **`add_sheet_to_collection(sheet_id, collection, is_sheet_owner)`** -- Adds sheet id to a collection's sheets list. If the owner adds it, sets `displayedCollection` on the sheet.
- **`annotate_user_collections(sheets, user_id)`** -- Adds a `collections` field to each sheet listing which collections contain it.
- **`annotate_displayed_collections(sheets)`** -- Adds `displayedCollectionName` for sheets that have a `displayedCollection`.
- **`annotate_sheets_with_collections(sheets)`** -- Similar but for public/listed collections, used in different contexts.

### Social

- **`add_like_to_sheet(sheet_id, uid)`** -- Adds a like and creates a notification for the sheet owner.
- **`remove_like_from_sheet(sheet_id, uid)`** -- Removes a like (no notification cleanup).
- **`broadcast_sheet_publication(publisher_id, sheet_id)`** -- Creates notifications for all followers of the publisher.

### LLM Scoring

- **`calculate_combined_score(sheets, ref)`** -- Blends three LLM-derived scores (title interest, ref relevance, creativity) with configurable weights to produce a `combined_score` for ranking sheets in the sidebar. Uses 5th-95th percentile normalization for ref scores.
- Scoring data lives in `sheet.llm_scoring.sheet` with legacy fallback to top-level fields.

### Sheet Class

- **`Sheet(AbstractMongoRecord)`** -- An ORM-style class that exists as an alternative interface but is **not used for most operations**. The docstring explicitly warns that it does not implement the full save logic of `save_sheet()`. Should only be used for reads or safe, side-effect-free writes.
- **`SheetSet(AbstractMongoSet)`** -- Companion set class.

## Non-Obvious Patterns

1. **Raw MongoDB, not the model layer**: Unlike most Sefaria entities, sheets use direct `db.sheets` calls rather than `AbstractMongoRecord.save()`. The `Sheet` class exists but is intentionally not the primary interface. This means save-time side effects (search indexing, notifications, topic link management) live in `save_sheet()` rather than in model hooks.

2. **Optimistic concurrency control**: `save_sheet` compares `lastModified` (sent by client) to `dateModified` (in DB). If they differ, the save is rejected. This prevents one user's edits from silently overwriting another's.

3. **Node system**: Each source in a sheet has a unique `node` integer id. `rebuild_sheet_nodes()` repairs sheets with missing, null, or duplicate node ids. The `nextNode` counter is stored on the sheet document itself.

4. **`includedRefs` / `expandedRefs`**: On every save, all refs from sources are extracted into `includedRefs`, and then expanded (e.g., a range ref becomes individual segment refs) into `expandedRefs`. The `expandedRefs` field is indexed in MongoDB and is how `get_sheets_for_ref()` efficiently finds sheets for a given text reference.

5. **Topic links as RefTopicLinks**: When a sheet is tagged with a topic, a `RefTopicLink` is created with ref `"Sheet {id}"`. This integrates sheets into the same topic graph used for texts. Links are only created for public sheets and are cleaned up on unpublication.

6. **`displayedCollection`**: A sheet can appear in multiple collections but only "highlights" one via `displayedCollection`. This determines which collection name/image appears in sheet listings.

7. **`status` values**: Sheets use string statuses `"public"` and `"unlisted"`. New sheets default to `"unlisted"`.

8. **`SEARCH_INDEX_ON_SAVE`**: A settings flag that controls whether Elasticsearch is updated synchronously on save. This is typically `True` in production but may be `False` in development.

## Relationships

- **MongoDB**: Reads/writes directly to `db.sheets` collection. No Mongoose-style schema enforcement beyond the `Sheet` class's attr lists.
- **`sefaria.search`**: Calls `search.index_sheet()` and `search.delete_sheet()` on publication/unpublication. Uses `search.get_new_and_current_index_names()` to find the active ES index.
- **`sefaria.model.topic`**: Creates `Topic` objects and `RefTopicLink` records to connect sheets to the topic graph.
- **`sefaria.model.collection`**: Reads `Collection`/`CollectionSet` to annotate sheets with collection membership.
- **`sefaria.model.notification`**: Creates notifications for likes and publication broadcasts.
- **`sefaria.model.following`**: Uses `FollowersSet` to find who to notify on publication.
- **`sefaria.model.user_profile`**: Uses `public_user_data()`, `user_link()`, `UserProfile` for author display info.
- **`sefaria.history`**: Calls `record_sheet_publication()` / `delete_sheet_publication()` for publication history.
- **`sefaria.helper.llm.tasks.sheet_scoring`**: Triggers `generate_and_save_sheet_scoring()` on publication and save of public sheets.
- **`sefaria.google_storage_manager`**: Manages media file duplication and deletion for sheet images.

## Common Tasks

### Add a new field to sheets
1. Add to `Sheet.optional_attrs` (or `required_attrs` if mandatory).
2. Handle in `save_sheet()` -- decide if it's a protected field (can't be set from outside) or user-settable.
3. If it should be in listings, add to the projection in `sheet_list()`.

### Debug why a sheet isn't appearing in search
1. Check `sheet["status"]` is `"public"`.
2. Check `SEARCH_INDEX_ON_SAVE` is `True`.
3. Look at the `try/except` around `search.index_sheet()` in `save_sheet()` -- errors are logged but swallowed.
4. Check `search.index_sheet()` in `search.py` for validation failures (missing title, summary, owner data, dates).

### Understand how sheets appear in the text sidebar
Follow `get_sheets_for_ref(tref)` -- it queries `expandedRefs`, calculates combined scores from LLM data, and returns annotated sheet data. The `expandedRefs` field is populated by `save_sheet()` on every save.

### Change how sheet-topic linking works
Look at `update_sheet_topic_links()` which creates/deletes `RefTopicLink` records. The ref format for sheets is `"Sheet {id}"`. Links are only created for public sheets.
