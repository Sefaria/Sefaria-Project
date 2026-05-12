# abstract.py
> Source: `sefaria/model/abstract.py`

## Purpose
Defines the base ORM layer for all Sefaria MongoDB models. Every persistent model inherits from `AbstractMongoRecord` (single document) or uses `AbstractMongoSet` (collection queries). Also contains the pub/sub dependency/notification system that propagates changes across models (e.g., when an Index title changes, all linked records update).

## Key Classes

### AbstractMongoRecord
- **Inherits**: `object`
- **Collection**: Set by subclass via `collection` class attribute
- **Role**: Base class for all single-document MongoDB models. Handles CRUD, validation, sanitization, and change notification.
- **Key class attributes**:
  - `collection` -- MongoDB collection name (string). `None` means the class is abstract/not directly persisted.
  - `criteria_field` -- Primary lookup field, defaults to `"_id"`. Subclasses like `Index` use `"title"` instead.
  - `criteria_override_field` -- When a primary key is being *renamed*, this field carries the old value (e.g., `"oldTitle"` on Index). Enables the system to find the existing record despite the key change.
  - `required_attrs` / `optional_attrs` -- Whitelist of fields. Together with `id_field`, these define what gets saved to Mongo and validated. **Any key loaded from Mongo that isn't in this whitelist triggers an assertion error.**
  - `attr_schemas` -- Cerberus validation schemas for individual attributes. The root level uses `allow_unknown=True` (so you don't need to schema-ify every field), but nested dicts default to `allow_unknown=False`.
  - `track_pkeys` / `pkeys` -- When `track_pkeys = True`, the original values of fields listed in `pkeys` are snapshotted on load. On save, if any differ, an `"attributeChange"` notification fires. **If tracking is on but not all pkeys have been captured, save aborts with an exception** -- this is a safety rail against partial tracking.
  - `ALLOWED_TAGS` / `ALLOWED_ATTRS` -- Bleach whitelist for `_sanitize()`. Extends bleach defaults with `<p>` and `<br>`.

- **Save lifecycle** (in order):
  1. `_normalize()` -- Transform data into canonical form (override in subclass)
  2. `_validate()` -- Check required attrs exist; run Cerberus validation against `attr_schemas`
  3. `_sanitize()` -- Bleach-clean all string attrs in `required_attrs + optional_attrs`
  4. `_pre_save()` -- Last hook before write (override in subclass)
  5. MongoDB write (`insert_one` for new, `replace_one` with upsert for existing)
  6. `notify(self, "attributeChange", ...)` for each changed pkey (if tracking)
  7. `notify(self, "save", ...)`

- **Key methods**:
  - `load(query, proj=None)` -- Returns `self` if found, **`None` if not found** (not an exception). This is the standard existence-check pattern: `if obj.load({...}):`.
  - `load_from_dict(d, is_init=False)` -- Bulk `setattr` from a dict. When `is_init=True` and the record exists in DB, snapshots pkey values for change tracking. Called both at construction and for updates.
  - `save(override_dependencies=False)` -- Full lifecycle save. `override_dependencies=True` suppresses all notifications (use sparingly, e.g., bulk migrations).
  - `delete(force=False, override_dependencies=False)` -- Emits `"delete"` notification before removal. `can_delete()` is checked first; `force=True` bypasses it.
  - `is_new()` -- Returns `True` if `_id` is not set (not yet persisted).
  - `contents(**kwargs)` -- Returns a portable dict (no `_id` by default). Pass `with_string_id=True` to include `_id` as a string. Subclasses extend this to add derived/computed fields.
  - `copy()` -- Deep-copies saveable attrs (minus `_id`) into a new instance of the same class.
  - `is_key_changed(key)` -- Check if a tracked pkey has changed since load. Asserts that tracking is enabled for that key.
  - `_init_defaults()` -- Override to set default values before `load_from_dict` runs.
  - `_set_derived_attributes()` -- Override to compute values after `load_from_dict`. Called on every load, not just init.

- **Gotchas**:
  - `__eq__` compares all saveable attrs, not identity or `_id`. Two different records with identical content are "equal".
  - `_sanitize` only bleaches top-level string attributes in the required/optional list. Nested strings, lists of strings, etc. are NOT sanitized automatically.
  - `load()` mutates `self` in place and returns `self`. It does NOT return a new object.
  - The `replace_one` on update uses `upsert=True` but then **raises an exception** if an upsert actually happened (meaning the `_id` was somehow lost). This is a corruption detector, not intentional upsert behavior.

### AbstractMongoSet
- **Inherits**: `collections.abc.Iterable`
- **Collection**: Determined by `recordClass.collection`
- **Role**: Lazy-loading query wrapper over a MongoDB collection. Does NOT hit the DB until you iterate, index, or call `count()`/`__len__()`.
- **Key class attributes**:
  - `recordClass` -- The `AbstractMongoRecord` subclass this set wraps.

- **Key methods**:
  - `__init__(query, page, limit, sort, proj, skip, hint, record_kwargs)` -- Constructs the cursor immediately but does NOT read records. `page * limit` is used for skip unless explicit `skip` is passed. `record_kwargs` are forwarded to the record constructor.
  - `count()` -- If records have been read, returns cached length. Otherwise issues a `count_documents` query (cheaper than reading all records).
  - `distinct(field)` -- Delegates to cursor's `distinct()`. **Works before records are read** (hits Mongo directly).
  - `update(attrs)` -- Loads all records, updates each with `load_from_dict(attrs).save()`. Triggers all notifications per record.
  - `delete(force=False, bulk_delete=False)` -- `bulk_delete=True` uses `delete_many` (fast, **skips all notifications/dependencies**). `False` iterates and calls `delete()` on each record (safe, triggers notifications).
  - `remove(condition_callback)` -- In-memory filter (removes matching records from the loaded set, does NOT delete from DB).
  - `contents(**kwargs)` -- Returns list of `record.contents()` dicts.

- **Gotchas**:
  - `__len__()` triggers a full read if records haven't been loaded. Use `count()` if you just need the number without loading all records into memory.
  - After `_read_records()`, the cursor is exhausted. The records list is cached in `self.records`.
  - `record_kwargs` passed to the set constructor get forwarded to each record's `__init__`. Useful for classes that need extra context at construction time (e.g., `DictionaryEntry` subclasses).

### SluggedAbstractMongoRecord
- **Inherits**: `AbstractMongoRecord` (with `SluggedAbstractMongoRecordMeta` metaclass)
- **Collection**: Set by subclass
- **Role**: Adds slug management for models that need URL-friendly unique identifiers (Topics, Collections, Manuscripts, etc.).
- **Key class attributes**:
  - `slug_fields` -- `List[str]` of field names that are slugs. Usually `["slug"]` but can be multiple.
  - `cacheable` -- If `True`, `init()` caches instances by slug in a class-level `_init_cache` dict.

- **Key methods**:
  - `init(slug, slug_field_idx=None)` -- Class method. Loads by slug. Uses cache if `cacheable=True`. **Returns `None` if not found** (same as `load()`).
  - `normalize_slug_field(slug_field)` -- Deduplicates by appending incrementing numbers (`my-slug`, `my-slug1`, `my-slug2`...). Excludes self by `_id` so re-saving doesn't increment your own slug.
  - `normalize_slug(slug)` -- Static. Lowercases, replaces spaces/slashes with hyphens, strips non-alphanumeric (keeps parens for topic disambiguation and Hebrew chars).
  - `validate_slug_exists(slug, slug_field_idx)` -- Raises `SluggedMongoRecordMissingError` if slug doesn't resolve.

- **Gotchas**:
  - Slug normalization runs in `_normalize()`, so it happens on every save. If you set a slug and save, it may be silently modified (lowercased, deduped).
  - The metaclass (`SluggedAbstractMongoRecordMeta`) adds `_init_cache` as a per-class dict. Each subclass gets its own cache.
  - `cacheable` caches are never invalidated automatically. Stale data risk in long-running processes.

### Cloneable
- **Inherits**: nothing
- **Role**: Mixin for value objects. `clone(**kwargs)` returns a new instance with selectively overridden attributes via `__dict__` merge.

## Non-Obvious Patterns

- **`load()` returns `None` on miss, not an exception.** This is the idiomatic existence check throughout the codebase: `if MyRecord().load(query):`. The loaded object IS the truthiness check.
- **`save()` with `override_dependencies=True` is the escape hatch for bulk operations.** Without it, saving 1000 records fires 1000+ cascading updates. Used in migrations and imports.
- **`_saveable_attr_keys()` is the security boundary.** Only `required_attrs + optional_attrs + [id_field]` are persisted. Any other instance attributes (prefixed with `_` by convention) are transient.
- **Cerberus validation is opt-in per field.** `attr_schemas` only needs entries for fields you want to validate. The root validator uses `allow_unknown=True`, but nested dicts are strict (`allow_unknown=False`) to catch typos in nested structures.
- **`_set_derived_attributes()` runs on EVERY load** (including construction from DB data). Use it for computed properties that depend on stored fields, not for one-time initialization.
- **`AbstractMongoSet.delete(bulk_delete=True)` is dangerous** -- it bypasses all dependency notifications. Links, notes, version states, etc. won't be cleaned up. Only safe when you know there are no dependents or you're handling cleanup separately.
- **`criteria_override_field` pattern**: When an Index's title changes, the save payload includes `oldTitle`. The system uses this to find the existing record by the old title, then updates it. This is how primary-key renames work without losing the document.

## Relationships

- **Depends on**:
  - `sefaria.system.database.db` -- MongoDB connection
  - `sefaria.system.exceptions` -- `InputError`, `SluggedMongoRecordMissingError`
  - `bleach` -- HTML sanitization
  - `cerberus` -- Schema validation
  - `bson.objectid.ObjectId` -- MongoDB ID handling

- **Depended on by**: Nearly every model in the system. Key direct importers:
  - `sefaria/model/text.py` (Index, Version, etc.)
  - `sefaria/model/topic.py` (Topic and subclasses)
  - `sefaria/model/manuscript.py`
  - `sefaria/model/marked_up_text_chunk.py`
  - `sefaria/model/schema.py` (Term, TermScheme)
  - `sefaria/model/link.py`, `note.py`, `history.py`, `notification.py`, etc.
  - `sefaria/helper/schema.py`, `sefaria/helper/legacy_ref.py`

- **Dependency subscriptions** (registered in `sefaria/model/dependencies.py`):
  - `Index.save` -> updates core cache, version_state, ToC
  - `Index.attributeChange("title")` -> cascades to versions, links, notes, history, sheets, notifications, ref_data, user_history, topic_links, manuscript_links, marked_up_text_chunks (11+ subscribers)
  - `Index.delete` -> cascades to version_state, links, topic_links, notes, versions, ToC, notifications, ref_data, marked_up_text_chunks
  - `Version.attributeChange("versionTitle")` -> history, search re-index, notifications
  - `Topic.delete` / `Topic.attributeChange("slug")` / `Topic.attributeChange("description")` -> topic links, marked_up_text_chunks
  - `Category.attributeChange("path")` / `Category.save` -> category processing, library rebuild
  - `Collection.attributeChange("slug")` / `Collection.delete` -> sheets, notifications
  - Various garden, manuscript, term, notification cascades

## Dependency/Notification System (Bottom of File)

The `deps` dict is a module-level registry. Key structure: `(class, action, attr_or_None) -> [callbacks]`.

- **`subscribe(callback, klass, action, attr=None)`** -- Register a callback. `action` is one of `"save"`, `"delete"`, `"attributeChange"`, `"create"`. For `"attributeChange"`, `attr` specifies which attribute.
- **`notify(inst, action, **kwargs)`** -- Fire all registered callbacks. For `"attributeChange"`, requires `attr`, `old`, `new` in kwargs. For `"save"`, passes `orig_vals` and `is_new`.
- **`cascade(set_class, attr)`** -- Factory: returns a callback that updates `attr` in all records of `set_class` where `attr == old_value`. Supports dotted paths for nested attrs (e.g., `"content.index"`).
- **`cascade_to_list(set_class, attr)`** -- Like `cascade` but for fields that are lists of references.
- **`cascade_delete(set_class, fk_attr, pk_attr)`** -- Factory: returns a callback that deletes all records in `set_class` where `fk_attr` matches the deleted object's `pk_attr`.
- **`cascade_delete_to_list(set_class, fk_attr, pk_attr)`** -- Like `cascade_delete` but removes the value from a list field instead of deleting the record.

## Common Tasks

**Create a new model class:**
```python
class MyRecord(AbstractMongoRecord):
    collection = "my_collection"
    required_attrs = ["title", "content"]
    optional_attrs = ["description"]
    # If other models reference 'title', track it:
    track_pkeys = True
    pkeys = ["title"]
```

**Create a new model with a slug:**
```python
class MySluggedRecord(SluggedAbstractMongoRecord):
    collection = "my_collection"
    slug_fields = ["slug"]
    required_attrs = ["slug", "title"]
```

**Register a dependency (in dependencies.py):**
```python
subscribe(my_handler_function, SomeModel, "attributeChange", "field_name")
subscribe(cascade(MyModelSet, "fk_field"), SomeModel, "attributeChange", "pk_field")
subscribe(cascade_delete(MyModelSet, "fk_field", "pk_field"), SomeModel, "delete")
```

**Load or check existence:**
```python
record = MyRecord().load({"title": "foo"})  # returns None if not found
if record:
    # exists and is loaded
```

**Bulk operations without triggering cascades:**
```python
record.save(override_dependencies=True)
my_set.delete(bulk_delete=True)  # WARNING: no notifications fired
```
