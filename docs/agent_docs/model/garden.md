# Garden
> Source: `sefaria/model/garden.py`

## Purpose
Gardens are curated collections of textual "stops" (references to sources or freeform text blobs) with configurable filtering, sorting, and timeline/geographic visualization. They support importing content from sheets, search results, and ref lists, and can discover link-based relationships between their stops.

## Key Classes

### Garden
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `garden`
- **Role**: Top-level container that owns a set of GardenStops and GardenStopRelations, plus display/filter configuration.
- **Key fields**: `key` (pkey, tracked), `title`, `heTitle`, `config` (dict with timeline, filter, and sort settings), optional `subtitle`/`heSubtitle`.
- **Key methods**:
  - `add_stop(attrs)` — Upserts a stop: if a stop with the same `ref` already exists in this garden, increments `weight` and merges tags instead of creating a duplicate. Auto-fetches `enText`/`heText` from the library when not provided.
  - `add_relationship(attrs)` — Creates a `GardenStopRelation` tied to this garden.
  - `import_sheet(sheet_id)` — Walks sheet sources (including nested subsources) and adds each as a stop. Tags include sheet tags and sheet author name.
  - `import_ref_list(reflist, defaults)` — Bulk-imports a list of Ref strings/objects. Returns `self` for chaining.
  - `import_search(q)` — Runs a Sefaria search query and imports hits as stops.
  - `get_links()` — Finds core Links between the garden's refs and creates GardenStopRelations. Noted as slow (`# todo: this is way too slow`).
  - `stopsByTime()`, `stopsByPlace()`, `stopsByAuthor()`, `stopsByTag()` — Group stops using `itertools.groupby`; require the stop set to already be sorted on the grouping key.
  - `updateConfig()`, `updateFilter()`, `updateSort()` — Mutate `self.config` in place (call `.save()` afterward).
  - `stopSet(sort)` / `relSet(sort)` — Return the associated `GardenStopSet` / `GardenStopRelationSet`, default sorted by `start`.

### GardenSet
- **Inherits**: `AbstractMongoSet`
- **Role**: Set class for `Garden`.

### GardenStop
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `garden_stop`
- **Role**: A single item in a garden — either an inside source (has a `ref`), outside source, or blob.
- **Key fields**: `garden` (foreign key to `Garden.key`), `type` (`"inside_source"` | `"outside_source"` | `"blob"`), `ref`, `weight`, `tags` (dict of lists keyed by filter type, e.g. `{"default": [...], "Sheet Author": [...]}`), `start`/`end` (integer years), `placeKey`, `authors`.
- **Key methods**:
  - `_derive_metadata()` — Called on ref change during `_normalize()`. Resolves the ref to populate `indexTitle`, `heRef`, text content, author info, place info, and time period from the Index and author Topic. Raises `InputError` if a referenced place key is not found.
  - `_normalize()` — Triggers `_derive_metadata()` only when `ref` pkey has changed (uses `is_key_changed`). Casts `start`/`end` to int.
  - `time_period()` — Returns a `TimePeriod` object from `start`/`end`, or `None`.
  - `set_tags(tags, type)` — Has a bug: uses string literal `"type"` instead of the `type` parameter variable.

### GardenStopSet
- **Inherits**: `AbstractMongoSet`
- **Role**: Set class for `GardenStop`.

### GardenStopRelation
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `garden_rel`
- **Role**: Represents a relationship between stops in a garden. Only requires `garden`; has no other defined attrs (schema is essentially open).

### GardenStopRelationSet
- **Inherits**: `AbstractMongoSet`
- **Role**: Set class for `GardenStopRelation`.

## Non-Obvious Patterns
- **Upsert-on-ref in `add_stop`**: Adding a stop with an existing `ref` in the same garden does not create a duplicate; it increments `weight` and merges tags. There is a bug on line 186 where `existing.enText` is set instead of `existing.heText` when merging Hebrew text.
- **`tags` is a dict of lists**, not a flat list. Keys are filter types (e.g. `"default"`, `"Sheet Author"`). This maps to the garden's `config.filters`.
- **`set_tags` bug**: Uses `self.tags["type"]` (string literal) instead of `self.tags[type]` (variable). This means tags are always stored/read under the key `"type"` regardless of the `type` argument.
- **`track_pkeys = True`** on both `Garden` (tracks `key`) and `GardenStop` (tracks `ref`). This enables `is_key_changed()` checks in `_normalize`.
- **`default_config`** is a class-level dict used as a template; `_set_derived_attributes` deep-copies it to avoid shared mutation.
- **Commented-out code** at the bottom (`process_index_title_change_in_gardens`, `process_index_delete_in_gardens`) suggests cascading updates for index title changes were planned but never activated.

## Relationships
- **Garden.key -> GardenStop.garden**: One-to-many. Queried via `{"garden": self.key}`.
- **Garden.key -> GardenStopRelation.garden**: One-to-many. Same pattern.
- **GardenStop.ref -> text.Ref**: Stops with `type="inside_source"` reference Sefaria texts.
- **GardenStop.placeKey -> Place.key**: Resolved during metadata derivation.
- **GardenStop.authors -> Topic**: Author slugs resolved via `topic.Topic.init()`.
- **Dependency subscriptions**: Garden key change cascades to `GardenStopSet` and `GardenStopRelationSet`; Garden delete cascades delete to stops and relations.

## Common Tasks

**Create a garden and populate it from a sheet:**
```python
g = Garden({"key": "my-garden", "title": "My Garden", "heTitle": "הגינה שלי", "config": {}})
g.save()
g.import_sheet(12345)
g.save()
```

**Import a list of refs:**
```python
g.import_ref_list(["Genesis 1:1", "Exodus 2:3"], defaults={"tags": {"custom_filter": ["tag1"]}})
g.save()
```

**Query stops grouped by tag:**
```python
by_tag = g.stopsByTag()  # returns {"default": {"tag_name": [stop_dicts]}, ...}
```

**Update filter/sort config:**
```python
g.updateFilter("Author", {"en": "Author", "he": "מחבר", "logic": "OR", "position": "SIDE"})
g.updateSort("weight", {"type": "Int", "en": "Weight", "he": "משקל"})
g.save()
```
