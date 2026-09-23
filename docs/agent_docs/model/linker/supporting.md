# Linker Supporting Modules
> Sources: `sefaria/model/linker/` (10 files)

## Purpose
These modules provide the building blocks that the core linker pipeline (`ref_resolver.py`, etc.) depends on: template-based matching of schema nodes, entity recognition via GPU, resolution of named entities/categories/refs, and the strategy pattern for refining partial ref matches into complete `Ref` objects.

## match_template.py
### MatchTemplate, MatchTemplateTrie
- **Role**: Defines how schema nodes declare matchable title patterns via `term_slugs` and `scope`. `MatchTemplateTrie` builds a trie keyed by all title variants of those terms, supporting prefix-stripping in Hebrew and partial-key lookups.
- **Key methods**: `MatchTemplateTrie.get_continuations()` -- recursive lookup that splits multi-word keys and merges sub-tries; `has_continuations()` -- quick existence check used during ref resolution.

## context_mutation.py
### ContextMutation, ContextMutationSet
- **Role**: Implements ADD/SWAP mutations that rewrite `raw_ref.parts_to_match` when certain term slugs are matched. This lets schema nodes declare that matching one set of terms should inject or replace context terms (e.g., matching "Shulchan Arukh" triggers adding "Even HaEzer").
- **Key methods**: `ContextMutationSet.apply_to(raw_ref, term_matcher)` -- the main entry point; builds a Cartesian product of slug candidates per part, finds matching indices, then applies swap/add operations to produce the mutated parts list.

## named_entity_resolver.py
### NamedEntityResolver, TopicMatcher, ResolvedNamedEntity
- **Role**: Resolves `RawNamedEntity` objects (people, groups) to `Topic` objects. `TopicMatcher` builds a title-to-slug map with expanded title variants (e.g., "Rabbi" -> "R.") and matches against it with Hebrew prefix stripping.
- **Key methods**: `NamedEntityResolver.bulk_resolve()`, `TopicMatcher.match()`. Title expansion is handled by `PersonTitleGenerator` / `FallbackTitleGenerator`.

## linker_entity_recognizer.py
### LinkerEntityRecognizer
- **Role**: Wrapper around a remote GPU-based NER service. Normalizes input text (HTML, cantillation, etc.), sends it to `GPU_SERVER_URL`, and parses the response into `RawRef` and `RawNamedEntity` objects including dibur hamatchil continuations.
- **Key methods**: `bulk_recognize(inputs)`, `recognize(input_str)`. Normalization steps mirror training-time preprocessing in the ML repo.

## resolved_ref_refiner.py
### ResolvedRefRefiner (ABC) and 7 concrete subclasses
- **Role**: Strategy classes that attempt to refine a `ResolvedRef` by matching one `RawRefPart` against one `ReferenceableBookNode`. Each subclass handles a different part-type/node-type combination (numbered sections, named nodes, ranged refs, dibur hamatchil, passages, defaults, catch-all).
- **Key methods**: `refine(lang) -> List[ResolvedRef]` on each subclass. `ResolvedRefRefinerForNumberedPart` handles both context-full (`SectionContext`) and context-free numeric matching. `ResolvedRefRefinerForDiburHamatchilPart` does fuzzy DH matching.

## resolved_ref_refiner_factory.py
### ResolvedRefRefinerFactory
- **Role**: Factory that maps `(RefPartType, node_class, is_default)` triples to the correct `ResolvedRefRefiner` subclass. Registration order matters -- first matching rule wins.
- **Key methods**: `create(part, node, resolved_ref)` returns the appropriate refiner. Module-level `resolved_ref_refiner_factory` singleton is pre-initialized with all standard rules.

## category_resolver.py
### CategoryResolver, CategoryMatcher, ResolvedCategory
- **Role**: Resolves `RawRef` objects to `Category` objects (as opposed to specific `Ref`s). `CategoryMatcher` builds a title map from category match templates and matches with Hebrew prefix support.
- **Key methods**: `CategoryResolver.bulk_resolve(raw_refs)`, `CategoryMatcher.match(raw_ref)`.

## abstract_resolved_entity.py
### AbstractResolvedEntity (ABC)
- **Role**: Base class for all resolved entities (`ResolvedRef`, `ResolvedNamedEntity`, `ResolvedCategory`). Defines the common interface: `is_ambiguous`, `resolution_failed`, `raw_entity`, `get_debug_spans()`.
- **Key methods**: `_get_base_debug_span()` returns the shared span dict with text, charRange, failed, ambiguous fields.

## ref_part_and_node_match.py
### RefPartAndNodeMatch
- **Role**: Value object pairing a tuple of `RawRefPart`s with the `ReferenceableBookNode` they matched. This is the atomic unit inside a `ResolvedRef` -- a resolved ref is essentially a list of these.
- **Key details**: `can_match_out_of_order` flag controls whether AddressInteger parts must appear sequentially. Hash ignores `node`.

## has_match_template.py
### MatchTemplateMixin
- **Role**: Mixin added to `SchemaNode`, `Category`, and other classes that carry `match_templates` JSON. Provides `get_match_templates()` (yields `MatchTemplate` instances) and `get_match_template_trie(lang)` with per-instance caching.
- **Key methods**: `has_scope_alone_match_template()` checks whether any template uses scope "alone" or "any".

## Non-Obvious Patterns
- **Scope semantics**: `MatchTemplate.scope` can be `"combined"`, `"alone"`, or `"any"`. The trie filters non-root nodes by scope during construction. `"alone"` templates only appear in the alone-scoped trie (used for standalone references without book context).
- **Cartesian product in context mutations**: `ContextMutationSet.apply_to()` builds a Cartesian product of all possible slug interpretations per raw part, then scans rows for subset matches. This handles ambiguous term matches where a single title maps to multiple slugs.
- **DH continuation spans**: The entity recognizer computes "continuation" spans after each dibur hamatchil part -- text between the DH and the next entity/part -- which the DH refiner uses for fuzzy matching.
- **Partial key matching**: `MatchTemplateTrie.get_continuations()` supports `allow_partial=True`, returning the unmatched remainder as `partial_key_end`. This is used for multi-word terms that partially overlap with input text.

## Relationships
- `LinkerEntityRecognizer` produces `RawRef` / `RawNamedEntity` -> fed into `NamedEntityResolver`, `CategoryResolver`, and the ref resolution pipeline.
- `MatchTemplateTrie` (built via `MatchTemplateMixin.get_match_template_trie()`) is the primary lookup structure used during ref resolution to walk schema nodes.
- `ResolvedRefRefinerFactory.create()` is called by `ResolvedRef` (in `resolved_ref.py`) to pick the right refiner for each part/node pair.
- `RefPartAndNodeMatch` is accumulated inside `ResolvedRef` as refiners successfully match parts.
- `AbstractResolvedEntity` unifies the output types so the API layer can handle refs, named entities, and categories uniformly.
- `ContextMutationSet` is populated from schema node declarations and applied to `RawRef.parts_to_match` before resolution begins.

## Common Tasks
- **Add a new ref part type or node type**: Create a new `ResolvedRefRefiner` subclass, then register it in `resolved_ref_refiner_factory.py`'s `initialize_resolved_ref_refiner_factory()`.
- **Add title expansions for named entities**: Add a new `TitleGenerator` subclass in `named_entity_resolver.py` and register it in `NamedEntityTitleExpander.type_generator_router`.
- **Debug match template lookups**: Use `MatchTemplateTrie.get_continuations(key, allow_partial=True)` and inspect the returned sub-trie and `partial_key_end`.
- **Add a new resolved entity type**: Subclass `AbstractResolvedEntity`, implement `is_ambiguous`, `resolution_failed`, `raw_entity`, and `get_debug_spans()`.
