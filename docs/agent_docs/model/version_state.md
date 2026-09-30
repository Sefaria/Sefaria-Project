# VersionState
> Source: `sefaria/model/version_state.py`

## Purpose
VersionState tracks text availability and completion statistics for every Index in the database. It maintains per-language (English, Hebrew) and aggregate counts of which segments exist, what percentage of a text is available, and what the "shape" of a text looks like. There is exactly one VersionState record per Index, stored in the `vstate` MongoDB collection.

## Key Classes

### VersionState
- **Inherits**: `AbstractMongoRecord`, `AbstractSchemaContent`
- **Collection**: `vstate`
- **Role**: One-to-one companion record for each Index. Stores a `content` tree that mirrors the Index's schema structure, with leaf nodes containing per-language availability masks, counts, and percentages.
- **Key fields**:
  - `title` -- Index title (serves as the implicit foreign key to the Index)
  - `content` -- Tree of availability data mirroring the schema. Each leaf has `_en`, `_he`, and `_all` sub-dicts (see Content Structure below)
  - `flags` -- Dict with optional `heComplete` and `enComplete` booleans
  - `linksCount` -- Total number of links to this text
  - `first_section_ref` -- Normal-form Ref string to the first non-empty section
- **Key methods**:
  - `__init__(index)` -- Loads existing vstate by index title, or creates and refreshes a new one if none exists. Sets `is_new_state = True` when freshly created.
  - `refresh()` -- Recomputes all availability data by walking the schema tree, recounts links, finds first section ref, then saves. Skips if `is_new_state` (already done in init). Invalidates Varnish cache.
  - `state_node(snode)` -- Returns a `StateNode` wrapper for a given SchemaNode, useful for querying availability of a specific node.
  - `get_flag(flag)` / `set_flag(flag, value)` -- Read/write completion flags. `set_flag` also invalidates the dashboard template cache.
  - `_content_node_visitor(snode, *contents)` -- Visitor callback that computes all leaf-level stats: `availableTexts`, `availableCounts`, `percentAvailable`, `textComplete`, `completenessPercent`.
  - `_aggregate_structure_state(snode, contents)` -- Visitor callback for structure (non-leaf) nodes; averages child percentages upward.
  - `_node_count(snode, lang)` -- Counts available segments by summing boolean masks across all Versions for a given language. Returns `JaggedIntArray`.

### VersionStateSet
- **Inherits**: `AbstractMongoSet`
- **Collection**: `vstate`
- **Role**: Standard set class for querying multiple VersionState records.

### StateNode
- **Inherits**: `object` (plain class, not a Mongo record)
- **Collection**: N/A
- **Role**: Lightweight read-only wrapper around a single node's portion of a VersionState's `content` tree. Provides convenient accessors for availability data without loading the entire VersionState content.
- **Key fields**:
  - `d` -- The raw dict for this node (the `_en`/`_he`/`_all` sub-tree)
  - `snode` -- The corresponding SchemaNode
  - `versionState` -- The parent VersionState object
- **Key methods**:
  - `__init__(title=None, snode=None, _obj=None, meta=False, hint=None)` -- Can be constructed from a title string, a SchemaNode, or a raw dict. `meta=True` uses a projection that excludes detailed count arrays (for lightweight Index-level queries). `hint` allows requesting only specific (lang, key) pairs via projection.
  - `var(lang, key)` -- Generic accessor: `var("en", "percentAvailable")` returns the English percent available.
  - `ja(lang, key="availableTexts")` -- Returns a `JaggedIntArray` from the stored data, useful for iteration and mask operations.
  - `get_available_counts_dict(lang)` -- Zips section names with available counts into a dict like `{"Chapter": 50, "Verse": 1533}`.
  - `get_untranslated_count_by_unit(unit)` / `get_translated_count_by_unit(unit)` -- Convenience methods for translation stats.

## Content Structure (Leaf Nodes)
Each leaf node in `content` contains:
```
{
  "_en": {
    "availableTexts":        # JaggedArray-shaped boolean mask (0/1) of available segments
    "availableCounts":       # List[int], length == depth. Counts at each depth level.
    "percentAvailable":      # Float. Percent available vs. metadata lengths.
    "percentAvailableInvalid": # Bool. True if percentAvailable > 100 or lengths missing.
    "textComplete":          # Bool. True if percentAvailable > 99.9.
    "completenessPercent":   # Float. Structural fullness measure.
  },
  "_he": { ... same keys ... },
  "_all": {
    "availableTexts":        # Union mask across all languages
    "shape":                 # Depth 1: int, Depth 2: list of ints, Depth 3: list of lists
  }
}
```

## Non-Obvious Patterns
- **One-to-one with Index**: VersionState overrides default init/load behavior. Constructing `VersionState("Genesis")` either loads the existing record or creates + refreshes + saves a new one. The `is_new_state` flag distinguishes these cases.
- **Schema tree mirroring**: The `content` dict mirrors the Index schema tree exactly. For simple texts it has `_en`/`_he`/`_all` at the top level. For complex texts (e.g., Pesach Haggadah), it nests by schema node keys down to the leaf JaggedArrayNodes.
- **Zero-mask padding**: When computing per-language `availableTexts`, the code pads with a zero-mask derived from the `_all` union. This ensures all languages have the same shape array, even if one language has sections the other doesn't.
- **refresh() is expensive**: It iterates all Versions for each language, builds JaggedTextArrays, computes masks, counts links, and saves. Called on Index creation and can be triggered manually.
- **StateNode projections**: `meta=True` and `hint` parameters use MongoDB projections to avoid loading the full (potentially large) `availableTexts` arrays when only summary stats are needed. This is a key performance optimization.
- **Legacy/unused fields**: Several fields (`sparseness`, `textComplete`, `completenessPercent`) are noted as unused outside this file or legacy. They persist on records but have TODO markers for removal.

## Relationships
- **Depends on**:
  - `text` (Index, IndexSet, VersionSet, AbstractIndex, AbstractSchemaContent, library, Ref)
  - `abstract` (AbstractMongoRecord, AbstractMongoSet)
  - `link` (LinkSet -- for counting links during refresh)
  - `sefaria.datatype.jagged_array` (JaggedTextArray, JaggedIntArray)
  - `sefaria.system.cache` (delete_template_cache)
- **Depended on by**:
  - `text.py` -- `Index.versionState()`, `Ref.get_state_node()`, `Ref.get_state_ja()`, schema annotation methods
  - `schema.py` -- `JaggedArrayNode.last_section_ref()` uses StateNode
  - `category.py` -- queries VersionState for category-level stats
  - `sefaria/helper/schema.py`, `sefaria/helper/linker_index_converter.py`
  - `reader/views.py`, `sefaria/views.py` -- API endpoints that surface availability data
- **Dependency subscriptions** (registered in `dependencies.py`):
  - **Index save** -> `create_version_state_on_index_creation`: creates VersionState for new Index if one doesn't exist
  - **Index title change** -> `process_index_title_change_in_version_state`: updates the `title` field in vstate records
  - **Index delete** -> `process_index_delete_in_version_state`: deletes the vstate record directly via `db.vstate.delete_one()`

## Common Tasks
- **Check text availability**: `StateNode(title="Genesis").var("en", "percentAvailable")`
- **Get available segment mask**: `StateNode(title="Genesis").ja("en")` returns a JaggedIntArray
- **Rebuild stats after text import**: `VersionState("Genesis").refresh()`
- **Rebuild all stats**: `refresh_all_states()` iterates every Index and calls refresh, then rebuilds TOC
- **Check/set completion flag**: `vs.get_flag("enComplete")`, `vs.set_flag("enComplete", True).save()`
- **Get lightweight summary (no big arrays)**: `StateNode(snode=some_node, meta=True)`
