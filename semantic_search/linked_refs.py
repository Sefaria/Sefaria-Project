from collections import Counter
from dataclasses import dataclass

from semantic_search.models import SemanticTextChunk


@dataclass(frozen=True)
class LinkedRefEnhancement:
    appended_refs: list[str]
    ref_counts: dict[str, int]


def get_linked_ref_enhancements(
    chunks: list[SemanticTextChunk],
    link_depth: int = 1,
    min_link_count: int = 2,
    chunk_store: SemanticTextChunk | None = None,
) -> LinkedRefEnhancement:
    """
    Count refs linked from the semantic search result chunks, optionally expanding
    through linked refs to collect one or more additional graph-neighborhood hops.
    """
    if link_depth < 1 or min_link_count < 1:
        return LinkedRefEnhancement(appended_refs=[], ref_counts={})

    chunk_store = chunk_store or SemanticTextChunk()
    original_refs = {c.ref for c in chunks} | {c.chunked_from_ref for c in chunks}
    counts = Counter()
    seen_frontier_refs = set(original_refs)
    current_chunks = chunks

    for depth_index in range(link_depth):
        next_frontier = []
        for chunk in current_chunks:
            for linked_ref in chunk.linked_refs:
                if not linked_ref or linked_ref in original_refs:
                    continue
                counts[linked_ref] += 1
                if linked_ref not in seen_frontier_refs:
                    seen_frontier_refs.add(linked_ref)
                    next_frontier.append(linked_ref)

        if depth_index == link_depth - 1 or not next_frontier:
            break
        current_chunks = chunk_store.filter_by_refs(next_frontier)

    appended_refs = [
        ref
        for ref, count in counts.most_common()
        if count >= min_link_count
    ]
    return LinkedRefEnhancement(
        appended_refs=appended_refs,
        ref_counts={ref: counts[ref] for ref in appended_refs},
    )
