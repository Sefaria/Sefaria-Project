"""
Subscriber callbacks for the sefaria.model.dependencies event system.

Each callback is thin: guard-check + dispatch a Celery task.
All business logic lives in semantic_search.tasks.
"""
import structlog

logger = structlog.get_logger(__name__)


def _enabled() -> bool:
    from django.conf import settings
    return "vector_db" in getattr(settings, "DATABASES", {})


# ---------------------------------------------------------------------------
# Index
# ---------------------------------------------------------------------------

def process_index_save_in_pgvector(index, **kwargs) -> None:
    if not _enabled():
        return
    from semantic_search.tasks import update_index_metadata
    update_index_metadata.delay(index.title)


def process_index_title_change_in_pgvector(index, **kwargs) -> None:
    if not _enabled():
        return
    old_title = kwargs.get("old")
    new_title = kwargs.get("new")
    if not old_title or not new_title or old_title == new_title:
        return
    from semantic_search.tasks import update_index_title
    update_index_title.delay(old_title, new_title)


def process_index_delete_in_pgvector(index, **kwargs) -> None:
    if not _enabled():
        return
    from semantic_search.tasks import delete_index_chunks
    delete_index_chunks.delay(index.title)


# ---------------------------------------------------------------------------
# Version
# ---------------------------------------------------------------------------

def process_version_save_in_pgvector(ver, **kwargs) -> None:
    if not _enabled():
        return
    from semantic_search.tasks import update_version_attributes
    update_version_attributes.delay(ver.title, ver.versionTitle)


def process_version_title_change_in_pgvector(ver, **kwargs) -> None:
    if not _enabled():
        return
    old_vtitle = kwargs.get("old")
    new_vtitle = kwargs.get("new")
    if not old_vtitle or not new_vtitle or old_vtitle == new_vtitle:
        return
    from semantic_search.tasks import update_version_title
    update_version_title.delay(ver.title, old_vtitle, new_vtitle)


def process_version_delete_in_pgvector(ver, **kwargs) -> None:
    if not _enabled():
        return
    from semantic_search.tasks import delete_version_chunks
    delete_version_chunks.delay(ver.title, ver.versionTitle)


# ---------------------------------------------------------------------------
# Topics (slug and name changes)
# ---------------------------------------------------------------------------

def process_topic_slug_change_in_pgvector(topic_obj, **kwargs) -> None:
    if not _enabled():
        return
    old_slug = kwargs.get("old")
    new_slug = kwargs.get("new")
    if not old_slug or not new_slug or old_slug == new_slug:
        return
    from semantic_search.tasks import update_topic_slug
    update_topic_slug.delay(old_slug, new_slug)


def process_author_topic_save_in_pgvector(topic_obj, **kwargs) -> None:
    """Fired on any AuthorTopic save — refreshes author_names in case the primary title changed."""
    if not _enabled():
        return
    from semantic_search.tasks import update_author_topic_names
    update_author_topic_names.delay(topic_obj.slug)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

def process_category_path_change_in_pgvector(cat, **kwargs) -> None:
    if not _enabled():
        return
    old_path = kwargs.get("old")
    if not old_path:
        return
    from semantic_search.tasks import update_category_chunks
    update_category_chunks.delay(list(old_path))


# ---------------------------------------------------------------------------
# RefTopicLinks (associated_topic_* fields)
# ---------------------------------------------------------------------------

def _ref_topic_link_index_title(link) -> str | None:
    try:
        from sefaria.model import Ref
        return Ref(link.ref).index.title
    except Exception:
        return None


def process_ref_topic_link_change_in_pgvector(link, **kwargs) -> None:
    if not _enabled():
        return
    if getattr(link, "is_sheet", False):
        return  # sheet topic links don't affect library_chunks
    index_title = _ref_topic_link_index_title(link)
    if not index_title:
        return
    from semantic_search.tasks import update_ref_topic_links
    update_ref_topic_links.delay(link.ref, index_title)


# ---------------------------------------------------------------------------
# Links (linked_refs field)
# ---------------------------------------------------------------------------

def _link_refs_and_titles(link) -> list[tuple[str, str]]:
    """Return [(ref_str, index_title), ...] for each ref in a Link, skipping unparseable ones."""
    from sefaria.model import Ref
    result = []
    for ref_str in getattr(link, "refs", []):
        try:
            oref = Ref(ref_str)
            result.append((ref_str, oref.index.title))
        except Exception:
            pass
    return result


def process_link_change_in_pgvector(link, **kwargs) -> None:
    if not _enabled():
        return
    from semantic_search.tasks import update_ref_links
    for ref_str, index_title in _link_refs_and_titles(link):
        update_ref_links.delay(ref_str, index_title)


# ---------------------------------------------------------------------------
# RefData (pagerank field)
# ---------------------------------------------------------------------------

def process_ref_data_save_in_pgvector(ref_data, **kwargs) -> None:
    if not _enabled():
        return
    try:
        from sefaria.model import Ref
        index_title = Ref(ref_data.ref).index.title
    except Exception:
        return
    from semantic_search.tasks import update_ref_pagerank
    update_ref_pagerank.delay(ref_data.ref, index_title, float(ref_data.pagesheetrank))
