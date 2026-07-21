"""
Subscriber callbacks for the sefaria.model.dependencies event system.

Each callback is thin: guard-check + dispatch a Celery task.
All business logic lives in semantic_search.tasks.
"""
import structlog

from sefaria.celery_setup.config import CeleryQueue
from sefaria.model import Ref
from semantic_search.tasks import (
    update_index_metadata, update_index_title, delete_index_chunks,
    update_version_attributes, update_version_title, delete_version_chunks,
    update_topic_slug, update_author_topic_names, update_category_chunks,
    update_ref_topic_links, update_ref_links, update_ref_pagerank,
)

logger = structlog.get_logger(__name__)


def _tasks_queue() -> str:
    """The env-specific queue the sefaria celery worker consumes (CELERY_QUEUES['tasks']).

    Dispatches must target this explicitly; a bare .delay() routes to the default
    'celery' queue, which no worker drains. See sefaria/helper/texts/tasks.py for the
    same pattern via .set(queue=CeleryQueue.TASKS.value).
    """
    return CeleryQueue.TASKS.value


# ---------------------------------------------------------------------------
# Index
# ---------------------------------------------------------------------------

def process_index_save_in_pgvector(index, **kwargs) -> None:
    update_index_metadata.apply_async(args=(index.title,), queue=_tasks_queue())


def process_index_title_change_in_pgvector(index, **kwargs) -> None:
    old_title = kwargs.get("old")
    new_title = kwargs.get("new")
    if not old_title or not new_title or old_title == new_title:
        return
    update_index_title.apply_async(args=(old_title, new_title), queue=_tasks_queue())


def process_index_delete_in_pgvector(index, **kwargs) -> None:
    delete_index_chunks.apply_async(args=(index.title,), queue=_tasks_queue())


# ---------------------------------------------------------------------------
# Version
# ---------------------------------------------------------------------------

def process_version_save_in_pgvector(ver, **kwargs) -> None:
    update_version_attributes.apply_async(args=(ver.title, ver.versionTitle), queue=_tasks_queue())


def process_version_title_change_in_pgvector(ver, **kwargs) -> None:
    old_vtitle = kwargs.get("old")
    new_vtitle = kwargs.get("new")
    if not old_vtitle or not new_vtitle or old_vtitle == new_vtitle:
        return
    update_version_title.apply_async(args=(ver.title, old_vtitle, new_vtitle), queue=_tasks_queue())


def process_version_delete_in_pgvector(ver, **kwargs) -> None:
    delete_version_chunks.apply_async(args=(ver.title, ver.versionTitle), queue=_tasks_queue())


# ---------------------------------------------------------------------------
# Topics (slug and name changes)
# ---------------------------------------------------------------------------

def process_topic_slug_change_in_pgvector(topic_obj, **kwargs) -> None:
    old_slug = kwargs.get("old")
    new_slug = kwargs.get("new")
    if not old_slug or not new_slug or old_slug == new_slug:
        return
    update_topic_slug.apply_async(args=(old_slug, new_slug), queue=_tasks_queue())


def process_author_topic_save_in_pgvector(topic_obj, **kwargs) -> None:
    """Fired on any AuthorTopic save. author_names in pgvector chunks derive from the author's
    English primary title, so only refresh them when that title actually changed. A plain re-save
    (e.g. the numSources bump when a RefTopicLink is added — which happens twice per link add)
    leaves the title untouched and must not enqueue this expensive per-index fan-out task."""
    if kwargs.get("is_new"):
        return  # a brand-new author has no chunks referencing it yet
    orig_title = getattr(topic_obj, "_orig_en_primary_title", None)
    new_title = topic_obj.get_primary_title("en")
    if orig_title == new_title:
        return  # title unchanged — nothing to propagate
    # Advance the snapshot so re-saving this same instance doesn't re-fire on an already-applied change.
    topic_obj._orig_en_primary_title = new_title
    update_author_topic_names.apply_async(args=(topic_obj.slug,), queue=_tasks_queue())


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

def process_category_path_change_in_pgvector(cat, **kwargs) -> None:
    old_path = kwargs.get("old")
    new_path = kwargs.get("new")
    if not old_path or not new_path:
        return
    update_category_chunks.apply_async(args=(list(old_path), list(new_path)), queue=_tasks_queue())


# ---------------------------------------------------------------------------
# RefTopicLinks (associated_topic_* fields)
# ---------------------------------------------------------------------------

def _ref_topic_link_index_title(link) -> str | None:
    try:
        return Ref(link.ref).index.title
    except Exception:
        return None


def process_ref_topic_link_change_in_pgvector(link, **kwargs) -> None:
    if getattr(link, "is_sheet", False):
        return  # sheet topic links don't affect library_chunks
    index_title = _ref_topic_link_index_title(link)
    if not index_title:
        return
    update_ref_topic_links.apply_async(args=(link.ref, index_title), queue=_tasks_queue())


# ---------------------------------------------------------------------------
# Links (linked_refs field)
# ---------------------------------------------------------------------------

def _link_refs_and_titles(link) -> list[tuple[str, str]]:
    """Return [(ref_str, index_title), ...] for each ref in a Link, skipping unparseable ones."""
    result = []
    for ref_str in getattr(link, "refs", []):
        try:
            oref = Ref(ref_str)
            result.append((ref_str, oref.index.title))
        except Exception:
            pass
    return result


def process_link_change_in_pgvector(link, **kwargs) -> None:
    for ref_str, index_title in _link_refs_and_titles(link):
        update_ref_links.apply_async(args=(ref_str, index_title), queue=_tasks_queue())


# ---------------------------------------------------------------------------
# RefData (pagerank field)
# ---------------------------------------------------------------------------

def process_ref_data_save_in_pgvector(ref_data, **kwargs) -> None:
    try:
        index_title = Ref(ref_data.ref).index.title
    except Exception:
        return
    update_ref_pagerank.apply_async(args=(ref_data.ref, index_title, float(ref_data.pagesheetrank)), queue=_tasks_queue())
