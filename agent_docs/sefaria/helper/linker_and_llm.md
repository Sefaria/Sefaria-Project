# Linker, Disambiguator & LLM Helpers
> Sources: `sefaria/helper/linker/linker.py`, `sefaria/helper/linker/disambiguator.py`, `sefaria/helper/linker/tasks.py`, `sefaria/helper/llm/topic_prompt.py`, `sefaria/helper/llm/sheet_scoring.py`, `sefaria/helper/llm/sheet_scoring_single.py`, `sefaria/helper/llm/sheet_scoring_tools.py`, `sefaria/helper/llm/tasks/`, `sefaria/helper/marked_up_text_chunk_generator.py`

## Purpose

These modules power Sefaria's automated reference detection, disambiguation, and LLM-assisted content analysis. The linker subsystem finds textual citations in arbitrary text (used by the Sefaria browser extension and internal linking pipeline), while the disambiguator resolves ambiguous or non-segment-level references using a multi-strategy approach involving Dicta Parallels API, Sefaria search, and LLM reasoning. The LLM helpers handle topic prompt generation for the LLM repo and sheet quality scoring.

## Key Functions/Classes

### linker.py (~325 lines) -- Find-Refs API Layer

- **`FindRefsInput`** -- Dataclass bundling `text` (title+body+lang), `options` (with_text, debug, max_segments, version_preferences_by_corpus), and `metadata` (url, description, title for tracking).
- **`make_find_refs_response(find_refs_input)`** -- Main entry point for the find-refs API. Records webpage hits, delegates to cached response generation.
- **`_make_find_refs_response_with_cache()`** -- Cached (persistent Django cache) wrapper that calls the linker, then saves WebPage and WebPageText records from metadata.
- **`_make_find_refs_response_linker_v3()`** -- Uses `library.get_linker(lang)` to link title and body text. Extracts context_ref from title if it resolves to exactly one unambiguous ref. Links body by paragraph with `with_failures=True`.
- **`_make_find_refs_response_inner(resolved_ref_list, options)`** -- Transforms resolved refs into API response format: `{results: [{startChar, endChar, text, linkFailed, refs}], refData: {tref: {heRef, url, primaryCategory, he?, en?}}}`.
- **`unpack_find_refs_request(request)`** -- Validates POST body against `FIND_REFS_POST_SCHEMA` (cerberus), extracts text/options/metadata.
- **`_get_preferred_vtitle(oref, lang, version_preferences_by_corpus)`** -- Resolves version preferences by corpus for text display.

### disambiguator.py (~1770 lines) -- LLM-Powered Citation Disambiguation

This module resolves two types of problematic references:
1. **Ambiguous refs** -- where the linker found multiple possible target refs for a citation.
2. **Non-segment refs** -- where the linker resolved to a section/chapter level but the citation likely refers to a specific segment.

**Core strategy (multi-stage pipeline):**
1. **Prior formation** (`_llm_form_prior`) -- LLM generates expectations about what the target text should contain, based only on the citing passage.
2. **Keyword extraction** (`_llm_form_search_query`) -- LLM generates 5-6 lexical search queries from surrounding context (NOT from the citation span itself).
3. **Candidate retrieval** -- Queries Dicta Parallels API (`_query_dicta`) and Sefaria Search API (`_query_sefaria_search`) for matching segments within the target ref range.
4. **Candidate confirmation** (`_llm_confirm_candidate`) -- LLM verifies whether a candidate is genuinely the target.
5. **Best candidate selection** (`_llm_choose_best_candidate`) -- When multiple candidates pass, LLM picks the best.
6. **Base vs. commentary** (`_llm_choose_base_vs_commentary`) -- For ambiguous refs where one option is a base text and another is commentary, LLM chooses.

**Key dataclasses:**
- `AmbiguousResolutionPayload` / `AmbiguousResolutionResult`
- `NonSegmentResolutionPayload` / `NonSegmentResolutionResult`

**External services used:**
- **Dicta Parallels API** (`parallels-3-0a.loadbalancer.dicta.org.il`) -- Finds textual parallels in the Sefaria corpus.
- **Sefaria Search (Elasticsearch)** -- `naive_lemmatizer` field with `match_phrase` + slop for fuzzy matching.
- **Anthropic Claude** (primary LLM, via `langchain_anthropic.ChatAnthropic`)
- **OpenAI GPT-4o-mini** (keyword extraction only, via `langchain_openai.ChatOpenAI`)
- **LangSmith** -- Tracing enabled for all LLM calls (project: `citation-disambiguator`).

**Helper functions:**
- `_window_around_span(text, span, window_words)` -- Extracts a context window around a citation span.
- `_mark_citation(text, span)` -- Wraps citation text in `<citation ref="...">` XML tags for LLM prompts.
- `_normalize_dicta_url_to_ref(url)` -- Converts Dicta URL format to Sefaria ref.
- `_strip_nikud(text)` -- Removes cantillation and vowels before sending to LLM.

### tasks.py (~1011 lines) -- Celery Task Pipeline

- **`find_refs_api_task`** -- Celery task wrapping `make_find_refs_response` for async execution on the linker queue.
- **`link_segment_with_worker(linking_args_dict)`** -- The main linking pipeline task. Given a segment ref + text + version:
  1. Runs the linker (`library.get_linker(lang).link_with_footnotes(...)`) at HIGH thoroughness.
  2. Saves debug data to `LinkerOutput`.
  3. Creates/replaces a `MarkedUpTextChunk` with citation spans.
  4. Calls `delete_and_save_new_links()` to sync Link records.
  5. Loads and resolves ambiguous cases via `disambiguate_ambiguous_ref()`.
  6. Loads and resolves non-segment cases via `disambiguate_non_segment_ref()`.

- **`LinkingArgs`** -- Dataclass: `ref`, `text`, `lang`, `vtitle`, optional `user_id` and `kwargs`.
- **`DeleteAndSaveLinksMsg`** -- Message format for the link-sync step.
- **`delete_and_save_new_links(msg_dict)`** -- Deletes stale citation links and creates new ones based on MarkedUpTextChunk spans.
- **`_load_recent_ambiguous_cases` / `_load_recent_non_segment_cases`** -- Query LinkerOutput and MarkedUpTextChunk to find spans needing disambiguation.
- **`_apply_ambiguous_resolution` / `_apply_non_segment_resolution`** -- Upsert resolved refs into MarkedUpTextChunk and create/update Link records.
- **`_upsert_mutc_span`** -- Updates or inserts a citation span in a MarkedUpTextChunk.
- **`_create_link_for_resolution` / `_create_or_update_link_for_non_segment_resolution`** -- Creates Link records for resolved disambiguations.
- **`_update_linker_output_resolution_fields`** -- Persists resolution metadata (method, llm_resolved_phrase, etc.) back onto LinkerOutput spans.
- **`_is_non_segment_or_perek_ref`** -- Returns True for refs that are non-segment level OR are Talmud perek/parasha refs (which are technically segment-level in the schema but function as section-level references).

### topic_prompt.py -- LLM Topic Prompt Generation

- **`make_llm_topic(sefaria_topic)`** -- Converts a Sefaria `Topic` to an `LLMTopic` for the external LLM repo.
- **`make_topic_prompt_source(oref, context, with_commentary, normalize_text)`** -- Builds a `TopicPromptSource` with text in both languages, optional commentary, and surrounding context.
- **`_get_commentary_for_tref(tref)`** -- Retrieves English commentary for a ref via `get_links()`.
- **`_get_context_ref(segment_oref)`** -- Determines the appropriate context ref: section for Tanakh, Passage for Bavli.
- **`_get_surrounding_text(oref)`** -- Returns en/he text of the context ref.

### sheet_scoring.py -- LLM Sheet Quality Scoring

- **`save_sheet_scoring_output(result)`** -- Persists `SheetScoringOutput` to `db.sheets` under `llm_scoring.sheet`. Whitelists specific fields: `ref_scores`, `title_interest_level`, `title_interest_reason`, `language`, `creativity_score`.
- **`make_sheet_scoring_input(sheet_content)`** -- Creates `SheetScoringInput` from a sheet dict (id, title, expandedRefs, sources).

### marked_up_text_chunk_generator.py -- Batch Linking Orchestrator

- **`MarkedUpTextChunkGenerator`** -- Orchestrates generating MarkedUpTextChunks for a range of segments.
  - `generate(ref, lang, vtitle)` -- Iterates all segment refs and enqueues linking tasks.
  - `generate_from_ref(ref)` -- Generates for all versions of all segments.
  - `generate_from_ref_and_version_id(ref, version_id)` -- Generates for a specific version.
  - Internally calls `enqueue_linking_chain(LinkingArgs(...))` per segment.

## Non-Obvious Patterns

1. **The disambiguator uses a "prior-first" approach.** Before looking at any candidate text, the LLM forms expectations about what the target should contain. This prevents the LLM from being biased by candidate text and makes confirmation more reliable.

2. **Keywords are extracted from context OUTSIDE the citation span.** The `_llm_form_search_query` function explicitly instructs the LLM not to copy words from inside `<citation>...</citation>` tags. This forces search queries to be based on surrounding discussion rather than the citation text itself.

3. **Perek and parasha refs are treated as non-segment even when technically segment-level.** The `_is_non_segment_or_perek_ref` function checks against cached sets (`get_talmud_perek_ref_set`, `get_parasha_ref_set` from `helper/text.py`) because these refs represent structural units that typically need segment-level disambiguation.

4. **The linking pipeline is a Celery chain**, not a single task. `link_segment_with_worker` runs linking, saves MUTC, syncs links, and then runs disambiguation -- all in sequence within one task. Disambiguation results are applied immediately (not queued separately).

5. **LangSmith tracing is configured at module import time** in disambiguator.py via environment variables. The `@traceable` decorator from `langsmith` is used on all LLM-calling functions.

6. **Two different LLMs are used:** Anthropic Claude (primary reasoning, confirmation, prior formation) and OpenAI GPT-4o-mini (keyword extraction only, via `_get_keyword_llm()`).

7. **The find-refs response is cached persistently** via `@django_cache(cache_type="persistent")`. The cache key includes the full request text, so identical texts return cached results.

8. **Resolution metadata is written back to LinkerOutput spans** via `_update_linker_output_resolution_fields`, allowing later analysis of disambiguation performance.

## Relationships

- **linker.py** uses `library.get_linker(lang)` from `sefaria/model/linker/` (the model-layer linker) and wraps its output for API consumption.
- **tasks.py** imports from both `linker.py` (for `make_find_refs_response`) and `disambiguator.py` (for `disambiguate_ambiguous_ref`, `disambiguate_non_segment_ref`).
- **tasks.py** writes to `MarkedUpTextChunk` and `LinkerOutput` (model objects) and creates `Link` records.
- **marked_up_text_chunk_generator.py** is the batch entry point that feeds into `tasks.py` via `enqueue_linking_chain`.
- **topic_prompt.py** depends on `sefaria_llm_interface` (external package) for dataclass definitions.
- **sheet_scoring.py** depends on `sefaria_llm_interface.sheet_scoring` for input/output types and writes directly to `db.sheets`.

## Common Tasks

- **Run the find-refs API:** Call `make_find_refs_response(FindRefsInput(...))` or post to the API endpoint.
- **Link a single segment:** Use `enqueue_linking_chain(LinkingArgs(ref=..., text=..., lang=..., vtitle=...))`.
- **Bulk-link a book:** Use `MarkedUpTextChunkGenerator().generate(ref, lang, vtitle)`.
- **Disambiguate manually:** Call `disambiguate_ambiguous_ref(AmbiguousResolutionPayload(...))` directly.
- **Score a sheet with LLM:** Create input with `make_sheet_scoring_input(sheet_content)`, process through the LLM pipeline, then save with `save_sheet_scoring_output(result)`.
- **Generate topic prompts:** Use `make_topic_prompt_source(oref, context)` and `make_llm_topic(topic)` to build inputs for the external LLM topic description pipeline.
