from collections import Counter
from dataclasses import dataclass
import statistics
from typing import Callable

from semantic_search.models import SemanticTextChunk


@dataclass(frozen=True)
class LinkedRefEnhancement:
    appended_refs: list[str]
    ref_counts: dict[str, int]
    mean_count: float = 0
    std_count: float = 0
    count_threshold: float = 0
    min_count: int = 0
    threshold_method: str = "min_link_count"


def normalize_ref(ref: str) -> str:
    from sefaria.model import Ref

    try:
        return Ref(ref).normal()
    except Exception:
        return ref


def _identity_ref(ref: str) -> str:
    return ref


def _is_dictionary_oref(oref) -> bool:
    index_node = getattr(oref, "index_node", None)
    if type(index_node).__name__ in {"DictionaryNode", "DictionaryEntryNode"}:
        return True

    index = getattr(oref, "index", None)
    categories = set(getattr(index, "categories", []) or [])
    return bool(categories & {"Dictionary", "Dictionaries", "Lexicon"})


def _is_dictionary_ref_str(ref: str) -> bool:
    from sefaria.model import Ref

    try:
        return _is_dictionary_oref(Ref(ref))
    except Exception:
        return False


def linked_refs_for(ref: str) -> list[str]:
    """
    Linked-ref lookup for hops beyond the initial search results (link_depth > 1).
    Reads the linked_refs already computed onto matching semantic search chunks
    in pgvector, instead of querying Mongo's links collection.
    """
    if _is_dictionary_ref_str(ref):
        return []

    seen = set()
    candidates = []
    for chunk in SemanticTextChunk().filter(ref=ref):
        for candidate in chunk.linked_refs:
            if candidate not in seen:
                seen.add(candidate)
                candidates.append(candidate)

    return [candidate for candidate in candidates if not _is_dictionary_ref_str(candidate)]


def get_linked_ref_enhancements(
    chunks: list[SemanticTextChunk],
    link_depth: int = 1,
    min_link_count: int = 2,
    linked_refs_for_func: Callable[[str], list[str]] | None = None,
    normalize_ref_func: Callable[[str], str] | None = None,
) -> LinkedRefEnhancement:
    """
    Count refs linked from the semantic search result chunks, using the linked_refs
    already stored on each chunk for the first hop and (optionally) expanding
    through further graph hops for additional depth.
    """
    if link_depth < 1 or min_link_count < 1:
        return LinkedRefEnhancement(appended_refs=[], ref_counts={})

    counts = get_linked_ref_counts(
        chunks,
        link_depth=link_depth,
        linked_refs_for_func=linked_refs_for_func,
        normalize_ref_func=normalize_ref_func,
    )
    appended_refs = [
        ref
        for ref, count in counts.most_common()
        if count >= min_link_count
    ]
    return LinkedRefEnhancement(
        appended_refs=appended_refs,
        ref_counts={ref: counts[ref] for ref in appended_refs},
    )


def get_mean_std_linked_ref_enhancements(
    chunks: list[SemanticTextChunk],
    link_depth: int = 1,
    std_threshold: float = 2,
    min_count: int = 3,
    linked_refs_for_func: Callable[[str], list[str]] | None = None,
    normalize_ref_func: Callable[[str], str] | None = None,
) -> LinkedRefEnhancement:
    if std_threshold <= 0 or min_count < 1:
        return LinkedRefEnhancement(
            appended_refs=[],
            ref_counts={},
            threshold_method="mean_plus_std_multiplier",
        )

    counts = get_linked_ref_counts(
        chunks,
        link_depth=link_depth,
        linked_refs_for_func=linked_refs_for_func,
        normalize_ref_func=normalize_ref_func,
    )
    values = list(counts.values())
    if not values:
        return LinkedRefEnhancement(
            appended_refs=[],
            ref_counts={},
            min_count=min_count,
            threshold_method="mean_plus_std_multiplier",
        )

    mean_count = statistics.mean(values)
    std_count = statistics.pstdev(values) if len(values) > 1 else 0
    threshold = max(min_count, mean_count + std_threshold * std_count)

    appended_refs = [
        ref
        for ref, count in counts.most_common()
        if count >= threshold
    ]
    return LinkedRefEnhancement(
        appended_refs=appended_refs,
        ref_counts={ref: counts[ref] for ref in appended_refs},
        mean_count=mean_count,
        std_count=std_count,
        count_threshold=threshold,
        min_count=min_count,
        threshold_method="mean_plus_std_multiplier",
    )


def get_linked_ref_counts(
    chunks: list[SemanticTextChunk],
    link_depth: int = 1,
    linked_refs_for_func: Callable[[str], list[str]] | None = None,
    normalize_ref_func: Callable[[str], str] | None = None,
) -> Counter:
    if link_depth < 1:
        return Counter()

    using_default = linked_refs_for_func is None
    if using_default:
        linked_refs_for_func = linked_refs_for
        normalize_ref_func = normalize_ref_func or normalize_ref
    else:
        normalize_ref_func = normalize_ref_func or _identity_ref

    def normalize(ref: str) -> str:
        return normalize_ref_func(ref) if ref else ""

    def candidate_refs_for_chunk(chunk) -> list[str]:
        # Chunks arrive with their own linked_refs already populated (set at
        # embedding time), so the first hop needs no lookup at all -- DB or
        # otherwise. Dictionary-ref filtering (an in-memory library lookup, not
        # a DB call) only runs when the real default is in play; a caller that
        # injects its own linked_refs_for_func is assumed to be a test that
        # wants to bypass it.
        raw = getattr(chunk, "linked_refs", None) or []
        if not using_default:
            return raw
        if _is_dictionary_ref_str(chunk.ref):
            return []
        return [r for r in raw if not _is_dictionary_ref_str(r)]

    original_refs = {
        normalized_ref
        for c in chunks
        for normalized_ref in (
            normalize(c.ref),
            normalize(getattr(c, "chunked_from_ref", "")),
        )
        if normalized_ref
    }

    counts = Counter()
    seen_frontier_refs = set()
    seen_current_refs = set()
    next_frontier = []
    for chunk in chunks:
        normalized_ref = normalize(chunk.ref)
        if not normalized_ref or normalized_ref in seen_current_refs:
            continue
        seen_current_refs.add(normalized_ref)
        for linked_ref in {normalize(r) for r in candidate_refs_for_chunk(chunk)}:
            if not linked_ref or linked_ref in original_refs:
                continue
            counts[linked_ref] += 1
            if linked_ref not in seen_frontier_refs:
                seen_frontier_refs.add(linked_ref)
                next_frontier.append(linked_ref)

    current_refs = next_frontier
    for _ in range(1, link_depth):
        if not current_refs:
            break
        next_frontier = []
        for ref in current_refs:
            source_linked_refs = {
                normalize(linked_ref)
                for linked_ref in linked_refs_for_func(ref)
            }
            for linked_ref in source_linked_refs:
                if not linked_ref or linked_ref in original_refs:
                    continue
                counts[linked_ref] += 1
                if linked_ref not in seen_frontier_refs:
                    seen_frontier_refs.add(linked_ref)
                    next_frontier.append(linked_ref)
        current_refs = next_frontier

    return counts
