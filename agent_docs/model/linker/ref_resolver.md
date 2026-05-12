# ref_resolver
> Source: `sefaria/model/linker/ref_resolver.py`

## Purpose
Converts parsed `RawRef` objects (sequences of classified ref parts from the ML model) into concrete `Ref` objects by matching parts against a trie of known titles, then recursively refining matches through the schema tree. Handles ambiguity (multiple valid interpretations), context injection (ibid, current book, section context), and pruning of false positives. This is the core resolution engine -- everything upstream produces `RawRef`s, everything downstream consumes `ResolvedRef`s.

## Key Classes

### ResolvedRef
- **Inherits**: `AbstractResolvedEntity`, `abst.Cloneable`
- **Role**: Represents a partial or complete resolution of a `RawRef` into a `Ref`. Tracks which parts were matched, which nodes they matched against, and any context used.
- **Key fields/methods**:
  - `ref` -- the resolved `text.Ref` (can be `None` if only an AltStruct node matched)
  - `ref_part_and_node_matches` -- list of `RefPartAndNodeMatch`, linking matched parts to `ReferenceableBookNode`s
  - `context_ref`, `context_type` -- if resolution used context (ibid or current book), stored here
  - `context_parts` -- the `ContextPart` instances injected during resolution
  - `resolved_parts` -- flattened list of all `RawRefPart`s that were successfully matched
  - `node` -- the last matched `ReferenceableBookNode` (the most specific node)
  - `order_key` -- tuple `(num_explicit_parts, num_context_parts_if_DH)` used to rank competing matches
  - `complies_with_thoroughness_level()` -- at NORMAL thoroughness, book-level-only matches are rejected
  - `contains(other)` -- containment check that handles AltStruct nodes (no Ref) gracefully
  - `merge_parts(other)` -- absorbs parts from another `ResolvedRef` (used when merging subset matches)
  - `pretty_text` -- adjusts the span to include matched DH continuations and closing parentheses
  - `resolution_failed` -- `True` when both `ref` and `node` are `None`

### AmbiguousResolvedRef
- **Inherits**: `AbstractResolvedEntity`
- **Role**: Wraps multiple `ResolvedRef` objects when the resolver cannot pick a single winner. Returned when >1 match survives pruning.
- **Key fields/methods**:
  - `resolved_raw_refs` -- the list of competing `ResolvedRef`s
  - `is_ambiguous` -- always `True`

### RefResolver
- **Inherits**: none
- **Role**: Stateful resolver that holds the trie, term matcher, ibid history, and thoroughness level. Entry point for all resolution.
- **Key fields/methods**:
  - `_ref_part_title_trie` -- `MatchTemplateTrie` mapping title term sequences to `ReferenceableBookNode`s
  - `_term_matcher` -- `TermMatcher` for matching non-unique terms (used in context)
  - `_ibid_history` -- `IbidHistory` tracking last few resolved refs for ibid support
  - `_thoroughness` -- `ResolutionThoroughness.NORMAL` or `HIGH`
  - `bulk_resolve(raw_refs, book_context_ref, thoroughness, reset_ibids)` -- **main entry point**; splits NON_CTS parts, resolves each `RawRef`, updates ibid history
  - `resolve_raw_ref(book_context_ref, raw_ref)` -- resolves a single `RawRef` through the full pipeline
  - `get_unrefined_ref_part_matches(...)` -- phase 1: trie lookup to find candidate book-level matches
  - `refine_ref_part_matches(...)` -- phase 2: walk down schema tree matching remaining parts (sections, DH, etc.)
  - `resolve_raw_ref_using_ref_instantiation(raw_ref)` -- fallback: tries `Ref(raw_ref.text)` directly if trie matching fails

### TermMatcher
- **Inherits**: none
- **Role**: Precomputed map from term title strings to `NonUniqueTerm` objects, used to inject title context from the current book's schema path.
- **Key fields/methods**:
  - `match_term(ref_part)` -- matches a single NAMED part against all known terms (with Hebrew prefix handling)
  - `match_terms(ref_parts)` -- matches a list of parts, returns unique terms

### IbidHistory
- **Inherits**: none
- **Role**: Sliding window of recently resolved refs, used to provide ibid context. Tracks last N refs and last N distinct titles.
- **Key fields/methods**:
  - `last_refs` -- property; getter returns list, setter appends and enforces size limits (default 3 refs, 3 titles)
  - `get_ref_by_title(title)` -- look up most recent ref for a given index title

### ResolvedRefPruner
- **Inherits**: none
- **Role**: Static utility class with heuristics to remove false-positive matches at both unrefined and refined stages.
- **Key fields/methods**:
  - `prune_unrefined_ref_part_matches(matches)` -- removes matches whose resolved parts are subsets of other matches for the same node
  - `prune_refined_ref_part_matches(thoroughness, matches)` -- full pruning pipeline: remove incorrect, prefer context-free, pick top by order_key, remove superfluous/empty
  - `is_match_correct(match)` -- composite check: context ordering, all explicit sections matched, single-part rejection
  - `remove_superfluous_matches(thoroughness, matches)` -- deduplicates equivalent refs; at HIGH thoroughness or when ambiguous, also filters empty refs

### ResolutionThoroughness (IntEnum)
- `NORMAL = 1` -- skips book-level DH matches, skips filtering empty refs when unambiguous
- `HIGH = 2` -- enables book-level DH search, filters empty refs always

### ContextType (Enum)
- `CURRENT_BOOK` -- context from the book the user is currently viewing
- `IBID` -- context from previously resolved refs in the same text passage

## Non-Obvious Patterns

- **Two-phase resolution**: Phase 1 (`get_unrefined_ref_part_matches`) does trie lookup to find matching book titles. Phase 2 (`refine_ref_part_matches`) recursively walks schema children to match remaining parts (sections, DH, etc.) via `resolved_ref_refiner_factory`.

- **Context is injected as synthetic parts**: `TermContext` and `SectionContext` objects are appended to the parts list and matched through the same trie/refinement pipeline. They are tracked separately via `context_parts` on `ResolvedRef`.

- **Context mutations**: Some schema nodes define `ref_resolver_context_mutations` which can rewrite ref parts before matching (e.g., replacing one term with another). These are collected by walking up the schema tree from the context node and applied before matching.

- **Fallback to raw Ref instantiation**: If trie matching produces zero results, `resolve_raw_ref_using_ref_instantiation` tries `Ref(raw_ref.text)` directly. This catches refs the ML model parsed correctly but that don't match the trie structure.

- **Context-free matches preferred**: If any context-free match resolves all input parts, context-dependent matches are discarded entirely (in `prune_refined_ref_part_matches`).

- **Part splitting**: During trie traversal, a NAMED part can be split if only a prefix matches a trie key (`partial_key_end`). The raw ref is also split accordingly. Only NAMED parts are split -- splitting other types causes false positives.

- **Named part pair merging**: The ML model sometimes over-segments named parts. `_get_named_part_pairs` detects consecutive NAMED parts (within 2 chars) and creates merged `RawRefPartPair`s that are tried alongside individual parts during refinement.

- **Ibid history resets on failed resolution**: If a `RawRef` fails to resolve, the entire ibid history is cleared. This prevents stale context from cascading.

- **Subset match merging**: When no match passes `is_match_correct`, the pruner tries merging matches where one ref contains another (e.g., "Genesis 1" + "Genesis 1:1" become a single merged match). This recovers cases where parts were split across competing matches.

- **order_key ranking**: More explicitly matched parts is always better. Context part count only matters when a DH part was matched (theory: more context makes DH matches more reliable, but not numbered sections).

## Relationships

- **Upstream**: `RawRef` and `RawRefPart` from `ref_part.py` (produced by the ML linker model)
- **Downstream**: `ResolvedRef` / `AmbiguousResolvedRef` consumed by higher-level linking code
- **MatchTemplateTrie** (`match_template.py`): the trie that maps term sequences to `ReferenceableBookNode`s -- built from index schema match templates
- **resolved_ref_refiner_factory** (`resolved_ref_refiner_factory.py`): creates part-type-specific refiners (numbered, DH, named) used in phase 2
- **ReferenceableBookNode** (`referenceable_book_node.py`): wrapper around schema/altstruct nodes that provides `ref()`, `get_children()`, `leaf_refs()`
- **ContextMutation** (`context_mutation.py`): term rewriting rules defined on schema nodes
- **RefPartAndNodeMatch** (`ref_part_and_node_match.py`): pairs matched parts with their corresponding node

## Common Tasks

- **Resolve refs from text**: Call `ref_resolver.bulk_resolve(raw_refs, book_context_ref=some_ref)`. Returns list of `PossiblyAmbigResolvedRef`. Check `.is_ambiguous` and `.resolution_failed` on each result.

- **Change thoroughness**: Pass `thoroughness=ResolutionThoroughness.HIGH` to `bulk_resolve()` to enable DH matching at book level and empty-ref filtering. Used when precision matters more than speed.

- **Provide book context**: Pass `book_context_ref` (a `Ref` for the page/section being viewed) to enable section-level context injection and base_text_titles context.

- **Handle ambiguity**: Check `resolved.is_ambiguous`. If true, `resolved.resolved_raw_refs` contains the competing `ResolvedRef` options.

- **Debug a resolution**: Call `resolved_ref.get_debug_spans()` to get a dict with input parts, types, resolved parts, context info, and the final ref.

- **Extend refinement logic**: Add a new refiner class and register it in `resolved_ref_refiner_factory`. The factory dispatches based on the part type and child node type.
