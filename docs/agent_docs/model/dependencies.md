# Dependencies (Cross-Model Event Wiring)
> Source: `sefaria/model/dependencies.py`

## Purpose
Registers all cross-model side effects using the pub/sub system defined in `abstract.py`. When a model is saved, deleted, or has an attribute changed, callbacks registered here fire synchronously. This is the **single source of truth** for understanding what happens when you modify any model.

## How It Works
Uses `subscribe(callback, ModelClass, action, attribute=None)` from `abstract.py`. Actions are `"save"`, `"delete"`, or `"attributeChange"`. The `cascade()` and `cascade_delete()` helpers generate callbacks that update/delete related records by field name.

All callbacks fire **synchronously** during `save()` or `delete()` — there is no async queue. A single Index title change triggers 14 callbacks in sequence.

## Subscription Map

### Index Save/Create
| Callback | Effect |
|----------|--------|
| `text.process_index_change_in_core_cache` | Updates Library's in-memory index cache |
| `version_state.create_version_state_on_index_creation` | Creates VersionState record for new Index |
| `text.process_index_change_in_toc` | Rebuilds TOC tree |
| `place.process_index_place_change` | Triggered on `compPlace` or `pubPlace` attribute change |

### Index Title Change (14 subscribers — the biggest cascade)
| Callback | Effect |
|----------|--------|
| `text.process_index_title_change_in_core_cache` | Clears old title from Library caches, rebuilds maps |
| `text.process_index_title_change_in_versions` | Updates `title` field in all Version records |
| `version_state.process_index_title_change_in_version_state` | Updates VersionState title |
| `link.process_index_title_change_in_links` | Updates refs in all Link records containing old title |
| `note.process_index_title_change_in_notes` | Updates refs in Note records |
| `history.process_index_title_change_in_history` | Updates refs in History records |
| `text.process_index_title_change_in_dependant_records` | Updates dependent Index records (commentaries) |
| `text.process_index_title_change_in_sheets` | Updates refs in source sheets |
| `cascade(GlobalNotificationSet, "content.index")` | Updates notifications referencing the index |
| `ref_data.process_index_title_change_in_ref_data` | Updates RefData records |
| `user_profile.process_index_title_change_in_user_history` | Updates UserHistory records |
| `topic.process_index_title_change_in_topic_links` | Updates RefTopicLink records |
| `manuscript.process_index_title_change_in_manuscript_links` | Updates ManuscriptPage records |
| `marked_up_text_chunk.process_index_title_change` | Updates MarkedUpTextChunk records |

### Index Delete (10 subscribers)
Clears cache, deletes VersionState, Links, TopicLinks, Notes, Versions, TOC entry, GlobalNotifications, RefData, and MarkedUpTextChunks.

### Version Title Change
- `history.process_version_title_change_in_history` — Updates History records
- `process_version_title_change_in_search` — Re-indexes in Elasticsearch (if `SEARCH_INDEX_ON_SAVE` is True)
- `cascade(GlobalNotificationSet, "content.version")` — Updates notifications

### Version Delete
- Deletes related GlobalNotifications

### Note Delete
- `layer.process_note_deletion_in_layer` — Removes note from any Layer

### Topic Delete / Change
- `topic.process_topic_delete` — Cleans up IntraTopicLinks and RefTopicLinks (for both Topic and AuthorTopic)
- `topic.process_topic_description_change` — On description change
- `marked_up_text_chunk.process_topic_slug_change` — Updates MarkedUpTextChunk on slug change

### Term Save/Delete
- `text.reset_simple_term_mapping` — Rebuilds Library's term mapping

### TermScheme Name Change
- `cascade(TermSet, "scheme")` — Updates all Terms in that scheme

### TimePeriod Symbol Change
- Cascades to `PersonTopicSet` properties (`era.value`, `generation.value`)

### Garden Key Change/Delete
- Cascades to GardenStopSet and GardenStopRelationSet

### GlobalNotification Delete
- Cascades delete to related NotificationSet records

### Collection Slug Change/Delete
- `collection.process_collection_slug_change_in_sheets` — Updates sheets
- `collection.process_collection_delete_in_sheets` — Removes collection from sheets
- Cascades delete to NotificationSet

### Category Path Change/Save
- `category.process_category_path_change` — Updates child categories
- `marked_up_text_chunk.process_category_path_change` — Updates MarkedUpTextChunk records
- `text.rebuild_library_after_category_change` — Full Library rebuild on any category save

### Manuscript Slug Change/Delete
- `manuscript.process_slug_change_in_manuscript` — Updates ManuscriptPages
- `manuscript.process_manucript_deletion` — Deletes ManuscriptPages

## Non-Obvious Patterns
- **Order matters**: Callbacks fire in registration order. Cache clearing is registered first for Index operations so subsequent callbacks see updated state.
- **Category save triggers full Library rebuild**: Even a minor category edit causes `rebuild_library_after_category_change`, which is expensive.
- **No rollback**: If callback #5 of 14 fails, callbacks 1-4 have already committed. There is no transaction wrapping.
- **ES indexing is conditional**: `process_version_title_change_in_search` checks `SEARCH_INDEX_ON_SAVE` setting — disabled in dev environments.
- **Known TODOs in the file**: Term name changes don't fully cascade to Index/Category nodes yet (line 83-85). Note/review cascades are incomplete (line 130).

## Relationships
- **Imports from**: abstract, link, note, history, schema, text, layer, version_state, timeperiod, garden, notification, collection, library, category, ref_data, user_profile, manuscript, topic, place, marked_up_text_chunk
- **Imported by**: `__init__.py` (loaded last, after all models)

## Common Tasks
- **To understand what happens when you save/delete a model**: Search this file for the model class name
- **To add a new cascade**: Use `subscribe(callback, ModelClass, action, attribute)` — add it in the relevant section
- **To temporarily skip cascades**: Pass `override_dependencies=True` to `save()` (use with extreme caution)
