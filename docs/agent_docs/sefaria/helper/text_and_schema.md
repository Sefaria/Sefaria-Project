# Text, Schema, Link, Normalization, Category & Legacy Ref Helpers
> Sources: `sefaria/helper/text.py`, `sefaria/helper/schema.py`, `sefaria/helper/link.py`, `sefaria/helper/normalization.py`, `sefaria/helper/category.py`, `sefaria/helper/legacy_ref.py`

## Purpose

These helpers form the core "librarian toolbox" for restructuring, renaming, merging, and linking texts in the Sefaria library. They sit between the model layer (Index, Version, SchemaNode) and views/scripts, handling the complex cascading side-effects that structural changes require (updating links, sheets, history, notes, user history, alt-structs, manuscripts, web pages, etc.). The normalization module provides a composable pipeline for stripping HTML, cantillation, footnotes, and other noise from text for matching/comparison purposes.

## Key Functions/Classes

### text.py (~910 lines)
- **`add_spelling(category, old, new, lang)`** -- Batch-adds alternate title spellings across all indexes in a category.
- **`rename_category(old, new)`** -- Walks all IndexSet records to rename a category. (Note: a separate, richer `rename_category` exists in `category.py`.)
- **`resize_text(title, new_structure, upsize_in_place)`** -- Changes depth of a simple text (e.g., 2-depth to 3-depth), reshaping stored text arrays. Uses raw pymongo, not model objects.
- **`merge_indices(title1, title2)`** -- Merges two Index records by rewriting versions, links, and history from title2 into title1, then deletes title2.
- **`merge_text_versions(version1, version2, ...)`** -- Merges content of two Versions of the same text; version1 takes priority on overlap. Handles both simple and complex texts via `visit_content`.
- **`modify_text_by_function(title, vtitle, lang, rewrite_function, uid)`** -- Walks every segment of a text and applies a rewrite callback, saving via `tracker.modify_text`.
- **`modify_many_texts_and_make_report(rewrite_function, ...)`** -- Bulk-modifies text segments across versions using pymongo `bulk_write`, returns a CSV report of changes.
- **`split_text_section(oref, lang, old_vtitle, new_vtitle)`** -- Moves text covered by `oref` from one version to another, rewriting history.
- **`find_and_replace_in_text(...)`** -- Simple find/replace across all segments of a text.
- **`replace_roman_numerals(text, ...)`** -- Converts Roman numerals to Arabic in citation-like contexts.
- **`make_versions_csv()` / `get_library_stats()` / `get_core_link_stats()`** -- Reporting utilities that produce CSV output.
- **`dual_text_diff(seg1, seg2)`** -- Side-by-side HTML diff of two text segments using `diff_match_patch`.
- **`get_talmud_perek_ref_set()` / `get_parasha_ref_set()`** -- Cached frozensets of perek-level and parasha-level ref strings, used by the linker disambiguation system.
- **`WorkflowyParser`** -- Parses Workflowy OPML exports into Index schema (SchemaNode/JaggedArrayNode trees), optionally creating the Index and Version records. Supports custom delimiters, term schemes, and embedded text in notes.
- **`change_term_hebrew(en_primary, new_he)`** -- Updates the primary Hebrew title of a Term.
- **`change_lexicon_headword(parent_lexicon, old, new)`** -- Renames a dictionary entry headword, cascading through adjacent entries, the index's DictionaryNode, word forms, and all refs.

### schema.py (~1121 lines)
- **`attach_branch(new_node, parent_node, place)`** -- Inserts a new SchemaNode into a parent at a given position. Updates all Versions (adding skeleton content), saves Index, rebuilds library, refreshes VersionState, and handles dependent commentaries.
- **`insert_first_child` / `insert_last_child`** -- Convenience wrappers around `attach_branch`.
- **`remove_branch(node)`** -- Deletes a schema node and its text content from all versions, plus its linkset.
- **`reorder_children(parent_node, new_order)`** -- Reorders children of a schema node by key list.
- **`merge_default_into_parent(parent_node)`** -- When a parent has a single default child, collapses them into one JaggedArrayNode.
- **`convert_jagged_array_to_schema_with_default(ja_node)`** -- Wraps a JaggedArrayNode inside a SchemaNode with a default child. Inverse of `merge_default_into_parent`.
- **`convert_simple_index_to_complex(index)`** -- Converts a simple (single JaggedArray) Index to a complex schema with a default node. All existing refs remain valid.
- **`change_parent(node, new_parent, place, exact_match)`** -- Moves a node from one parent to another within the same Index. Rewrites version content, links, and cascades.
- **`change_node_title(snode, old_title, lang, new_title)`** -- Renames a schema node title, cascading if it is the primary English title.
- **`change_node_structure(ja_node, section_names, address_types, upsize_in_place)`** -- Resizes a JaggedArrayNode's depth. Handles link ref rewriting via `cascade()`, version content resizing, and dependent indices.
- **`cascade(ref_identifier, rewriter, needs_rewrite)`** -- The universal "ref rewriter": given a regex-matchable ref and a rewriter callback, updates Links, Notes, UserHistory, RefData, TopicLinks, GardenStops, Sheets, AltStructs, MarkedUpTextChunks, Manuscripts, WebPages, and History. This is the single most important function for maintaining referential integrity after structural changes.
- **`generate_segment_mapping(title, mapping)` / `migrate_to_complex_structure(title, schema, mappings)`** -- Converts a simple-structure text to a complex structure using a user-provided mapping of old refs to new refs. Creates a temporary index, migrates versions, cascades all refs, then renames.

### link.py (~636 lines)
- **`AbstractAutoLinker`** -- Base class defining the autolinker interface: `build_links`, `refresh_links`, `delete_links`, `rebuild_links`. Stores link metadata (`generated_by`, `auto`, `link_type`).
- **`AbstractStructureAutoLinker`** -- Links two structurally identical texts. Recursively walks content nodes to create one-to-one or many-to-one link mappings.
- **`CommentaryAutoLinker` (class_key `'many_to_one'`)** -- The classic commentary linker: each terminal segment group in the commentary links to the corresponding section-level segment in the base text (e.g., Rashi on Genesis 1:1:1 links to Genesis 1:1).
- **`MatchBaseTextDepthAutoLinker` (class_key `'one_to_one'`)** -- Links commentary segments 1:1 with base text segments (same depth).
- **`CommentaryDefaultOnlyAutoLinker` / `MatchBaseTextDepthDefaultOnlyAutoLinker`** -- Variants that only link default nodes, ignoring non-default complex text children.
- **`AutoLinkerFactory`** -- Factory that maps `base_text_mapping` attribute values to autolinker classes.
- **`add_links_from_text(oref, lang, text, text_id, user)`** -- Scans text for inline citations using `library.get_refs_in_string()`, creates citation links, and removes stale ones. The primary mechanism for citation-based linking.
- **`rebuild_links_for_title(tref, user)`** -- Convenience for rebuilding autolinks for a whole book.
- **`create_link_cluster(refs, user, ...)`** -- Creates links between all pairs in a list of refs, with support for exception pairs/ranges.

### normalization.py (~588 lines)
- **`AbstractNormalizer`** -- Base class with `normalize(s)` and `find_text_to_remove(s)`. The two-method design allows normalizers to both transform text AND report exactly which character ranges were changed, enabling index mapping between normalized and unnormalized strings.
- **`get_mapping_after_normalization(text)` / `norm_to_unnorm_indices(text, normalized_indices)`** -- Core index-mapping methods. Given a normalized string and positions within it, map back to positions in the original unnormalized string. Critical for the linker.
- **`RegexNormalizer` / `ReplaceNormalizer` / `TableReplaceNormalizer` / `FootnoteNormalizer` / `FunctionNormalizer`** -- Concrete normalizer implementations for regex, string replacement, lookup tables, footnote stripping, and custom functions.
- **`NormalizerComposer`** -- Chains multiple normalizers sequentially while correctly composing their index mappings. The `find_text_to_remove` implementation iteratively applies reverse mappings to produce correct indices in the original string.
- **`NormalizerFactory`** -- Registry of named normalizers (e.g., `"html"`, `"cantillation"`, `"footnote"`, `"unidecode"`, `"maqaf"`, `"double-space"`).
- **`NormalizerByLang`** -- Applies different normalizers based on language.
- **`char_indices_from_word_indices` / `word_index_from_char_index`** -- Utilities for converting between word-level and character-level indices.
- **`TextSanitizer`** -- Manages the lifecycle of sanitizing a list of segments for use with `dibbur_hamatchil_matcher`.
- **`UNIDECODE_TABLE`** -- Mapping of special Unicode characters (accented Latin, Hebrew geresh/gershayim, smart quotes) to ASCII equivalents.

### category.py (~228 lines)
- **`move_index_into(index, cat)`** -- Moves an Index into a different category.
- **`rename_category(cat, en, he)`** -- Renames a category, creating a Term if needed. Cascades to all child categories and indexes.
- **`move_category_into(cat, parent)`** -- Moves an entire category subtree under a new parent (or to root).
- **`create_category(path, en, he, searchRoot, order)`** -- Creates a new Category at a given path, creating a Term if one doesn't exist.
- **`update_order_of_category_children(cat, uid, subcategoriesAndBooks)`** -- Reorders subcategories and books within a category, used by the ReorderEditor.
- **`check_term(last_path, he_last_path)`** -- Validates that English and Hebrew titles correspond to the same Term, creating one if neither exists.
- **`get_category_paths(path)`** -- Returns all child category paths one level below a given path.

### legacy_ref.py (~196 lines)
- **`LegacyRefParsingData`** -- Mongo-backed storage for old-ref-to-new-ref mappings. Keyed by `index_title`.
- **`MappingLegacyRefParser`** -- Parses legacy refs using a stored mapping dict. Handles both segment-level and ranged refs (within a single section). Converts trefs to URL form before lookup.
- **`LegacyRefParserHandler`** -- Singleton-like handler (pattern from Django's CacheHandler) that lazily loads and caches parsers by index title. Raises `NoLegacyRefParserError` when no mapping exists.
- **`legacy_ref_parser_handler`** -- Module-level instance of `LegacyRefParserHandler`. Access via `legacy_ref_parser_handler["Zohar"]`.

## Non-Obvious Patterns

1. **`cascade()` is the single point of referential integrity.** Any schema/title change that affects refs MUST call `cascade()` to update all dependent data across ~15 different collections. Forgetting this causes orphaned links, broken sheets, and stale search results.

2. **`override_dependencies=True` is used liberally** in schema.py to bypass validation that would reject mid-migration states. The code first makes structural changes, then fixes dependent data.

3. **Normalization is index-preserving by design.** Every normalizer can report both the transformed string AND a mapping from positions in the transformed string back to the original. This is essential for the linker, which finds refs in normalized text but needs to report positions in the original.

4. **`NormalizerComposer.find_text_to_remove`** applies each step's reverse mapping iteratively to earlier steps' removal indices. This is "mind-boggling" (per the source comment) but necessary for correct multi-step index composition.

5. **`resize_text` uses raw pymongo** (`db.index`, `db.texts`) rather than model objects. The comment notes it "needs to be converted to objects." Similarly, `modify_many_texts_and_make_report` uses `db.texts` directly for performance.

6. **Legacy ref parsing** is specifically designed for texts like Zohar that underwent structural reorganization. The mapping is stored in MongoDB (`legacy_ref_data` collection) and loaded lazily.

7. **The autolinker hierarchy** uses a factory pattern keyed by `Index.base_text_mapping` to select the right linking strategy. The `class_key` attribute on each linker class is the factory lookup key.

8. **`WorkflowyParser`** is a full schema-creation pipeline from Workflowy OPML exports. It can create Index records, Version records with text from outline notes, and Term schemes. Depth is indicated by bracket notation in outline titles (e.g., `[2]` or `[Chapter, Verse]`).

## Relationships

- **text.py** and **schema.py** both call into `cascade()` for ref rewriting. schema.py owns the implementation.
- **schema.py** calls `handle_dependant_indices()` after every structural change to reset `base_text_mapping` on dependent commentaries.
- **link.py** is invoked by `texts_api` views when text is saved (via `add_links_from_text`), and by management scripts for bulk relinking.
- **normalization.py** is consumed by the linker (`sefaria/helper/linker/`) and by `dibbur_hamatchil_matcher` for text matching.
- **category.py** is used by the Category/Reorder editors in the admin interface and by data migration scripts.
- **legacy_ref.py** is consumed by `Ref` resolution code to handle URLs/refs that use old numbering schemes.

## Common Tasks

- **Add a new section to a complex text:** Use `attach_branch()` from schema.py, passing a new JaggedArrayNode.
- **Rename a book or node:** Use `change_node_title()` (schema.py) for nodes, or modify the Index title and call `cascade()`.
- **Merge duplicate versions:** Use `merge_text_versions()` from text.py.
- **Convert simple text to complex:** Use `convert_simple_index_to_complex()` or `migrate_to_complex_structure()`.
- **Bulk find-and-replace in text content:** Use `modify_text_by_function()` or `modify_many_texts_and_make_report()`.
- **Strip HTML/cantillation for matching:** Use `NormalizerComposer` with keys like `["html", "cantillation", "maqaf"]`.
- **Move a book to a different category:** Use `move_index_into()` from category.py.
- **Create a new category:** Use `create_category()` from category.py.
- **Parse a legacy ref (e.g., old Zohar numbering):** Use `legacy_ref_parser_handler[index_title].parse(legacy_tref)`.
