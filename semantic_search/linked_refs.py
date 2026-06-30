from collections import Counter
from dataclasses import dataclass
import statistics
from typing import Protocol

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


class LinkSource(Protocol):
    def linked_refs_for(self, ref: str) -> list[str]:
        ...


class MongoLinkSource:
    def linked_refs_for(self, ref: str) -> list[str]:
        from sefaria.model import LinkSet, Ref

        try:
            oref = Ref(ref)
        except Exception:
            return []
        return [linked_ref.normal() for linked_ref in LinkSet(oref).refs_from(oref)]


def get_linked_ref_enhancements(
    chunks: list[SemanticTextChunk],
    link_depth: int = 1,
    min_link_count: int = 2,
    link_source: LinkSource | None = None,
) -> LinkedRefEnhancement:
    """
    Count refs linked from the semantic search result chunks via Mongo links,
    optionally expanding through linked refs to collect additional graph hops.
    """
    if link_depth < 1 or min_link_count < 1:
        return LinkedRefEnhancement(appended_refs=[], ref_counts={})

    counts = get_linked_ref_counts(
        chunks,
        link_depth=link_depth,
        link_source=link_source,
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
    link_source: LinkSource | None = None,
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
        link_source=link_source,
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
    link_source: LinkSource | None = None,
) -> Counter:
    if link_depth < 1:
        return Counter()

    link_source = link_source or MongoLinkSource()
    original_refs = {c.ref for c in chunks} | {
        getattr(c, "chunked_from_ref", "")
        for c in chunks
    }
    counts = Counter()
    seen_frontier_refs = set()
    current_refs = [c.ref for c in chunks]

    for depth_index in range(link_depth):
        next_frontier = []
        for ref in current_refs:
            if not ref:
                continue
            for linked_ref in link_source.linked_refs_for(ref):
                if not linked_ref or linked_ref in original_refs:
                    continue
                counts[linked_ref] += 1
                if linked_ref not in seen_frontier_refs:
                    seen_frontier_refs.add(linked_ref)
                    next_frontier.append(linked_ref)

        if depth_index == link_depth - 1 or not next_frontier:
            break
        current_refs = next_frontier

    return counts
