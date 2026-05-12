# Referenceable Book Node
> Source: `sefaria/model/linker/referenceable_book_node.py`

## Purpose
Defines a tree of "referenceable" nodes that the linker uses to resolve textual references into `Ref` objects. The tree mirrors an Index's schema but adds alt-struct nodes, splits JaggedArrayNodes by depth, and attaches Dibur Hamatchil (DH) leaf nodes. This is the core abstraction that lets the linker walk from a book title down through numbered sections to a precise segment or DH match.

## Key Classes

### ReferenceableBookNode
- **Inherits**: object (base class)
- **Role**: Abstract base for all nodes in the referenceable tree. Provides the interface: `get_children()`, `is_default()`, `referenceable`, `is_ancestor_of()`, `leaf_refs()`.
- **Key methods**:
  - `get_children()` -- returns child nodes (empty by default)
  - `leaf_refs()` -- returns the `Ref` objects at the leaves (abstract)
  - `is_ancestor_of(other)` -- delegates to the underlying `TitledTreeNode`

### IndexNodeReferenceableBookNode
- **Inherits**: `ReferenceableBookNode`
- **Role**: Wraps a `TitledTreeNode` from an Index schema or alt struct. Adds `ref()`, `unique_key()`, and `ref_order_id()` for ordering results.
- **Key fields**: `_titled_tree_node`

### NamedReferenceableBookNode
- **Inherits**: `IndexNodeReferenceableBookNode`
- **Role**: Entry point for resolving a named node (book title, schema node, or alt-struct node). Handles dispatching to the correct child type: `NumberedReferenceableBookNode`, `DiburHamatchilNodeSet`, `MapReferenceableBookNode`, or recursive `NamedReferenceableBookNode`.
- **Key methods**:
  - `get_children()` -- implements the `referenceable` / `optional` / `False` logic: nodes marked `False` are skipped (their children promoted), `optional` nodes appear alongside their children.
  - `_get_all_children()` -- the raw child-discovery logic; handles JaggedArrayNodes, ArrayMapNodes, DH nodes, and Index-level children.
  - `ref_part_title_trie()` -- delegates to `TitledTreeNode.get_match_template_trie()` for title matching.
  - `get_numeric_equivalent()` -- returns the node's `numeric_equivalent` attribute if present (used for nodes that can also be referenced by number).

### NumberedReferenceableBookNode
- **Inherits**: `IndexNodeReferenceableBookNode`
- **Role**: Represents a single depth-level of a JaggedArrayNode. Recursively creates children by serializing and truncating the JA node one depth at a time.
- **Key methods**:
  - `possible_subrefs(lang, initial_ref, section_str, fromSections)` -- parses `section_str` using the node's `AddressType` and returns candidate `Ref` objects and whether they can match out of order.
  - `get_children(context_ref)` -- creates the next-depth `NumberedReferenceableBookNode`, plus DH and Passage children if applicable. **Requires `context_ref`** for DH and passage lookups.
  - `matches_section_context(section_context)` -- checks if address type and section name match a `SectionContext`.
- **Key fields**: `_ja_node`, `_address_class` (property), `_section_name` (property)
- **Internal detail**: Talmud nodes get an extra "Amud" depth injected via `insert_amud_node_values()`.

### MapReferenceableBookNode
- **Inherits**: `NumberedReferenceableBookNode`
- **Role**: Wraps an `ArrayMapNode` (e.g., Mishneh Torah chapters mapped to Talmud refs). Builds a synthetic JA node for address parsing but resolves sections through an internal `_section_ref_map` dictionary.
- **Key methods**:
  - `possible_subrefs()` -- overrides parent; looks up sections in `_section_ref_map` instead of using `subref()`.
  - `leaf_refs()` -- returns the mapped ref values.
- **Key fields**: `_section_ref_map` (dict mapping section int to `Ref`)

### DiburHamatchilNode
- **Inherits**: `AbstractMongoRecord`, `ReferenceableBookNode`
- **Role**: A single Dibur Hamatchil record from MongoDB (`dibur_hamatchils` collection). Used as a leaf node for commentary texts that reference by opening words.
- **Key methods**:
  - `fuzzy_match_score(lang, raw_ref_part)` -- returns a `DiburHamatchilMatch` with score 1.0 if the DH starts with the candidate text, 0.0 otherwise.
- **Required MongoDB fields**: `dibur_hamatchil`, `container_refs`, `ref`

### DiburHamatchilNodeSet
- **Inherits**: `AbstractMongoSet`, `ReferenceableBookNode`
- **Role**: Set of `DiburHamatchilNode` records for a given container ref. Acts as a child node in the tree.
- **Key methods**:
  - `best_fuzzy_matches(lang, raw_ref_part, score_leeway, threshold)` -- iterates all DH nodes and returns the best matches above the threshold.

### DiburHamatchilMatch
- **Inherits**: dataclass
- **Role**: Holds a DH match result: `score`, `dh` (matched text), `potential_dh_token_idx`, and the matched `dh_node`. Supports comparison operators ordered by `(score, dh_length)`.

### PassageNode / PassageNodeSet
- **Inherits**: `ReferenceableBookNode`
- **Role**: Wraps `Passage` objects (from the `passage` model) as referenceable nodes. `PassageNodeSet` acts as a container returning `PassageNode` children.

### PassageMatcher
- **Role**: Thread-safe singleton that indexes all `Passage` records (with `match_templates`) by segment ref. Used by `NumberedReferenceableBookNode.get_children()` to attach passage nodes.
- **Key method**: `get_passages(ref)` -- regex-matches the ref against indexed segment keys.
- **Lifecycle**: Initialized once at module load (`PASSAGE_MATCHER` global).

## Non-Obvious Patterns
- **JA node depth peeling**: A `JaggedArrayNode` of depth 3 does not become a single node. Instead, `NumberedReferenceableBookNode` serializes the JA, truncates to the next referenceable depth, and creates a new child `NumberedReferenceableBookNode` for the remaining depths. This recursion happens in `get_children()`.
- **Talmud amud injection**: For Talmud address types, an extra "Amud" level is injected into the serialized node so that "2a" / "2b" style references resolve correctly.
- **`referenceable` tri-state**: Schema nodes can have `referenceable` set to `True` (default), `False` (skip node, promote children), or `'optional'` (include both node and children). This is handled in `NamedReferenceableBookNode.get_children()`.
- **Parsha-aware subrefs**: The `_parsha_subref()` helper converts a parsha-level ref to a book-level subref, validating that the section falls within the parsha range.
- **`PASSAGE_MATCHER` is a module-level singleton**: It loads all passages from MongoDB at import time. This can be slow on first import.

## Relationships
- **Consumed by**: The linker's ref resolution pipeline (likely `ref_resolver.py` or similar) walks this tree to match raw text to `Ref` objects.
- **Depends on**: `sefaria.model.text` (Ref, Index), `sefaria.model.schema` (JaggedArrayNode, AddressType, ArrayMapNode, etc.), `sefaria.model.abstract` (Mongo record/set), `sefaria.model.passage` (Passage, PassageSet).
- **`subref()` helper**: Module-level function that dispatches to Talmud-aware, parsha-aware, or standard `Ref.subref()` logic.

## Common Tasks

**Add a new type of referenceable node**: Subclass `ReferenceableBookNode`, implement `get_children()` and `leaf_refs()`. Wire it into `NamedReferenceableBookNode._get_all_children()` or `NumberedReferenceableBookNode.get_children()`.

**Debug why a reference isn't resolving**: Check `get_children()` at each level of the tree. For numbered nodes, check `possible_subrefs()` and the address class. For DH nodes, check the `dibur_hamatchils` collection for the `container_refs` value.

**Understand node dispatch**: Start at `NamedReferenceableBookNode._get_all_children()` -- it checks `isinstance` on the underlying schema node and routes to the appropriate referenceable node type.
