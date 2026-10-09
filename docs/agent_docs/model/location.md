# Location & Temporal Metadata
> Sources: `sefaria/model/place.py`, `sefaria/model/timeperiod.py`, `sefaria/model/manuscript.py`

## Purpose
These three modules share a concern with situating texts and people in physical and temporal context. `place.py` models geographic locations tied to text composition/publication and person biography. `timeperiod.py` models historical eras, generations, and life spans used to date authors. `manuscript.py` models physical manuscript witnesses and their page-level mappings to Sefaria Refs. They are grouped because they collectively provide the "where, when, and in what physical form" metadata layer.

## place.py

### Place (AbstractMongoRecord)
- **Collection:** `place`
- **Primary key:** `key` (tracked for change cascades)
- **Required attrs:** `key`, `names` (TitleGroup-based, en/he), `point` (GeoJSON Point)
- **Optional attrs:** `area` (GeoJSON polygon)
- **Name handling:** Uses `schema.TitleGroup` (same pattern as TimePeriod and Terms). Provides `all_names()`, `primary_name()`, `secondary_names()`.
- **Geocoding:** `city_to_coordinates(city)` uses `geopy.Nominatim` to resolve a city name to lat/lon. Only accepts types: administrative, city, town, municipality, neighbourhood, village. Raises `InputError` on failure.
- **`create_new_place(en, he=None)`:** Class method. Loads existing by key or creates new, geocodes, and saves. Idempotent.

### PlaceSet (AbstractMongoSet)
- `asGeoJson()` serializes the set as a GeoJSON FeatureCollection (optionally with polygons, optionally as string).

### Free functions
- **`process_index_place_change(indx, **kwargs)`:** Subscribed to `Index.attributeChange` for `compPlace` and `pubPlace`. Creates a Place record when a new place name is set on an Index.
- **`process_topic_place_change(topic_obj, **kwargs)`:** Handles birthPlace/deathPlace changes on topics. Creates Place if needed, updates `topic_obj.properties` in-place (caller must save).

## timeperiod.py

### TimePeriod (AbstractMongoRecord)
- **Collection:** `time_period`
- **Primary key:** `symbol` (e.g. "T3", "A1", "RI") -- tracked for change cascades
- **Required attrs:** `symbol`, `type` ("Era", "Generation", "Two Generations"), `names` (TitleGroup)
- **Optional attrs:** `start`, `end` (integers, negative = BCE), `startIsApprox`, `endIsApprox`, `order`, `range_string`
- **Name handling:** Same TitleGroup pattern as Place.
- **`period_string(lang)`:** Renders a human-readable date range string (e.g. "(c.290 BCE - c.320 CE)") with BCE/CE labels and approximation markers. Handles en/he formatting differences. Special-cases symbol "CO" (contemporary -- open-ended).
- **`get_era()`:** For a Generation, finds the enclosing Era by start/end range query.
- **`get_people_in_generation()`:** Returns Topics whose `properties.generation.value` matches this symbol (regex match for `include_doubles`).
- **`determine_year_estimate()`:** Returns midpoint of start/end, or whichever is available.

### TimePeriodSet (AbstractMongoSet)
- `get_eras()` / `get_generations()` -- convenience static methods returning ordered sets by type.

### LifePeriod (TimePeriod subclass)
- Overrides `period_string()` to format as birth/death style: "b. 1040 CE - d. 1105 CE" (en) or Hebrew equivalents. Used for Person topic display. Does NOT have its own collection -- it is an in-memory-only subclass used for formatting.

## manuscript.py

### Manuscript (SluggedAbstractMongoRecord)
- **Collection:** `manuscripts`
- **Primary key:** `slug` (derived from title, tracked for cascades)
- **Required attrs:** `slug`, `title`, `he_title`, `source`, `description`, `he_description`
- **Optional attrs:** `license`
- **Slug normalization:** `normalize_slug_field()` normalizes characters and checks for duplicates in the collection, raising `DuplicateRecordError` if found.
- **`_normalize()`:** Auto-derives slug from title on every save.

### ManuscriptPage (AbstractMongoRecord)
- **Collection:** `manuscript_pages`
- **Required attrs:** `manuscript_slug`, `page_id`, `image_url`, `thumbnail_url`, `contained_refs` (section-level trefs), `expanded_refs` (segment-level trefs)
- **Uniqueness:** `(manuscript_slug, page_id)` pair enforced in `_pre_save()`.
- **Validation (`_validate`):**
  - Parent Manuscript must exist in DB.
  - All `contained_refs` must be valid Refs.
  - No overlapping refs allowed among `contained_refs`.
- **Ref management:**
  - `add_ref(tref)` -- appends to contained_refs, extends expanded_refs. Raises ManuscriptError on overlap.
  - `remove_ref(tref)` -- pops from contained_refs, rebuilds expanded_refs.
  - `set_expanded_refs()` -- full rebuild from contained_refs via `Ref.all_segment_refs()`.

### ManuscriptPageSet (AbstractMongoSet)
- **`load_by_ref(oref)`:** Finds pages whose expanded_refs match the ref regex. Uses `expanded_refs_1` index hint.
- **`load_set_for_client(tref)`:** Returns denormalized dicts suitable for JSON serialization. JOINs ManuscriptPage with its parent Manuscript. Computes `anchorRef` and `anchorRefExpanded` for the client.

### Free functions
- **`process_index_title_change_in_manuscript_links(indx, **kwargs)`:** Cascades Index title renames into contained_refs and expanded_refs on all affected ManuscriptPages.
- **`process_slug_change_in_manuscript(man, **kwargs)`:** Updates `manuscript_slug` on all ManuscriptPages when a Manuscript slug changes.
- **`process_manucript_deletion(man, **kwargs)`:** Deletes all ManuscriptPages belonging to the deleted Manuscript. (Note: function name has a typo -- "manucript".)

## Non-Obvious Patterns

1. **TitleGroup reuse:** Place, TimePeriod, and Terms all use `schema.TitleGroup` for multilingual name management. The code comments note this should be abstracted further.
2. **LifePeriod is never persisted.** It subclasses TimePeriod purely for formatting; it has no separate collection and is constructed in-memory from Person/Topic birth/death dates.
3. **Geocoding is synchronous and external.** `Place.create_new_place()` calls the Nominatim API on every new place creation. This can fail or be slow in bulk operations.
4. **ManuscriptPage expanded_refs can be large.** A page covering an entire chapter will have hundreds of segment-level ref strings. The `_pre_save` deduplicates them.
5. **The `process_manucript_deletion` typo** is the actual function name -- do not "fix" it without updating `dependencies.py` line 122 as well.
6. **TimePeriod symbol "CO"** is a special-case sentinel meaning "contemporary / still living" -- it triggers open-ended date formatting (trailing dash, no end date).

## Relationships

### Dependency subscriptions (registered in `dependencies.py`)
| Signal | Source | Event | Handler |
|---|---|---|---|
| Index `compPlace` change | `text.Index` `attributeChange` `compPlace` | `place.process_index_place_change` |
| Index `pubPlace` change | `text.Index` `attributeChange` `pubPlace` | `place.process_index_place_change` |
| TimePeriod `symbol` change | `timeperiod.TimePeriod` `attributeChange` `symbol` | Cascades to `topic.PersonTopicSet` `properties.era.value` |
| TimePeriod `symbol` change | `timeperiod.TimePeriod` `attributeChange` `symbol` | Cascades to `topic.PersonTopicSet` `properties.generation.value` |
| Manuscript `slug` change | `manuscript.Manuscript` `attributeChange` `slug` | `manuscript.process_slug_change_in_manuscript` (updates ManuscriptPages) |
| Manuscript delete | `manuscript.Manuscript` `delete` | `manuscript.process_manucript_deletion` (deletes ManuscriptPages) |

### Cross-model references
- **ManuscriptPage -> Manuscript:** via `manuscript_slug` foreign key. `get_manuscript()` loads the parent.
- **ManuscriptPage -> text.Ref:** `contained_refs` and `expanded_refs` store tref strings.
- **TimePeriod -> Topic:** `get_people_in_generation()` queries `topic.Topic` by `properties.generation.value`.
- **Place -> Topic:** `process_topic_place_change()` writes Place keys into topic `properties.birthPlace` / `properties.deathPlace`.
- **Place -> Index:** Places are referenced by `Index.compPlace` and `Index.pubPlace` string fields.

## Common Tasks

**Create a place for a new city:**
```python
from sefaria.model.place import Place
p = Place.create_new_place("Baghdad", he="בגדאד")
# Geocodes via Nominatim, saves, returns Place
```

**Look up a TimePeriod and format its date string:**
```python
from sefaria.model.timeperiod import TimePeriod
tp = TimePeriod().load({"symbol": "T3"})
tp.period_string("en")  # " (c.80 CE - c.110 CE)"
```

**Find manuscript pages for a given Ref:**
```python
from sefaria.model.manuscript import ManuscriptPageSet
results = ManuscriptPageSet.load_set_for_client("Genesis 1")
# Returns list of dicts with page images, anchor refs, and manuscript metadata
```

**Add a ref to a manuscript page:**
```python
page = ManuscriptPage().load({"manuscript_slug": "leningrad-codex", "page_id": "42"})
page.add_ref("Genesis 12:1-15")  # validates no overlap, expands segment refs
page.save()
```
