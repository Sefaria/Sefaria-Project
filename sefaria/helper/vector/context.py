"""
Shared helpers for computing pgvector chunk context from Sefaria model objects.

Used by both the bulk embed script and the incremental update tasks.
"""
from sefaria.model import Ref, Topic, RefDataSet, RefData


def time_period_to_dict(time_period) -> dict | None:
    if time_period is None:
        return None
    return {
        "start": getattr(time_period, "start", None),
        "end": getattr(time_period, "end", None),
        "startIsApprox": getattr(time_period, "startIsApprox", False),
        "endIsApprox": getattr(time_period, "endIsApprox", False),
    }


def get_version_context(version) -> dict:
    """Metadata derived from the Version, shared by every chunk produced from it."""
    return {
        "language": version.actualLanguage,
        "direction": version.direction,
        "is_primary": bool(version.isPrimary),
        "is_source": bool(version.isSource),
    }


def get_index_context(index) -> dict:
    """Metadata derived from the Index, shared by every chunk produced from it."""
    composition_time_period = index.composition_time_period()
    era = composition_time_period.get_era() if composition_time_period else None
    composition_place = index.composition_place()
    authors = index.author_objects()

    return {
        "primary_category": index.get_primary_category(),
        "all_categories": index.categories,
        "composition_date": time_period_to_dict(composition_time_period),
        "composition_place": composition_place.primary_name("en") if composition_place else None,
        "era_name": era.primary_name("en") if era else None,
        "author_names": [author.get_primary_title("en") for author in authors],
        "author_slugs": [author.slug for author in authors],
    }


def get_chunk_context(chunk_ref) -> dict:
    """Metadata derived from the chunk's Ref (single segment or range)."""
    pageranks = [ref_data.pagesheetrank for ref_data in RefDataSet.from_ref(chunk_ref)]
    pagerank = sum(pageranks) / len(pageranks) if pageranks else RefData.DEFAULT_PAGESHEETRANK

    seen_topic_pairs = set()
    topic_names = []
    topic_slugs = []
    for link in chunk_ref.topiclinkset(with_char_level_links=False):
        topic = Topic.init(link.toTopic)
        if not topic:
            continue
        pair = (topic.get_primary_title("en"), topic.slug)
        if pair not in seen_topic_pairs:
            seen_topic_pairs.add(pair)
            topic_names.append(pair[0])
            topic_slugs.append(pair[1])

    seen_linked_refs = set()
    linked_refs = []
    for link in chunk_ref.linkset():
        for ref_str in link.refs:
            if ref_str in seen_linked_refs:
                continue
            try:
                other_ref = Ref(ref_str)
            except Exception:
                continue
            if chunk_ref.contains(other_ref):
                continue
            seen_linked_refs.add(ref_str)
            linked_refs.append(ref_str)

    return {
        "pagerank": pagerank,
        "associated_topic_names": topic_names,
        "associated_topic_slugs": topic_slugs,
        "linked_refs": linked_refs,
    }
