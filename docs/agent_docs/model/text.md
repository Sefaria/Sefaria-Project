# text.py
> Source: `sefaria/model/text.py` (~6500 lines)

## Purpose
The gravitational center of the Sefaria model layer. Defines how texts are structured (Index), stored (Version), read (TextChunk/TextFamily), referenced (Ref), and discovered (Library). Every text operation in Sefaria flows through this module.

## Key Classes

### Index
- **Inherits**: `AbstractMongoRecord`, `AbstractIndex`
- **Collection**: `index`
- **Role**: Defines a text/book -- its name, categories, schema tree, and metadata. One Index per text in the system.
- **Key fields**:
  - `title` -- Virtual property (getter/setter via `get_title`/`set_title`). The setter updates `_title`, `nodes.key`, and the title group simultaneously.
  - `categories` -- list of strings, e.g. `["Tanakh", "Torah"]`. Must already exist in the Category collection.
  - `schema` -- serialized schema tree. On load, deserialized into `self.nodes` (a tree of `TitledTreeNode` subclasses).
  - `nodes` -- the live schema tree object. NOT stored directly in Mongo; serialized to/from `schema`.
  - `alt_structs` -- optional alternate navigational structures (e.g. parsha divisions for Torah). Deserialized into `self.struct_objs`.
  - `dependence` -- `"Commentary"` or `"Targum"` for dependent texts; `None` for standalone.
  - `base_text_titles` -- list of titles this text depends on (FK to other Index titles).
  - `collective_title` -- groups related indices (e.g. "Rashi"), must match a Term.
  - `corpora` -- list of corpus identifiers; first element is the primary corpus.
- **Key methods**:
  - `contents(raw, with_content_counts, ...)` -- When `raw=False` (default), returns an expanded dict via `nodes.as_index_contents()` with legacy fields, metadata, etc. When `raw=True`, returns the bare Mongo document. With `with_content_counts=True`, annotates schema nodes with segment counts from VersionState.
  - `load_from_dict(d)` -- Overridden to handle old-style records without a `schema` key. Builds a JaggedArrayNode on the fly. Also handles `oldTitle` for renaming.
  - `_normalize()` -- Title-cases the first letter, strips deprecated attrs, syncs title across `self.title` / `nodes.key` / `nodes.primary_title()` when any changes. Deletes legacy fields like `titleVariants`, `sectionNames`, etc.
  - `_validate()` -- Enforces ASCII-only titles, no special chars, valid categories, no duplicate titles across the library. Calls `nodes.validate()` and validates alt structures.
  - `is_complex()` -- True if the schema tree has children (multi-node structure).
  - `all_titles(lang)` -- Returns all titles from the entire schema tree for the given language.
  - `referenceable_children()` -- Returns default struct children + alt struct roots. Used by the linker for ref resolution traversal.
- **Gotchas**:
  - `track_pkeys = True` with `pkeys = ["title", "compPlace", "pubPlace"]`. On save, if `title` changes, a cascade of dependency subscriptions fires (see Dependency Subscriptions below).
  - `criteria_override_field = 'oldTitle'` -- when updating via the API with a title change, the record is looked up by `oldTitle`.
  - `DISABLE_INDEX_SAVE` setting can globally prevent Index saves (used in read-only deployments).
  - `update_from_dict()` bypasses the custom `load_from_dict()` by calling `super().load_from_dict()` directly.
  - `_update_alt_structs_on_title_change()` does string replacement of the old title inside all `wholeRef`/`refs` in alt struct nodes -- fragile if titles are substrings of each other.

### Version
- **Inherits**: `AbstractTextRecord`, `AbstractMongoRecord`, `AbstractSchemaContent`
- **Collection**: `texts`
- **Role**: A single translation or edition of a text. Contains the actual text content in a jagged array structure.
- **Key fields**:
  - `title` -- FK to `Index.title`.
  - `versionTitle` -- unique within a title+language pair.
  - `language` -- `"en"` or `"he"` (legacy binary; `"he"` means all RTL languages).
  - `actualLanguage` -- ISO 639 code for the real language (e.g. `"jrb"` for Judeo-Arabic).
  - `languageFamilyName` -- human-readable language family name (e.g. `"arabic"`).
  - `isSource` / `isPrimary` -- booleans. At least one version per Index must be `isPrimary=True`.
  - `direction` -- `"rtl"` or `"ltr"`.
  - `chapter` -- the content field. Despite the name, holds the entire text content as a nested dict (for complex texts) or jagged array (for simple texts). Aliased as `content_attr`.
  - `priority` -- float; higher priority versions are preferred in merges. VersionSet default sort is `[["priority", -1], ["_id", 1]]`.
- **Key methods**:
  - `_sanitize()` -- **Intentional no-op**. Sanitization is done at the TextChunk level on save, not on Version save.
  - `_normalize()` -- Auto-detects `actualLanguage` from bracket notation in versionTitle (e.g. `"[ar]"`), sets defaults for `isSource`, `isPrimary`, `direction`, `languageFamilyName`. Trims ending whitespace.
  - `ja(remove_html)` -- For complex texts (dict content), iterates leaf nodes and wraps each in a JaggedTextArray. For simple texts, delegates to parent.
  - `walk_thru_contents(action)` -- Iterates every segment, calling `action(segment_str, tref, he_tref, version)`. Handles complex schemas, virtual nodes, and index offsets.
  - `content_node(snode)` -- Returns the content subtree for a given schema node by traversing `version_address()`.
  - `first_section_ref()` -- Finds the first non-empty section across all leaf nodes.
- **Gotchas**:
  - `track_pkeys = True` with `pkeys = ["title", "versionTitle"]`. Title changes cascade to history and search.
  - `_validate()` enforces `isPrimary` constraint: at least one version must be primary.
  - MRO matters: `AbstractTextRecord` comes before `AbstractMongoRecord` so that `ALLOWED_TAGS` from `AbstractTextRecord` takes precedence.
  - The `chapter` field name is a historical artifact. The codebase has comments about renaming it to `content` but this has not been done.

### AbstractTextRecord
- **Inherits**: `object` (mixin)
- **Collection**: N/A
- **Role**: Mixin providing text-content methods for both Version and TextChunk. Defines how text is accessed, sanitized, and transformed.
- **Key fields**:
  - `text_attr` -- class-level string defining which attribute holds the text content. `"chapter"` for Version, `"text"` for TextChunk.
  - `ALLOWED_TAGS` / `ALLOWED_ATTRS` -- HTML whitelist from `constants.py`, used by `sanitize_text()`.
- **Key methods**:
  - `ja(remove_html)` -- Wraps `getattr(self, text_attr)` in a `JaggedTextArray`. Does NOT cache locally.
  - `sanitize_text(t)` -- Class method. Recursively applies `bleach.clean()` with the allowed tags/attrs whitelist.
  - `strip_itags(s)` -- Strips inline footnotes, other inline tags, and footnote markers using NormalizerFactory.
  - `_get_text_after_modifications(funcs, start_sections)` -- Applies a list of modifier functions to each segment. Used by TextFamily for link wrapping and itag stripping.
  - `as_sized_string(min_char, max_char)` -- Extracts a starting substring suitable for previews, trying to break on segment boundaries, then punctuation, then spaces.
  - `_trim_ending_whitespace()` -- Removes blank segments from the end of every section.
- **Gotchas**:
  - `_sanitize()` on this class DOES sanitize. But Version overrides it to be a no-op. The actual sanitization for edits happens in `TextChunk.save()` which calls `self._sanitize()` (inheriting from AbstractTextRecord, not Version).
  - `remove_html()` replaces `<br>` tags with spaces, not empty strings.

### TextChunk
- **Inherits**: `AbstractTextRecord`, metaclass=`TextFamilyDelegator`
- **Collection**: N/A (operates on Version records)
- **Role**: Read-write access to text at a specific Ref, language, and optional version. The primary interface for reading and writing text content.
- **Key fields**:
  - `text` -- the text content at the given Ref (after trimming from the full Version content).
  - `_original_text` -- snapshot at load time; compared on save to detect changes.
  - `_saveable` -- bool. Only True when both `lang` and `vtitle` are explicitly provided (not merged).
  - `is_merged` -- True if text was merged from multiple versions.
  - `sources` -- list of versionTitle strings indicating which version supplied each segment (only meaningful when merged).
  - `_oref` -- the Ref this chunk corresponds to.
  - `lang` -- `"en"` or `"he"`.
  - `full_version` -- populated on save; the complete Version record.
- **Key methods**:
  - `__init__(oref, lang, vtitle, ...)` -- If vtitle is provided, loads that specific version (saveable). Otherwise, queries for all matching versions and merges if multiple exist. The `TextFamilyDelegator` metaclass intercepts construction: if `oref.index_node.is_virtual`, returns a `VirtualTextChunk` instead.
  - `save(force_save)` -- Asserts `_saveable` and non-range. Loads the FULL Version document, pads the content to the required depth, sets the segment, and saves the entire Version. There are NO atomic segment-level updates. After save, recalibrates next/prev refs and updates link language availability.
  - `trim_text(txt)` -- Trims text loaded via `part_projection()` to match the Ref's sections/toSections. Handles ranges of arbitrary depth.
  - `_pad(content)` -- Pads the content array with empty strings/arrays to accommodate the Ref's section addresses. Operates in-place.
  - `_validate()` -- Checks that the depth of `self.text` matches the depth implied by the Ref.
  - `text_index_map(tokenizer)` -- Returns (index_list, ref_list, total_word_count) mapping word positions to segment refs. Primarily for depth-2 texts.
  - `nonempty_segment_refs()` -- Returns list of segment-level Refs that have content.
- **Gotchas**:
  - **Mutable aliasing trap**: `self.text` and `self._original_text` initially point to the same object. If you mutate `self.text` in place (e.g. `self.text[3] = "..."`) both change, so save detects no change. Use `force_save=True` for in-place edits.
  - **Non-JaggedArrayNode refs are silently redirected**: If the oref points to a non-JaggedArrayNode, the constructor follows `default_child_ref()` to find a content node.
  - **Merge behavior**: When multiple versions exist and no vtitle is specified, versions are merged by priority. If all merged segments come from one version, `is_merged` stays False.
  - `_choose_version_by_lang()` uses `prioritized_vtitle` to optionally bump a specific version to the front of the merge. When prioritized_vtitle is set, actual_lang filtering is skipped.
  - `actual_lang` parameter finds versions by ISO language code within the he/en binary. E.g., `actual_lang="ar"` finds Arabic versions within the `he` language bucket. Patterns filter out bracket-notation versions when actual_lang is `en` or `he`.

### TextFamily
- **Inherits**: `object`
- **Collection**: N/A
- **Role**: Bilingual text wrapper for the v1/v2 text API. Loads en + he TextChunks, optionally fetches commentary links, and serializes everything into an API-friendly dict.
- **Key fields**:
  - `text` -- English text content.
  - `he` -- Hebrew text content.
  - `_chunks` -- dict keyed by `"en"`/`"he"` holding the TextChunk objects.
  - `commentary` -- list of link dicts (if commentary=True).
  - `versions` -- list of version metadata dicts.
  - `_alts` -- alt structure decorations for the Ref range.
- **Key methods**:
  - `__init__(oref, context, commentary, version, lang, pad, alts, wrapLinks, stripItags, ...)` -- Pads the ref by default. Creates TextChunks for en and he, applies text modification functions (link wrapping, itag stripping), fetches commentary links, version list, and alt structure decorations.
  - `contents()` -- Serializes to dict. Includes version metadata via `attr_map` (which maps Version attrs to prefixed API field names like `heVersionTitle`, `versionTitleInHebrew`, etc.), section info, Talmud daf formatting, and more.
- **Gotchas**:
  - **Naming conflict in attr_map**: `versionTitle` refers to the English title of the English version, `heVersionTitle` refers to the English title of the Hebrew version. `versionTitleInHebrew` is the Hebrew translation of the English version's title. This is confusing and documented in the code.
  - `pad=True` by default pads the ref to section level. Setting `pad=False` with a book-level ref on a commentary can produce unexpected results.
  - `translationLanguagePreference` is passed as `actual_lang` to the English TextChunk only.
  - `fallbackOnDefaultVersion` is passed through to TextChunk but TextChunk only uses it in the `lang+vtitle` branch (to allow fallback when the requested version doesn't exist).

### Ref
- **Inherits**: `object`, metaclass=`RefCacheType`
- **Collection**: N/A (references Index/Version records)
- **Role**: A parsed citation pointing to a location in the text corpus. Immutable after creation. The most instantiated object in the system.
- **Key fields** (all in `__slots__`):
  - `index` -- the Index object.
  - `book` -- full English title of the index_node (may differ from `index.title` for complex texts).
  - `index_node` -- the schema node this Ref points to.
  - `sections` -- list of ints, 1-based. E.g., `[2, 3]` for "Genesis 2:3".
  - `toSections` -- list of ints, 1-based. For ranges, differs from `sections`. For point refs, equals `sections`.
  - `primary_category` -- string, e.g. `"Tanakh"` or `"Commentary"`.
  - `tref` -- the cleaned textual reference string.
  - `orig_tref` -- the original input string before cleaning.
  - `_lang` -- `"en"` or `"he"`, auto-detected from tref.
  - Lazy-computed: `_normal`, `_he_normal`, `_url`, `_next`, `_prev`, `_padded`, `_context`, `_first_spanned_ref`, `_spanned_refs`, `_ranged_refs`, `_range_depth`, `_range_index`.
- **Key methods**:
  - `__init__(tref, _obj)` -- Two construction paths: (1) parse a tref string via `__init_tref()`, or (2) accept a pre-built `_obj` dict. The `_obj` path is used internally for efficient Ref construction without reparsing.
  - `__init_tref()` -- The ~200-line parsing engine. Steps: split on `-` for ranges, look up title in `library.get_title_node_dict()`, try term dict fallback, strip characters from end until title matches, handle `checkFirst` pattern for Talmud (tries Mishnah match first), handle virtual nodes, numbered structure nodes, alt structure matching, and range-end parsing.
  - `normal(lang)` / `he_normal()` -- Cached string representations. Handles special Talmud address formatting.
  - `uid()` -- `normal()` + `"<d>"` suffix for default nodes (to distinguish from parent).
  - `section_ref()` / `top_section_ref()` -- Navigate up. `section_ref()` goes up one level; `top_section_ref()` goes to the highest section level.
  - `context_ref(level)` -- Zoom out by `level` levels. Cached per level.
  - `padded_ref()` -- Pads with 1s to section level. Special case: Talmud with no daf specified pads to daf 2a (section 3) for Bavli, daf 1a (section 1) for Rif.
  - `next_section_ref()` / `prev_section_ref()` -- Finds next/prev non-empty section. Traverses across schema leaf nodes. Cached.
  - `split_spanning_ref()` -- Breaks a spanning range into per-section refs. Recursive for range_depth > 2.
  - `condition_query(lang, actual_lang)` -- Generates a MongoDB query dict for finding Versions with content at this Ref. Handles spanning refs by OR-ing sub-queries.
  - `part_projection()` -- Generates a MongoDB projection using `$slice` for efficient partial document retrieval. Uses a "hacky_dummy_key" trick to suppress sibling content in complex texts.
  - `all_segment_refs()` -- Returns all leaf-level refs. Only works for JaggedArrayNode, DictionaryEntryNode, or SheetNode.
  - `contains(other)` / `overlaps(other)` / `precedes(other)` / `follows(other)` -- Spatial comparisons. `contains` may trigger `as_ranged_segment_ref()` for less-specific refs (database lookup).
  - `in_terms_of(other)` -- Returns sections relative to a containing ref. E.g., `Ref("Genesis 6:3").in_terms_of(Ref("Genesis"))` returns `[6, 3]`.
  - `text(lang, vtitle)` -- Convenience: returns `TextChunk(self, lang, vtitle)`.
  - `order_id()` -- Unique ordering string across the catalog, based on category path and section numbers.
  - `distance(ref, max_dist)` -- Number of segments between two refs. Returns -1 for different index nodes.
- **Gotchas**:
  - **`RefCacheType` metaclass**: All Ref instances are cached in an LRU OrderedDict (~60k limit from remote config). Cache keys are both the input tref and the normalized `uid()`. The cache is global and survives across requests. `Ref.clear_cache()` wipes everything.
  - **`__slots__`**: Refs cannot have arbitrary attributes. This is for memory efficiency since millions can exist.
  - **Immutability contract**: Refs are treated as immutable after creation but are not technically frozen. Mutating a cached Ref corrupts all references to it.
  - **`checkFirst` pattern**: For Talmud, `__init_tref()` first tries to match as a Mishnah reference. If that fails validation, it backs out and tries as Talmud. This means some Mishnah refs parse as Talmud refs and vice versa.
  - **Range index/depth**: `range_index()` returns the depth at which the range begins (0 for chapter-level ranges). `range_depth()` returns how many levels the range covers. A non-range ref has `range_index = node.depth` and `range_depth = 0`.
  - **Spanning refs**: A ref that crosses section boundaries (e.g., "Genesis 2:3-4:5"). `is_spanning()` checks if `span_size() > 1`. Many methods require splitting spanning refs first.
  - **`_obj` construction**: When using `_obj`, sections are passed in directly (no parsing). The caller is responsible for correctness. Used extensively internally for efficiency.
  - **`instantiate_ref_with_legacy_parse_fallback(tref)`**: Tries normal parsing, then legacy ref parser, then falls back to partial match. Sets `legacy_tref` attribute on successful legacy parse.

### Library
- **Inherits**: `object`
- **Collection**: N/A (singleton)
- **Role**: The singleton `library` instance. Stewards all in-memory indexes, title maps, TOC trees, autocompleters, and term mappings. The bridge between the database and the rest of the application.
- **Key fields**:
  - `_index_map` -- dict mapping title string to Index object.
  - `_title_node_maps` -- `{lang: {title: SchemaNode}}`. The primary lookup for Ref parsing.
  - `_index_title_maps` -- `{lang: {index_key: [list of titles]}}`. Inverse of title_node_maps.
  - `_term_ref_maps` -- `{lang: {term_title: ref_string}}`. Maps Term titles to their target refs.
  - `_toc_tree` -- `TocTree` object.
  - `_full_auto_completer` / `_lexicon_auto_completer` / `_cross_lexicon_auto_completer` -- AutoCompleter instances.
  - `_full_title_lists` -- cached lists of all titles, keyed by lang and citing-only flag.
  - `_title_regexes` -- compiled regex objects for matching any known title.
  - `_simple_term_mapping` / `_full_term_mapping` -- Term name to titles/objects.
  - `_topic_mapping` -- slug to `{en, he}` title dict.
  - `_virtual_books` -- list of titles for indexes with `lexiconName`.
- **Key methods**:
  - `__init__()` -- Stage 1 init. Only builds term mappings. Everything else is lazy.
  - `_build_index_maps()` -- Stage 2. Loads all IndexSet records, builds `_index_map`, `_title_node_maps`, `_index_title_maps`. Called lazily.
  - `rebuild(include_toc, include_auto_complete)` -- Nuclear option. Rebuilds all index maps, clears title caches, clears Ref cache, resets in_memory_cache. Expensive.
  - `rebuild_toc()` -- Rebuilds TOC tree and all derived JSON caches.
  - `init_shared_cache(rebuild)` -- Populates shared cache (Redis) with TOC, terms, topics, etc. Called on startup.
  - `get_index(bookname)` -- Factory. Returns cached Index or looks up by title in title_node_maps.
  - `add_index_record_to_cache(index_object)` / `remove_index_record_from_cache()` / `refresh_index_record_in_cache()` -- Incremental cache updates without full rebuild.
  - `get_title_node_dict(lang)` -- Returns `{title: SchemaNode}` map. Core lookup for Ref parsing.
  - `get_term_dict(lang)` -- Returns `{term_title: ref_string}` map. Used for term-to-ref resolution during Ref parsing.
  - `all_titles_regex(lang, with_terms, citing_only)` -- Returns compiled regex matching any known title. Uses re2 with 512MB memory limit.
  - `get_refs_in_string(st, lang, citing_only)` -- Finds all Refs in a string. Different strategies for en (anchored per match) vs he (braces-bounded).
  - `get_wrapped_refs_string(st, lang, ...)` -- Returns input string with detected refs wrapped in `<a>` tags. Skips already-wrapped refs.
  - `is_initialized()` -- True when TOC tree and all autocompleters are ready.
  - `get_indexes_in_category(category)` / `get_dependant_indices(book_title, dependence_type)` -- Query helpers.
- **Gotchas**:
  - **Three-stage init**: (1) Term maps on file load (`Library.__init__()`), (2) Index maps built **eagerly** at import time — `__init__.py` line 52 calls `library._build_index_maps()` during `from sefaria.model import *`, (3) TOC tree and autocompleters built lazily on first reader/views load. Stage 2 is NOT lazy despite the deferred pattern — it runs synchronously on module import.
  - **Singleton**: Instantiated at module bottom as `library = Library()`. Imported everywhere.
  - **Shared cache pattern**: Many getters follow a three-tier pattern: (1) check instance variable, (2) check shared cache (Redis), (3) build from scratch. The `rebuild` parameter bypasses tiers 1 and 2.
  - **`all_titles_regex` uses re2** (not stdlib re) with a 512MB memory limit. The compiled regex objects must NOT be stored in Redis (they get corrupted).
  - **`rebuild()` clears `Ref.clear_cache()`** and `in_memory_cache.reset_all()`. This is very disruptive to running processes.
  - **Autocompleter rebuild-on-demand**: If an autocompleter is missing, accessor methods rebuild it with a warning. This can cause performance issues if called repeatedly.

## Non-Obvious Patterns

- **TextFamilyDelegator metaclass**: `TextChunk.__init__()` never runs for virtual nodes. The metaclass `TextFamilyDelegator.__call__()` inspects `oref.index_node.is_virtual` and returns a `VirtualTextChunk` instead. This is invisible to callers.

- **Save path for text edits**: TextChunk.save() loads the ENTIRE Version document from MongoDB, modifies the relevant segment in memory, and saves the whole document back. There is no atomic segment-level update. This means concurrent edits to different segments of the same Version can overwrite each other.

- **Version.`_sanitize()` is a no-op**: HTML sanitization for text edits happens only in `TextChunk.save()`, which calls `AbstractTextRecord._sanitize()` (the mixin method), not `Version._sanitize()` (the override). This is because versions may be loaded from the DB with content that shouldn't be re-sanitized.

- **`part_projection()` hack for complex texts**: To avoid loading the entire Version document, `part_projection()` generates a MongoDB projection with `$slice`. For complex texts, it adds a fake key `"hacky_dummy_key"` at the sibling level to suppress other branches of the content tree.

- **Ref caching is by both input tref and normalized uid**: If you create `Ref("gen 1:1")`, it gets cached under both `"gen 1:1"` and `"Genesis 1:1"`. Future calls with either string return the same object.

- **Talmud padding**: `padded_ref()` for a bare Talmud ref (e.g., "Berakhot") pads to daf 2a (internal section 3) for Bavli, daf 1a (section 1) for Rif texts. This is a domain-specific convention.

- **`sub_content()` returns by reference**: `AbstractSchemaContent.sub_content()` returns a reference into the Version's content tree, not a copy. Modifications to the returned value modify the Version in memory. This is used intentionally by `TextChunk.save()` via `_pad()` and `sub_content(..., value)`.

- **`merge_texts()` is recursive and priority-ordered**: Versions are sorted by priority (descending), then by `_id`. The first non-empty segment wins. For depth > 2, the source mapping is flattened and loses per-segment attribution.

- **`condition_query()` with `actual_lang`**: Uses a raw Python `re.compile()` (not re2) because pymongo cannot serialize re2 pattern objects. The regex `^(?!.*\[[a-z]{2}\]$).*` for actual_lang in {en, he} filters OUT bracket-notation versions.

- **Index `_normalize()` syncs three title locations**: `self.title`, `self.nodes.key`, and `self.nodes.primary_title("en")` must all match. If any one changes, the others are updated. This is checked with a precedence order loop.

- **TextRange**: A newer class (v3 API) intended to eventually replace TextChunk. Currently read-only. Uses `languageFamilyName` instead of the binary `language` field. Not yet used for saves.

## Relationships

- **Depends on**:
  - `sefaria.model.abstract` -- `AbstractMongoRecord`, `AbstractMongoSet`, `subscribe`
  - `sefaria.model.schema` -- `JaggedArrayNode`, `TitledTreeNode`, `VirtualNode`, `DictionaryNode`, `AltStructNode`, `Term`, `TermSet`, `TitleGroup`, `AddressTalmud`, `AddressType`, etc.
  - `sefaria.model.version_state` -- `VersionState`, `StateNode` (lazy imports)
  - `sefaria.model.category` -- `Category`, `TocTree` (lazy imports)
  - `sefaria.model.link` -- `Link`, `LinkSet` (lazy imports)
  - `sefaria.model.topic` -- `Topic`, `AuthorTopic` (lazy imports)
  - `sefaria.model.place`, `sefaria.model.timeperiod` -- lazy imports for metadata
  - `sefaria.datatype.jagged_array` -- `JaggedTextArray`, `JaggedArray`
  - `sefaria.system.database` -- `db` (direct MongoDB access)
  - `sefaria.system.cache` -- `in_memory_cache`, `scache` (shared cache/Redis)
  - `sefaria.helper.normalization` -- `NormalizerFactory`
  - `sefaria.helper.link` -- `AutoLinkerFactory`
  - `sefaria.helper.legacy_ref` -- `legacy_ref_parser_handler`
  - `sefaria.model.linker` -- Linker, RefResolver, MatchTemplateTrie (for Library)
  - `sefaria.client.wrapper` -- `get_links` (for TextFamily)

- **Depended on by**: Nearly every module in the system. Key dependents:
  - `sefaria.model.link` -- Links reference Refs
  - `sefaria.model.version_state` -- Tracks text availability per Index
  - `sefaria.model.topic` -- Topic links reference Refs
  - `sefaria.model.note` -- Notes reference Refs
  - `sefaria.model.history` -- History records reference Refs and Versions
  - `sefaria.model.ref_data` -- Ref metadata
  - `sefaria.model.manuscript` -- Manuscript links reference Refs
  - `sefaria.model.collection` -- Collections contain Refs
  - `sefaria.client.wrapper` -- API serialization
  - `sefaria.search` -- Search indexing
  - `reader/views.py` -- All text API endpoints

- **Dependency subscriptions** (from `dependencies.py`):
  - **Index save**: `process_index_change_in_core_cache`, `create_version_state_on_index_creation`, `process_index_change_in_toc`
  - **Index title change**: `process_index_title_change_in_core_cache`, `process_index_title_change_in_versions` (updates all Version.title), `process_index_title_change_in_links`, `process_index_title_change_in_notes`, `process_index_title_change_in_history`, `process_index_title_change_in_dependant_records`, `process_index_title_change_in_sheets`, `process_index_title_change_in_ref_data`, `process_index_title_change_in_user_history`, `process_index_title_change_in_topic_links`, `process_index_title_change_in_manuscript_links`, `process_index_title_change_in_marked_up_text_chunk`, cascades to GlobalNotificationSet
  - **Index place change**: `process_index_place_change` for compPlace/pubPlace
  - **Index delete**: `process_index_delete_in_core_cache`, `process_index_delete_in_version_state`, `process_index_delete_in_links`, `process_index_delete_in_topic_links`, `process_index_delete_in_notes`, `process_index_delete_in_versions`, `process_index_delete_in_toc`, deletes from GlobalNotificationSet, ref_data, marked_up_text_chunk
  - **Version title change**: cascades to history, search, GlobalNotificationSet
  - **Version delete**: cascades to GlobalNotificationSet
  - **Term save/delete**: `reset_simple_term_mapping`
  - **Category save/delete**: `rebuild_library_after_category_change` (full library rebuild!), `reset_simple_term_mapping`

## Common Tasks

### Load text at a reference
```python
ref = Ref("Genesis 1:1")
chunk = ref.text(lang="en")               # TextChunk
text_content = chunk.text                  # string or list
# or for bilingual:
tf = TextFamily(ref)
d = tf.contents()                          # full API dict
```

### Save text at a reference
```python
chunk = TextChunk(Ref("Genesis 1:1"), lang="en", vtitle="My Version")
chunk.text = "In the beginning..."
chunk.versionSource = "http://example.com"
chunk.save()
# Note: for in-place edits like chunk.text[0] = "new", use save(force_save=True)
```

### Look up an Index
```python
index = library.get_index("Genesis")
# or:
index = Index().load({"title": "Genesis"})
```

### Find all versions of a text
```python
vs = VersionSet({"title": "Genesis"})
for v in vs:
    print(v.versionTitle, v.language)
```

### Get next/prev section
```python
ref = Ref("Genesis 1")
next_ref = ref.next_section_ref()   # Ref("Genesis 2")
prev_ref = ref.prev_section_ref()   # None (first chapter)
```

### Check if a ref is empty
```python
ref = Ref("Genesis 1:1")
ref.is_empty()           # checks DB for any version with content
ref.is_empty(lang="en")  # checks only English versions
```

### Find refs in a string
```python
refs = library.get_refs_in_string("See Genesis 1:1 and Exodus 2:3", lang="en")
```

### Get the full title regex
```python
reg = library.all_titles_regex(lang="en", citing_only=True)
matches = reg.finditer(some_text)
```

### Iterate all segments of a Version
```python
results = []
def collect(segment_str, tref, he_tref, version):
    results.append((tref, segment_str))

v = Version().load({"title": "Genesis", "versionTitle": "Tanakh: The Holy Scriptures, JPS 1985"})
v.walk_thru_contents(collect)
```

### Force a library rebuild
```python
library.rebuild(include_toc=True)
# Warning: clears Ref cache and all in-memory caches. Expensive.
```
