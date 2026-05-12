# Linker
> Source: `sefaria/model/linker/linker.py`

## Purpose
Main entry point for the linker subsystem. Orchestrates a pipeline that takes raw text, runs entity recognition (NER) to find candidate citation spans and named entities, then resolves them against Sefaria's reference and topic databases. Returns a `LinkedDoc` containing all resolved citations, named entities, and categories with character-level positions mapped back to the original input.

## Key Classes

### LinkedDoc
- **Inherits**: `@dataclasses.dataclass`
- **Role**: Output container holding the original text alongside all resolved entities (refs, named entities, categories).
- **Key fields**:
  - `text: str` -- the original input string
  - `resolved_refs: list[PossiblyAmbigResolvedRef]` -- resolved citation references (may be ambiguous, i.e. multiple candidate Refs)
  - `resolved_named_entities: list[ResolvedNamedEntity]` -- resolved named entities (people, places, etc.)
  - `resolved_categories: list[ResolvedCategory]` -- resolved category mentions (e.g. "Talmud")
- **Key methods**:
  - `all_resolved` (property) -- combined flat list of all three resolved-entity lists; return type is `list[AbstractResolvedEntity]`
  - `merge(other)` -- combines two LinkedDocs (keeps `self.text`, concatenates entity lists). Used when linking footnotes or paragraphs separately then recombining.
  - `align_to_new_doc(new_doc, offset)` -- shifts all entity char indices by `offset` within `new_doc`. Used after linking a substring so positions match the full original text.

### Linker
- **Inherits**: none
- **Role**: Orchestrator that wires together NER, ref resolution, named-entity resolution, and category resolution into a single pipeline.
- **Constructor args**:
  - `ner: LinkerEntityRecognizer` -- entity recognition (ML model or rule-based)
  - `ref_resolver: RefResolver` -- resolves `RawRef` spans into Sefaria `Ref` objects
  - `ne_resolver: NamedEntityResolver` -- resolves named-entity spans into topics/people
  - `cat_resolver: CategoryResolver` -- resolves category mentions (tried *before* ref resolution to avoid false ibid matches)
- **Key methods**:
  - `link(input_str, ...)` -- single-string pipeline: NER -> resolve -> remap char indices -> return `LinkedDoc`
  - `bulk_link(inputs, ...)` -- batch version; faster because NER model sees all strings at once. Resets ibid history at the start.
  - `link_with_footnotes(input_str, ...)` -- two-pass strategy: first links the body (footnotes stripped), then links each footnote separately, merges results with corrected offsets.
  - `link_by_paragraph(input_str, ...)` -- splits on newlines, bulk-links each paragraph, reassembles with offset correction. Mimics how the ML model was trained and generally produces better results.
  - `reset_ibid_history()` -- clears the ref resolver's ibid (ditto-mark) tracking state.

## Non-Obvious Patterns

- **Category-first resolution**: `_bulk_resolve_refs_and_cats` resolves categories *before* refs. Only raw refs that fail category resolution are sent to the ref resolver. This prevents a bare category name like "Talmud" from being interpreted as an ibid reference.
- **Normalization round-trip**: The NER model runs on *normalized* text (special chars, diacritics removed). After resolution, `_map_normal_output_to_original_input` remaps all character indices back to the original unnormalized string using the normalizer's mapping tables. This is a critical post-processing step in every code path.
- **Ibid state**: The ref resolver is stateful -- it tracks recent references to support "ibid." / ditto resolution. `bulk_link` resets this state at the top; `_bulk_resolve_refs_and_cats` accepts a `reset_ibids` flag (default True for `link`, False inside `bulk_link`'s inner loop so ibid context carries across the batch).
- **Footnote handling**: `link_with_footnotes` uses a `NormalizerFactory.get('footnote')` normalizer to strip footnote markers, links the clean body, then separately links each footnote's text and realigns positions via `align_to_new_doc`.

## Relationships

- **LinkerEntityRecognizer** (`linker_entity_recognizer.py`) -- called via `recognize()` / `bulk_recognize()` to produce `RawRef` and `RawNamedEntity` spans.
- **RefResolver** (`ref_resolver.py`) -- resolves `RawRef` -> `ResolvedRef` (wrapping Sefaria `Ref`). Supports ibid and thoroughness levels.
- **NamedEntityResolver** (`named_entity_resolver.py`) -- resolves generic named entities to topics.
- **CategoryResolver** (`category_resolver.py`) -- resolves category-level mentions before ref resolution.
- **RawRef / RawNamedEntity** (`ref_part.py`) -- intermediate representations produced by NER, consumed by resolvers.
- **AbstractResolvedEntity** (`abstract_resolved_entity.py`) -- common base for all resolved-entity types; provides `resolution_failed` property used for filtering.
- **NormalizerFactory / AbstractNormalizer** (`sefaria/helper/normalization.py`) -- text normalization and index remapping.

## Common Tasks

- **Link a single string**: `linker.link("See Berakhot 2a and Rashi there")` returns a `LinkedDoc`.
- **Batch-link for throughput**: `linker.bulk_link(["text1", "text2"], book_context_refs=[ref1, ref2])`.
- **Link text that contains footnotes**: `linker.link_with_footnotes(html_with_footnotes)`.
- **Link with paragraph-level splitting** (recommended for long texts): `linker.link_by_paragraph(long_text)`.
- **Filter entity types**: pass `type_filter='citation'` or `type_filter='named entity'` to any link method to skip unnecessary resolution.
- **Include failed matches for debugging**: pass `with_failures=True`.
- **Control resolution depth**: pass `thoroughness=ResolutionThoroughness.HIGH` for more exhaustive (but slower) ref matching.
