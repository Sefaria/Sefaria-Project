# schema.py
> Source: `sefaria/model/schema.py`

## Purpose
Defines the tree-node structure that describes how every text in the Sefaria library is organized (books, sections, chapters, segments). The schema tree is owned by an `Index` object and determines both the storage layout in MongoDB and the regex-based reference parsing system. This module also provides the `AddressType` hierarchy for handling diverse section-numbering systems (integers, Talmud daf, folio, perek, etc.) and the `TitleGroup`/`Term` system for managing multilingual titles.

## Class Hierarchy (inheritance tree)

```
object
  +-- TitleGroup                    # Container for multilingual title dicts
  +-- AbstractTitledObject          # Mixin: delegates to self.title_group
  |     +-- AbstractTitledOrTermedObject   # Adds sharedTitle/Term support
  |     +-- Term (+ AbstractMongoRecord)   # Persisted shared vocabulary
  |     +-- NonUniqueTerm (+ SluggedAbstractMongoRecord)
  +-- TreeNode                      # Raw tree mechanics (parent/children/traversal)
  |     +-- TitledTreeNode (+ AbstractTitledOrTermedObject + MatchTemplateMixin)
  |           +-- NumberedTitledTreeNode    # Adds addressTypes/sectionNames/depth
  |           |     +-- ArrayMapNode        # Leaf of alt-structures; holds refs
  |           |     +-- SheetNode           # Virtual, for user sheets
  |           +-- AltStructNode             # Intermediate node in alt-structures
  |           +-- SchemaNode                # THE core node for Index schemas
  |           |     +-- JaggedArrayNode (+ NumberedTitledTreeNode)  # Diamond inheritance!
  |           |           +-- StringNode    # depth=0 JaggedArrayNode
  |           +-- VirtualNode               # Not backed by Version storage
  |                 +-- DictionaryNode      # Wraps a lexicon
  |                 +-- SheetLibraryNode    # Container for sheets
  +-- AddressType                   # Base for section-addressing schemes
        +-- AddressDictionary
        +-- AddressAmud
        +-- AddressTalmud
        +-- AddressFolio
        +-- AddressInteger
              +-- AddressAliyah
              +-- AddressPerek
              +-- AddressPasuk
              +-- AddressMishnah
              +-- AddressVolume
              +-- AddressSiman
              +-- AddressHalakhah
              +-- AddressSeif
              +-- AddressSeifKatan
              +-- AddressSection
```

## Key Classes

### TitleGroup
- **Inherits**: object
- **Collection**: N/A (in-memory only)
- **Role**: Holds a list of title dicts (`{"text": ..., "lang": ..., "primary": True/False, ...}`). Used both by schema nodes and by `Term` objects.
- **Key fields**: `titles` (list of dicts), `_primary_title` (cached dict by lang)
- **Key methods**:
  - `primary_title(lang)` -- Returns cached primary title; returns empty string (not None) on miss.
  - `add_title(text, lang, primary, replace_primary, presentation)` -- The `presentation` param controls how titles combine with ancestor titles: `"combined"` (default, prepends parent titles), `"alone"` (standalone ref), `"both"`.
- **Validation quirk**: Primary English title must be pure ASCII and may not contain hyphens.

### Term
- **Inherits**: AbstractMongoRecord, AbstractTitledObject
- **Collection**: `term`
- **Role**: A shared, globally-unique titled vocabulary item. Nodes reference Terms via `sharedTitle` to reuse title sets (e.g., parsha names like "Noah" used across multiple Index schemas).
- **Key fields**: `name` (must equal primary English title), `titles`, `scheme`, `order`
- **Key methods**:
  - `load_by_title(title)` -- Queries `{'titles.text': title}`.
  - `normalize(term, lang)` -- Static. Returns the primary title for a term string, or the string unchanged if no Term found.
- **Non-obvious**: `name` MUST equal `get_primary_title()` -- validated on save.

### NonUniqueTerm
- **Inherits**: SluggedAbstractMongoRecord, AbstractTitledObject
- **Collection**: `non_unique_terms`
- **Role**: Successor to `Term` that relaxes the global uniqueness constraint on titles. Used by the topic system.
- **Key fields**: `slug`, `titles`

### TreeNode
- **Inherits**: object
- **Collection**: N/A (never persisted directly)
- **Role**: Pure tree mechanics -- parent/child relationships, traversal, serialization.
- **Key fields**: `children` (list), `parent` (single node or None), `_leaf_nodes` (cached)
- **Key methods**:
  - `append(node)` -- Adds child and sets `node.parent = self`. Returns self for chaining.
  - `get_leaf_nodes()` -- Cached. Returns all leaves under this node.
  - `serialize(**kwargs)` -- Recursively serializes. Only includes `nodeType` if there are params to output.
  - `traverse_tree(callback)` -- Pre-order traversal, top-down.
  - `traverse_to_list(callback)` -- Collects callback results into a flat list.
  - `all_children()` -- Flat list of ALL descendants (not just direct children), excluding self.
  - `get_child_order(child)` -- 1-indexed position among `all_children()`.
- **Non-obvious**: `_leaf_nodes` is lazily cached and never invalidated. Mutating the tree after calling `get_leaf_nodes()` will produce stale results.

### TitledTreeNode
- **Inherits**: TreeNode, AbstractTitledOrTermedObject, MatchTemplateMixin
- **Collection**: N/A
- **Role**: A tree node with multilingual titles. Handles combined/full titles, "default" child cascading, and the `title_dict()` used for ref parsing.
- **Key fields**: `default` (bool), `sharedTitle` (str or None), `title_group` (TitleGroup)
- **Key methods**:
  - `title_dict(lang, baselist)` -- Recursive. Builds a `{title_string: node}` map for all reachable titles. This is the core data structure for reference parsing.
  - `full_title(lang)` -- Builds "ParentTitle, ChildTitle" by walking up the tree. Cached per lang.
  - `is_default()` -- If True, references to the parent cascade to this child. Only one default child per parent is allowed.
  - `has_titled_continuation()` / `has_numeric_continuation()` -- Used by regex builder to know what can follow this node in a reference string.
- **Non-obvious**: The `title_separators` class attribute (`[", "]`) defines how parent and child titles are joined. The `presentation` attribute on individual titles in TitleGroup controls whether a title is `"combined"` (prepended with ancestors), `"alone"` (standalone), or `"both"`.

### NumberedTitledTreeNode
- **Inherits**: TitledTreeNode
- **Collection**: N/A
- **Role**: Adds numeric addressing (depth, addressTypes, sectionNames) and regex generation for reference parsing.
- **Key fields**: `depth` (int), `addressTypes` (list of strings like `"Integer"`, `"Talmud"`), `sectionNames` (list of strings like `"Chapter"`, `"Verse"`), `lengths` (optional list), `_addressTypes` (list of instantiated AddressType objects)
- **Key methods**:
  - `full_regex(title, lang, ...)` -- Builds the complete regex to match a reference like "Bereishit 1:2". Heavily cached by a composite key. Supports `for_js`, `match_range`, `strict`, `terminated`, `parentheses` modes.
  - `address_regex(lang, ...)` -- Just the numeric portion of the regex (no title).
  - `_init_address_classes()` -- Converts string addressTypes to class instances via `globals()["Address" + atype]`.
  - `sectionString(sections, lang)` -- Formats sections as "Title 1:2".
- **Non-obvious**: The `_init_address_classes()` lookup uses `globals()` -- address type classes MUST be defined in this module (or injected via `additional_classes` in `deserialize_tree`). The first address type receives `lengths[0]` if available (used by AddressTalmud to enforce max daf).

### SchemaNode
- **Inherits**: TitledTreeNode
- **Collection**: N/A (serialized as part of Index document)
- **Role**: THE core node for Index schema trees. Defines storage structure via `key` (used as dict keys in Version documents). Structure nodes have children; content nodes are leaves.
- **Key fields**: `key` (str, used as storage key), `index` (reference to owning Index), `checkFirst` (optional), `is_virtual = False`
- **Key methods**:
  - `address()` -- List of keys from root to this node (e.g., `["Genesis"]` or `["Rashi on Genesis", "Genesis"]`).
  - `version_address()` -- Same as `address()[1:]`. Used when traversing Version content dicts (the first key is the root, which maps to the Version document itself).
  - `ref()` -- Constructs a `Ref` object pointing to this node. Lazy-imports `text` module.
  - `create_content(callback)` -- Tree visitor: builds a nested dict mirroring the tree structure, calling `callback` only at leaf nodes.
  - `visit_content(callback, *contents)` -- Traverses existing content trees (like Version data) using this schema as a guide.
  - `visit_structure(callback, content)` -- Bottom-up traversal for aggregation.
  - `as_index_contents()` -- Produces the full API-ready dict for this node, including alt structures with text previews.
  - `concrete_children()` -- Children excluding virtual nodes.
- **Non-obvious**: `key` must not contain `.` (MongoDB restriction). Default nodes must have `key = "default"`. Equality is based on `address()`, not identity.

### JaggedArrayNode
- **Inherits**: SchemaNode, NumberedTitledTreeNode (diamond inheritance)
- **Collection**: N/A
- **Role**: The most common leaf node type. Defines a jagged array of text content addressable by integers or other address types. For example, a book with chapters and verses is `depth=2, addressTypes=["Integer","Integer"], sectionNames=["Chapter","Verse"]`.
- **Key fields**: Combines all fields from SchemaNode and NumberedTitledTreeNode, plus `referenceableSections`, `isSegmentLevelDiburHamatchil`, `diburHamatchilRegexes`, `index_offsets_by_depth`, `toc_zoom`
- **Key methods**:
  - `__init__` -- Explicitly calls `SchemaNode.__init__` then manually adds `NumberedTitledTreeNode` extras. Does NOT use `super()` due to diamond inheritance.
  - `validate()` -- Calls both parent validates explicitly.
  - `get_index_offset(section_indexes, index_offsets_by_depth)` -- Static. Navigates the nested offset structure to find the offset for a given position.
- **Non-obvious**: `index_offsets_by_depth` is a dict keyed by depth number (as string), containing nested arrays of offsets. Used for texts where section numbering doesn't start at 1. The diamond inheritance between SchemaNode and NumberedTitledTreeNode is carefully managed with explicit `__init__` calls rather than cooperative `super()`.

### StringNode
- **Inherits**: JaggedArrayNode
- **Collection**: N/A
- **Role**: A depth-0 JaggedArrayNode, effectively storing a single string value.
- **Non-obvious**: `serialize()` outputs `nodeType: "JaggedArrayNode"` (not "StringNode") so deserialization treats it as a JaggedArrayNode.

### ArrayMapNode
- **Inherits**: NumberedTitledTreeNode
- **Collection**: N/A
- **Role**: Leaf node of alternate structures (like Parsha divisions of Torah). Contains `wholeRef` and optionally `refs` (a jagged array of ref strings) that map to locations in the primary structure.
- **Key fields**: `wholeRef` (str), `refs` (list of ref strings), `includeSections` (bool), `startingAddress`, `has_key = False`
- **Key methods**:
  - `get_ref_from_sections(sections)` -- Navigates the `refs` array to find the ref at given sections.
  - `serialize(expand_refs=True)` -- When expanding, auto-generates refs from `wholeRef` if `includeSections` is set.
- **Non-obvious**: `has_key = False` means this node is NOT used as schema for content storage -- it's purely a mapping structure. Depth 0 ArrayMapNodes skip NumberedTitledTreeNode validation (they have no addressTypes/sectionNames).

### VirtualNode
- **Inherits**: TitledTreeNode
- **Collection**: N/A
- **Role**: Abstract base for nodes not backed by Version storage (dictionaries, sheets). Sets `is_virtual = True`.
- **Key fields**: `is_virtual = True`, `entry_class` (the class for dynamic child nodes)
- **Key methods**:
  - `create_dynamic_node(title, tref)` -- Factory: instantiates `self.entry_class(self, title, tref)`.
  - `address()` -- Returns PARENT's address (virtual nodes don't add to the address path).

### DictionaryNode
- **Inherits**: VirtualNode
- **Collection**: N/A
- **Role**: Schema node for dictionary-type texts (e.g., Jastrow). Children are `DictionaryEntryNode` instances created on-the-fly from lexicon data.
- **Key fields**: `lexiconName`, `firstWord`, `lastWord`, `headwordMap`, `dictionaryClass` (resolved at init from `LexiconEntrySubClassMapping`)
- **Non-obvious**: `all_children()` is a generator that yields `DictionaryEntryNode` for every entry in the lexicon -- potentially thousands of nodes.

### DictionaryEntryNode
- **Inherits**: TitledTreeNode
- **Collection**: N/A
- **Role**: Virtual node representing a single dictionary entry. Created dynamically by `DictionaryNode`.
- **Key fields**: `word`, `lexicon_entry`, `has_word_match`
- **Non-obvious**: Can be instantiated three ways: (title+tref), (word), or (lexicon_entry). Navigation (`next_leaf`/`prev_leaf`) follows `next_hw`/`prev_hw` links on the lexicon entry. Raises `DictionaryEntryNotFoundError` if word not in lexicon.

### SheetLibraryNode / SheetNode
- **Inherits**: VirtualNode / NumberedTitledTreeNode
- **Role**: Virtual nodes for user-created source sheets. `SheetLibraryNode` is the container; `SheetNode` is created per-sheet on the fly.
- **Non-obvious**: SheetNode loads the sheet document directly from `db.sheets` at init time. It has `depth=2` with sectionNames `["Sheet", "Segment"]`.

### AddressType (and subclasses)
- **Inherits**: object
- **Collection**: N/A
- **Role**: Defines how a single level of a jagged array is addressed (numbered). Each subclass provides regex patterns for matching references in English and Hebrew, and conversion between string and numeric forms.
- **Key fields**: `order` (depth position), `length` (max value, optional), `section_patterns` (dict of lang-specific prefix patterns), `special_cases` (dict of string -> list of numeric possibilities)
- **Key methods**:
  - `regex(lang, group_id, strict, ...)` -- Returns regex component. `strict` requires section name prefix to match.
  - `_core_regex(lang, group_id)` -- Override point for subclasses.
  - `toNumber(lang, s)` -- Converts string like "2a" to integer. Each subclass has its own scheme.
  - `toStr(lang, i)` -- Converts integer to display string.
  - `get_all_possible_sections_from_string(lang, s)` -- Classmethod. Tries ALL ancestor address types via MRO to find possible numeric interpretations. Used for ambiguous inputs.
  - `to_numeric_possibilities(lang, s)` -- Returns list of possible numeric values (handles special cases).
- **Non-obvious patterns**:
  - `AddressTalmud.toNumber`: Uses a 1-indexed scheme where daf 2a = 3, daf 2b = 4 (i.e., `daf * 2 - 1` for amud a, `daf * 2` for amud b). Storage offset is 2 (daf 1 doesn't exist in most tractates).
  - `AddressFolio.toNumber`: 4 amudim per folio: `daf * 4 - 3` for a, `-2` for b, `-1` for c, `daf * 4` for d.
  - `AddressPerek.special_cases`: Maps Hebrew phrases like "perek kama" to `[1, 141]` (ambiguous -- could mean first chapter or gematria value).
  - `AddressInteger.to_numeric_possibilities`: Also tries Roman numeral parsing.
  - `hebrew_number_regex()` is a static method on AddressType that handles three styles of Hebrew numerals: with gershayim, with geresh, or bare letters.

## Non-Obvious Patterns

- **`deserialize_tree()` factory**: The top-level function for reconstructing schema trees from dicts. It uses `globals()` to look up classes by `nodeType` string. The `additional_classes` kwarg can inject external classes into this lookup. Decision logic: if `nodes` key present -> struct node; if `nodeType` present -> that class; else -> `leaf_class` kwarg.

- **Diamond inheritance in JaggedArrayNode**: JaggedArrayNode inherits from both SchemaNode and NumberedTitledTreeNode, which both inherit from TitledTreeNode. The `__init__` and `validate` methods explicitly call specific parent implementations rather than using cooperative `super()`.

- **"default" child cascading**: When a TitledTreeNode has a child with `default=True`, references to the parent automatically resolve to that child. The default child contributes no titles of its own -- it inherits the parent's titles. Only one default child is allowed per node.

- **`sharedTitle` and Terms**: A node can set `sharedTitle` to the name of a `Term`, which causes the node's `title_group` to be replaced with the Term's title_group. This is used for nodes that share names with standard vocabulary (e.g., parsha names).

- **Lazy imports**: The `text` module is imported inside methods (not at top level) to avoid circular imports. Same for `version_state` and `library`.

- **`key` vs title**: `SchemaNode.key` is the storage identifier used in Version content dicts. It's typically set to the primary English title but they CAN diverge. `address()` returns the path of keys, `version_address()` skips the root key.

- **`presentation` on titles**: Controls reference building. `"combined"` (default) means the title is prepended with ancestor titles ("Rashi on Genesis, Bereshit"). `"alone"` means it can be referenced independently. `"both"` means either form works.

- **Hebrew prefix handling in regexes**: `full_regex` includes an optional Hebrew prefix group (`be`, `ke`, `le`, `me`, `she`, `ve`, `de`, and their combinations) so references like "bBereishit 1:2" are matched.

- **`is_virtual` flag**: Virtual nodes (DictionaryNode, SheetLibraryNode) are excluded from `concrete_children()` and from Version storage traversal. They generate content dynamically rather than reading from stored Versions.

- **`index_offsets_by_depth`**: On JaggedArrayNode, allows sections that don't start at 1. It's a dict keyed by depth (as string), with nested arrays of offset values navigated by section indexes.

- **`referenceableSections`**: On JaggedArrayNode and ArrayMapNode, controls which depth levels can be independently referenced. Not all levels of a jagged array necessarily form valid refs.

## Relationships

- **Depends on**:
  - `sefaria.model.abstract` (abst) -- AbstractMongoRecord, SluggedAbstractMongoRecord, AbstractMongoSet
  - `sefaria.system.database` (db) -- Direct MongoDB access for sheets
  - `sefaria.model.lexicon` -- LexiconEntrySet, Lexicon, LexiconEntrySubClassMapping (for DictionaryNode)
  - `sefaria.model.linker.has_match_template` -- MatchTemplateMixin
  - `sefaria.model.linker.context_mutation` -- ContextMutation, ContextMutationOp (for validation)
  - `sefaria.system.exceptions` -- InputError, IndexSchemaError, DictionaryEntryNotFoundError, SheetNotFoundError
  - `sefaria.utils.hebrew` -- Hebrew numeral encoding/decoding
  - `sefaria.utils.talmud` -- `daf_to_section`
  - `sefaria.model.text` (lazy import) -- Ref, TextFamily, TextChunk
  - `sefaria.model.version_state` (lazy import) -- StateNode
  - `sefaria.model.library` (lazy import) -- `library.get_term()`

- **Depended on by**:
  - `sefaria.model.text` -- Index uses schema trees; Ref navigates them
  - `sefaria.model.topic` -- Uses NonUniqueTerm
  - `sefaria.helper.schema` -- Schema manipulation utilities
  - `sefaria.model.autospell` -- Title lookups
  - `sefaria.model.linker.*` -- Reference linking/disambiguation
  - `reader/views.py` -- API views
  - Various scripts and tests

- **Dependency subscriptions**: None (no `notify`/`subscribe` calls in this module).

## Common Tasks

### Create a simple JaggedArrayNode for a new text
```python
node = JaggedArrayNode()
node.add_primary_titles("My Book", "ספר שלי")
node.add_structure(["Chapter", "Verse"])  # depth=2, auto-detects addressTypes
node.key = "My Book"
node.depth = 2
node.validate()
```

### Navigate a schema tree to find a specific node
```python
# From an Index object:
root = index.nodes  # The root SchemaNode
leaf_nodes = root.get_leaf_nodes()  # All content-bearing leaves
node = root.get_child_by_key("Introduction")  # Direct child by key
```

### Build a title-to-node map for reference parsing
```python
title_dict = root.title_dict("en")  # {"Genesis": node, "Bereishit": node, ...}
title_dict_he = root.title_dict("he")
```

### Reconstruct a schema tree from a serialized dict
```python
tree = deserialize_tree(serial_dict, index=my_index)
# Or with custom classes:
tree = deserialize_tree(serial_dict, struct_class=SchemaNode, leaf_class=JaggedArrayNode)
```

### Convert between Talmud daf notation and internal numbering
```python
addr = AddressTalmud(0)
num = addr.toNumber("en", "2a")   # returns 3
s = AddressTalmud.toStr("en", 3)  # returns "2a"
s = AddressTalmud.toStr("he", 3)  # returns "ב א" (daf 2 amud alef)
```

### Get a Ref from a schema node
```python
ref = node.ref()                  # Ref to the entire node
ref = node.first_section_ref()    # Padded ref to first section
ref = node.last_section_ref()     # Uses StateNode to find last content
```

### Traverse a schema tree and build content
```python
# Create empty content skeleton:
skeleton = root.create_skeleton()  # {"NodeA": [], "NodeB": {"SubNode": []}}

# Visit existing content:
result = root.visit_content(my_callback, version_content_dict)
```
