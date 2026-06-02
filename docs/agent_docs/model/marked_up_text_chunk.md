# MarkedUpTextChunk
> Source: `sefaria/model/marked_up_text_chunk.py`

## Purpose
Stores span-level annotations (citations, named entities, categories) on top of Sefaria text segments. Each record maps character ranges within a specific version/language of a segment-level Ref to structured metadata (link targets, topic slugs, category paths). The primary consumer is the text rendering pipeline, which calls `apply_spans_to_text()` to inject HTML anchor tags into raw text.

## Key Classes

### MarkedUpTextChunk
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `marked_up_text_chunks`
- **Role**: Canonical store of curated span annotations for a single segment+version+language triple.
- **Key fields**: `ref` (segment-level), `versionTitle`, `language` ("en"/"he"), `spans` (list of span dicts with `charRange`, `text`, `type`, and optional `ref`/`topicSlug`/`categoryPath`)
- **Key methods**:
  - `apply_spans_to_text(text)` -- Inserts HTML `<a>` tags into `text` for each span. Iterates in reverse char-order to preserve offsets. Silently skips spans whose saved text no longer matches the segment (stale after edits).
  - `add_non_overlapping_spans(new_spans)` -- Merges new spans into `self.spans`, dropping any that overlap existing spans. Uses bisect for O(n log n) performance. Does not save.
  - `get_span_objects(reverse=False)` -- Yields typed `MUTCSpan` subclass instances via `MUTCSpanFactory`.
- **Validation rules**: Ref must be segment-level; corresponding TextChunk must be non-empty; span text must exactly match the characters at `charRange` in the TextChunk; citation spans require `ref`, named-entity spans require `topicSlug`; uniqueness enforced on `(ref, versionTitle, language)`.

### MarkedUpTextChunkSet
- **Inherits**: `AbstractMongoSet`
- **Role**: Query set for `MarkedUpTextChunk`.

### LinkerOutput
- **Inherits**: `MarkedUpTextChunk`
- **Collection**: `linker_output`
- **Role**: Debug/audit mirror of `MarkedUpTextChunk` with extra fields per span tracking linker resolution details (`failed`, `ambiguous`, LLM resolution fields, input/resolved ref parts). Used for linker QA, not production rendering.

### LinkerOutputSet
- **Inherits**: `AbstractMongoSet`
- **Role**: Query set for `LinkerOutput`.

### MUTCSpanType (Enum)
- Values: `QUOTE`, `NAMED_ENTITY`, `CITATION`, `CATEGORY`

### MUTCSpan hierarchy (ABC)
- `MUTCSpan` -- Abstract base. Holds `char_range`, `text`, debug flags.
- `CitationMUTCSpan` -- Wraps span in `<a class="refLink">` with `data-ref`. Suppresses book-level refs in non-debug mode.
- `NamedEntityMUTCSpan` -- Wraps span in `<a class="namedEntityLink">` linking to `/topics/{slug}`.
- `CategoryMUTCSpan` -- Wraps span in `<a class="categoryLink">` linking to `/texts/{path}`.
- `MUTCSpanFactory.create(raw_span)` -- Dispatches to the correct subclass by `type`.

### get_mutc_class(debug=False)
- Returns `LinkerOutput` if debug, else `MarkedUpTextChunk`. Used to toggle between production and debug collections.

## Non-Obvious Patterns
- **Span text is validated against the live TextChunk** on save. If the underlying text changes (e.g., version edit), saved MUTC records become stale. `apply_spans_to_text` handles this gracefully by skipping mismatched spans at render time.
- **`_sanitize` is intentionally a no-op** -- span text comes from already-sanitized Version data.
- **`track_pkeys = True`** with `pkeys = ["ref", "versionTitle", "language"]` enables the dependency cascade functions to detect and propagate key changes.
- **Debug mode CSS classes** (`spanFailed`, `spanAmbiguous`, `spanSucceeded`) are only emitted when the span originates from a `LinkerOutput` record (detected by presence of `failed`/`ambiguous` keys).
- **Cascade functions operate on both collections** (`marked_up_text_chunks` and `linker_output`) to keep them in sync.

## Relationships
- **Index title change/delete**: `process_index_title_change` regex-replaces old title in `ref` and `spans.ref` fields across both collections. `process_index_delete` deletes all records whose `ref` matches the index pattern.
- **Topic slug change**: `process_topic_slug_change` does a bulk `update_many` on `spans.topicSlug` using MongoDB array filters, on both collections.
- **Category path change**: `process_category_path_change` does a bulk `update_many` on `spans.categoryPath` using MongoDB array filters, on both collections.
- **TextChunk / Version**: Validation requires a non-empty `TextChunk` to exist for the given ref/version/language. Span char ranges and text are checked against it.
- **Ref**: All refs must be segment-level. Citation spans contain a `ref` field pointing to the cited passage.
- **Topic**: Named-entity spans reference topics via `topicSlug`.

## Common Tasks

**Load a MarkedUpTextChunk for a segment**:
```python
mutc = MarkedUpTextChunk().load({"ref": "Rashi on Genesis 1:1:1", "versionTitle": "...", "language": "he"})
```

**Render text with inline links**:
```python
marked_text = mutc.apply_spans_to_text(raw_segment_text)
```

**Merge new spans without overlapping existing ones**:
```python
mutc.add_non_overlapping_spans(new_span_dicts)
mutc.save()
```

**Toggle between production and debug collections**:
```python
Klass = get_mutc_class(debug=True)  # LinkerOutput
record = Klass().load(query)
```
