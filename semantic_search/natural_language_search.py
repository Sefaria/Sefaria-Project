import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Optional

logger = logging.getLogger(__name__)

SCORING_THREAD_COUNT = 25
SUMMARY_THREAD_COUNT = 25
SEMANTIC_RESULT_LIMIT = 40


def union_chunks_by_ref(first: list, second: list) -> list:
    """
    Union two SemanticTextChunk lists by ref, keeping the first occurrence and
    dropping duplicates found in the second list.
    """
    seen = set()
    union = []
    for chunk in (*first, *second):
        if chunk.ref in seen:
            continue
        seen.add(chunk.ref)
        union.append(chunk)
    return union


def union_chunks_with_origin(first: list, second: list) -> list[tuple]:
    """
    Union two SemanticTextChunk lists by ref (English-leg `first`, Hebrew-leg
    `second`), tagging each chunk with where it came from: "english" (first
    list only), "hebrew" (second list only), or "both" (present in both).
    """
    second_refs = {chunk.ref for chunk in second}
    seen = set()
    union = []
    for chunk in first:
        if chunk.ref in seen:
            continue
        seen.add(chunk.ref)
        origin = "both" if chunk.ref in second_refs else "english"
        union.append((chunk, origin))
    for chunk in second:
        if chunk.ref in seen:
            continue
        seen.add(chunk.ref)
        union.append((chunk, "hebrew"))
    return union


def _search_leg(query: str):
    from semantic_search.search import get_query_embedding, semantic_search_by_embedding

    embedding = get_query_embedding(query)
    chunks = semantic_search_by_embedding(embedding, limit=SEMANTIC_RESULT_LIMIT)
    return embedding, chunks


def run_natural_language_search(
    query: str,
    progress_callback: Optional[Callable[[str, dict], None]] = None,
) -> dict:
    """
    Core natural-language search pipeline: LLM query expansion (EN + HE) ->
    parallel semantic search on both -> union by ref -> linked-ref expansion
    -> LLM relevance scoring (keep 3-5, sorted, ties broken by original order)
    -> LLM relevance summary for each retained result.

    progress_callback(phase, meta), when given, is called at each phase
    transition and, during scoring/summarizing, after each individual item
    completes -- meta always carries english_query/hebrew_query once known so
    a caller polling mid-run never loses them on a later update.
    """
    from api.views import KnnSearch
    from semantic_search.linked_refs import get_mean_std_linked_ref_enhancements
    from semantic_search.query_expansion import expand_query
    from semantic_search.relevance import (
        MIN_RELEVANT_SCORE,
        score_results_parallel,
        summarize_results_parallel,
    )

    def report(phase: str, **meta):
        if progress_callback:
            progress_callback(phase, meta)

    report("expanding_query")
    expansion = expand_query(query)
    queries = {"english_query": expansion.english, "hebrew_query": expansion.hebrew}

    report("searching", **queries)
    with ThreadPoolExecutor(max_workers=2) as executor:
        english_future = executor.submit(_search_leg, expansion.english)
        hebrew_future = executor.submit(_search_leg, expansion.hebrew)
        english_embedding, english_chunks = english_future.result()
        _, hebrew_chunks = hebrew_future.result()

    union_chunks = union_chunks_with_origin(english_chunks, hebrew_chunks)

    report("expanding_links", **queries)
    enhancement = get_mean_std_linked_ref_enhancements(
        [chunk for chunk, _ in union_chunks],
        link_depth=KnnSearch.LINKED_REF_ENHANCEMENT_DEPTH,
        std_threshold=KnnSearch.LINKED_REF_ENHANCEMENT_STD_THRESHOLD,
        min_count=KnnSearch.LINKED_REF_ENHANCEMENT_MIN_COUNT,
    )
    top_linked_refs = KnnSearch._top_linked_refs(enhancement, KnnSearch.DEFAULT_LINKED_REF_LIMIT)

    items = [
        {**KnnSearch._serialize_search_result(chunk, include_text=True), "source": origin}
        for chunk, origin in union_chunks
    ] + [
        {**linked_item, "source": "linked"}
        # english_embedding is used as the representative embedding here (as in
        # the original sync endpoint) so oversized linked-ref text still falls
        # back to ranked semantic chunks instead of being included in full.
        for linked_item in KnnSearch._serialize_linked_refs(top_linked_refs, include_text=True, query_embedding=english_embedding)
    ]

    report("scoring", total=len(items), completed=0, **queries)
    scores = score_results_parallel(
        query,
        items,
        max_workers=SCORING_THREAD_COUNT,
        on_progress=lambda completed, total: report("scoring", completed=completed, total=total, **queries),
    )
    scored_items = [
        {**item, "score": score}
        for item, score in zip(items, scores)
        if score >= MIN_RELEVANT_SCORE
    ]
    # Python's sort is stable, so ties keep their original (pre-scoring) relative
    # order -- ranking stays idempotent across repeat runs of the same search.
    scored_items.sort(key=lambda item: -item["score"])

    report("summarizing", total=len(scored_items), completed=0, **queries)
    summaries = summarize_results_parallel(
        query,
        scored_items,
        max_workers=SUMMARY_THREAD_COUNT,
        on_progress=lambda completed, total: report("summarizing", completed=completed, total=total, **queries),
    )
    results = [
        {**item, "summary": summary}
        for item, summary in zip(scored_items, summaries)
    ]

    return {
        "query": query,
        "english_query": expansion.english,
        "hebrew_query": expansion.hebrew,
        "results": results,
    }
