from collections import Counter
from dataclasses import dataclass
from typing import Protocol

from semantic_search.models import SemanticTextChunk


@dataclass(frozen=True)
class LinkedRefEnhancement:
    appended_refs: list[str]
    ref_counts: dict[str, int]


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

    appended_refs = [
        ref
        for ref, count in counts.most_common()
        if count >= min_link_count
    ]
    return LinkedRefEnhancement(
        appended_refs=appended_refs,
        ref_counts={ref: counts[ref] for ref in appended_refs},
    )
