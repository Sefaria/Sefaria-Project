# Category & TOC Tree
> Source: `sefaria/model/category.py`

## Purpose
Defines the hierarchical category taxonomy (e.g., "Talmud" > "Bavli" > "Seder Moed") that organizes every text in the Sefaria library. Also implements the in-memory Table of Contents (TOC) tree, which is the runtime representation of the full library hierarchy including categories, text indices, and collections. The TOC tree is built once during Library initialization and updated incrementally as records change.

## Key Classes

### Category
- **Inherits**: `AbstractMongoRecord`, `AbstractTitledOrTermedObject`, `MatchTemplateMixin`
- **Collection**: `category`
- **Role**: Persistent Mongo record representing a single node in the category hierarchy. Each Category has a `path` (list of strings from root to itself) and either a `sharedTitle` (referencing a `Term`) or inline `titles`.
- **Key fields**: `path` (list of ancestor names + self), `lastPath` (final element, must match primary English title), `depth` (len of path), `sharedTitle`, `order` (int, controls sort position), `isPrimary`, `searchRoot`, `enDesc`/`heDesc`, `enShortDesc`/`heShortDesc`
- **Key methods**:
  - `change_key_name(name)` — Renames the category. Updates `sharedTitle` or inline title, `lastPath`, and `path[-1]`. Does not support switching between shared-term and local titles.
  - `can_delete()` — Returns False if the category has any children in the TOC tree (texts or subcategories).
  - `get_toc_object()` — Returns the corresponding `TocCategory` node from the live TOC tree.
  - `get_shared_category(indexes)` — Static. Finds the lowest (deepest) category that contains all given Index objects.

### CategorySet
- **Inherits**: `AbstractMongoSet`
- **Collection**: `category`
- **Role**: Standard set class for querying multiple Category records.

### TocTree
- **Inherits**: `object`
- **Collection**: N/A (in-memory only)
- **Role**: The runtime tree representation of the entire library. Built during `Library.__init__()` by loading all Categories (sorted by depth), then placing all Index records and listed Collections as leaf nodes. Maintains a `_path_hash` dict mapping `tuple(path)` to TocNode for O(1) lookup.
- **Key methods**:
  - `lookup(cat_path, title=None)` — O(1) lookup by path tuple. Falls back to prepending "Other" if not found.
  - `update_title(index, old_ref, recount)` — Incrementally updates or inserts an index node after a text changes.
  - `flatten()` — Returns ordered list of all text titles in TOC order.
  - `get_serialized_toc()` — Returns the full TOC as nested dicts (the shape served by the API).
  - `_sort()` — Sorts children: by `base_text_order` if all children have it, otherwise by `order` attr then alphabetically. Negative order values sort last.

### TocNode
- **Inherits**: `TitledTreeNode` (from schema)
- **Collection**: N/A
- **Role**: Abstract base for all TOC tree nodes. Handles bilingual title storage and serialization.

### TocCategory
- **Inherits**: `TocNode`
- **Role**: Represents a category folder in the TOC tree. Wraps a `Category` Mongo record and copies display fields (`enDesc`, `isPrimary`, `searchRoot`, `order`) onto itself. Tracks `enComplete`/`heComplete` (set to False if any child text is incomplete).

### TocTextIndex
- **Inherits**: `TocNode`
- **Role**: Represents a single text (Index) as a leaf in the TOC tree. Wraps an `Index` object and holds serialized metadata (`categories`, `dependence`, `firstSection`, `primary_category`, `collectiveTitle`, `base_text_titles`, etc.).

### TocCollectionNode
- **Inherits**: `TocNode`
- **Role**: Represents a Collection that is listed in the library TOC (collections with a `toc` field set and `listed: True`).

## Non-Obvious Patterns

- **`path` is the primary key**: Category identity is its full `path` list. Renaming a category triggers a cascading update to all child categories, all Index records underneath, and all Collection toc entries via `process_category_path_change()`.
- **Three-way name invariant**: `_validate()` asserts `lastPath == path[-1] == primary English title`. All three must match at save time.
- **`sharedTitle` vs inline titles**: A category can get its titles from a shared `Term` (via `sharedTitle`) or store them directly. If `sharedTitle` is set, any inline `titles` are stripped during `_normalize()`.
- **`origPath` for renames**: The Category Editor sends `origPath` to indicate a rename. `_set_derived_attributes()` detects when `origPath` is present and `lastPath` differs from `path[-1]`, then calls `change_key_name()`.
- **TOC completeness propagation**: When building the tree, if any text under a category has `enComplete=False` or `heComplete=False`, that flag propagates upward through all ancestors -- but stops at "Commentary" to avoid marking a top-level category incomplete due to commentary gaps.
- **Sort order quirks**: `_sort()` uses `(node.order < 0, node.order)` as the key -- negative `order` values sort to the end (the boolean True=1 sorts after 0), and nodes without `order` get sort key `(0.5, title)` placing them between positive and negative ordered nodes.
- **`override_dependencies=True`**: Used extensively in `process_category_path_change()` to prevent infinite dependency loops when bulk-updating children.
- **`_path_hash` keys**: For categories the key is `tuple(cat.path)`, for indices it is `tuple(categories + [title])`, for collections it is `tuple(categories + [slug])`.

## Relationships
- **Depends on**: `abstract` (AbstractMongoRecord), `schema` (TitledTreeNode, Term, AbstractTitledOrTermedObject), `text` (IndexSet, Library, TocSerializationOptions), `collection` (CollectionSet, Collection), `linker.has_match_template` (MatchTemplateMixin)
- **Depended on by**: `text.py` (Library builds TocTree), `topic.py` (imports Category), `linker/category_resolver.py`, `helper/category.py`, `model/__init__.py` (public API)
- **Dependency subscriptions** (from `dependencies.py`):
  - `Category` path change (`attributeChange` on `path`) -> `category.process_category_path_change` (updates all child categories, indices, and collection toc entries)
  - `Category` path change -> `marked_up_text_chunk.process_category_path_change`
  - `Category` save -> `text.rebuild_library_after_category_change` (full Library rebuild)
  - `Category` save -> `text.reset_simple_term_mapping`
  - `Category` delete -> `text.reset_simple_term_mapping`

## Common Tasks

- **Look up a category by path**: `Category().load({"path": ["Talmud", "Bavli"]})`
- **Get all categories**: `CategorySet()` or `CategorySet({"depth": 1})` for top-level only
- **Find a category's TOC node**: `library.get_toc_tree().lookup(["Talmud", "Bavli"])`
- **Find a text in the TOC**: `library.get_toc_tree().lookup(["Talmud", "Bavli", "Seder Moed"], "Berakhot")`
- **Rename a category**: Set `origPath` to old path, update `path`, and save. The dependency system propagates the change.
- **Check if category can be deleted**: `cat.can_delete()` -- returns False if it has children
- **Get serialized TOC for API**: `library.get_toc_tree().get_serialized_toc()`
