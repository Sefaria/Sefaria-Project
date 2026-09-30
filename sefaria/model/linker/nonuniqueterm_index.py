"""
Reverse index: NonUniqueTerm slug -> every schema node + MatchTemplate that uses it.

MatchTemplates reference NonUniqueTerms via `term_slugs`, but there is no reverse
lookup. This module maintains such a lookup in the shared (Redis) cache so the linker
editor can show, for a given term, every node across the library that uses it.

Storage: one shared-cache key per term slug (`linker_nut_usages:<slug>`) holding a list
of usage entries, plus a registry key (`linker_nut_usages:__slugs__`) listing every slug
currently present so the index can be fully rebuilt/cleared. Entries look like::

    {
        "index_title": "Berakhot",
        "node_key_path": ["Berakhot"],       # keys from root to the node (see address())
        "node_title": "Berakhot",
        "struct_name": None,                  # alt-structure name, or None for the main tree
        "term_slugs": ["bavli", "berakhot"],  # the full template this usage belongs to
        "scope": "combined",
    }

The index is surgically updated by the linker editor API whenever a MatchTemplate is saved or
deleted, and self-heals on read: if the registry key is missing (e.g. a Redis restart/flush dropped the
whole shared cache), `get_term_usages` detects the empty registry and enqueues a full rebuild
in the background (see rebuild_nonuniqueterm_index_task in sefaria/helper/linker/tasks.py),
instead of silently returning `[]` for every term forever. The rebuild walks the entire
library (thousands of index records), so it runs off the request path rather than inline:
the read that triggers it still gets `[]` this one time, but the index is warm again by the
time the rebuild task finishes.
"""
import time
from typing import List, Dict, Optional, Iterator, Tuple

from sefaria.system.cache import (
    get_shared_cache_elem,
    set_shared_cache_elem,
    delete_shared_cache_elem,
)

CACHE_KEY_PREFIX = "linker_nut_usages:"
REGISTRY_KEY = CACHE_KEY_PREFIX + "__slugs__"

# Throttles the self-heal rebuild in _ensure_warm() below. Without this, a cache
# backend that never actually persists (e.g. Django's DummyCache, used in CI - see
# local_settings_ci.py) would make the registry look permanently cold and enqueue a
# full library-tree rebuild task on every single read instead of just after a real outage.
_REBUILD_COOLDOWN_SECONDS = 60
_last_rebuild_attempt = 0.0


def _slug_key(slug: str) -> str:
    return CACHE_KEY_PREFIX + slug


# ---------------------------------------------------------------------------
# Entry construction / identity
# ---------------------------------------------------------------------------

def make_usage_entry(index_title: str, node, template, struct_name: Optional[str] = None) -> dict:
    """
    Build a usage entry for a single MatchTemplate on a single node.
    `template` is a MatchTemplate instance; `node` is a schema node.
    """
    if struct_name:
        node_key_path = _alt_struct_editor_path(node, struct_name)
    elif getattr(node, "key", None) is not None and hasattr(node, "address"):
        node_key_path = node.address()
    else:
        # Non-SchemaNodes don't have a key path;
        # fall back to the primary title so the usage is still displayable.
        node_key_path = [node.primary_title("en")]
    return {
        "index_title": index_title,
        "node_key_path": node_key_path,
        "node_title": node.primary_title("en"),
        "struct_name": struct_name,
        "term_slugs": list(template.term_slugs),
        "scope": template.scope,
    }


def _alt_struct_editor_path(node, struct_name: str) -> List[str]:
    """
    Return the linker-editor path for an alt-struct node:
    ["__alt__", struct_name, child_index, ...].
    """
    path = []
    parent = getattr(node, "parent", None)
    while parent is not None:
        try:
            path.insert(0, str(parent.children.index(node)))
        except ValueError:
            break
        node = parent
        parent = getattr(node, "parent", None)
    return ["__alt__", struct_name] + path


def _entry_identity(entry: dict) -> Tuple:
    """A hashable identity used to dedupe / match entries for surgical removal."""
    return (
        entry["index_title"],
        tuple(entry["node_key_path"]),
        entry.get("struct_name"),
        tuple(entry["term_slugs"]),
        entry["scope"],
    )


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def _ensure_warm() -> None:
    """
    A missing registry key means the shared cache has no data for this index at all -
    almost certainly a Redis restart/flush rather than a real "zero usages anywhere"
    state, since every library has thousands of usages. Enqueue a rebuild (rather than
    running it inline) so a linker-editor read or edit doesn't block on a full library
    walk, which takes several seconds even locally and can run well past a request
    timeout in production. Throttled by _REBUILD_COOLDOWN_SECONDS so a cold cache can't
    enqueue a rebuild on every call -- and so that a cache backend that never actually
    persists (e.g. CI's DummyCache) doesn't queue one per read.
    """
    global _last_rebuild_attempt
    if _get_registry():
        return
    now = time.time()
    if now - _last_rebuild_attempt < _REBUILD_COOLDOWN_SECONDS:
        return
    _last_rebuild_attempt = now
    from sefaria.helper.linker.tasks import rebuild_nonuniqueterm_index_task
    from sefaria.celery_setup.config import CeleryQueue
    rebuild_nonuniqueterm_index_task.apply_async(queue=CeleryQueue.TASKS.value)


def get_term_usages(slug: str) -> List[dict]:
    _ensure_warm()
    return get_shared_cache_elem(_slug_key(slug)) or []


# ---------------------------------------------------------------------------
# Write (low level)
# ---------------------------------------------------------------------------

def _get_registry() -> List[str]:
    return get_shared_cache_elem(REGISTRY_KEY) or []


def _add_to_registry(slugs) -> None:
    registry = set(_get_registry())
    registry.update(slugs)
    set_shared_cache_elem(REGISTRY_KEY, sorted(registry))


def set_term_usages(slug: str, entries: List[dict]) -> None:
    if entries:
        set_shared_cache_elem(_slug_key(slug), entries)
        _add_to_registry([slug])
    else:
        delete_shared_cache_elem(_slug_key(slug))


def add_usage_entry(entry: dict) -> None:
    """Add `entry` to each of its term slugs' usage lists (idempotent)."""
    for slug in entry["term_slugs"]:
        entries = get_term_usages(slug)
        if _entry_identity(entry) not in {_entry_identity(e) for e in entries}:
            entries.append(entry)
            set_term_usages(slug, entries)


def remove_usage_entry(entry: dict) -> None:
    """Remove `entry` (matched by identity) from each of its term slugs' usage lists."""
    target = _entry_identity(entry)
    for slug in entry["term_slugs"]:
        entries = [e for e in get_term_usages(slug) if _entry_identity(e) != target]
        set_term_usages(slug, entries)


# ---------------------------------------------------------------------------
# Surgical update helpers called by the linker editor API
# ---------------------------------------------------------------------------

def add_template_usage(index_title: str, node, template, struct_name: Optional[str] = None) -> None:
    add_usage_entry(make_usage_entry(index_title, node, template, struct_name))


def remove_template_usage(index_title: str, node, template, struct_name: Optional[str] = None) -> None:
    remove_usage_entry(make_usage_entry(index_title, node, template, struct_name))


# ---------------------------------------------------------------------------
# Full rebuild
# ---------------------------------------------------------------------------

def _iter_nodes(node, struct_name: Optional[str] = None) -> Iterator:
    """Yield `node` and all of its descendants."""
    yield node, struct_name
    for child in getattr(node, "children", []):
        yield from _iter_nodes(child, struct_name)


def _iter_index_template_usages(index) -> Iterator[Tuple[str, object, object, Optional[str]]]:
    """Yield (index_title, node, template, struct_name) for every MatchTemplate in an index."""
    index_title = index.title
    roots = [(index.nodes, None)]
    if getattr(index, "nodes", None) is not None:
        for name, struct in index.get_alt_structures().items():
            roots.append((struct, name))
    for root, struct_name in roots:
        if root is None:
            continue
        for node, sname in _iter_nodes(root, struct_name):
            for template in node.get_match_templates():
                yield index_title, node, template, sname


def rebuild() -> int:
    """
    Rebuild the entire index from scratch by walking every index's schema tree
    (including alt structures). Returns the number of usage entries written.
    """
    from sefaria.model import library

    mapping: Dict[str, List[dict]] = {}
    count = 0
    for index in library.all_index_records():
        try:
            for index_title, node, template, struct_name in _iter_index_template_usages(index):
                entry = make_usage_entry(index_title, node, template, struct_name)
                identity = _entry_identity(entry)
                for slug in entry["term_slugs"]:
                    entries = mapping.setdefault(slug, [])
                    if identity not in {_entry_identity(e) for e in entries}:
                        entries.append(entry)
                        count += 1
        except Exception as e:  # noqa - one bad index shouldn't abort the whole rebuild
            import structlog
            structlog.get_logger(__name__).warning(
                "build_nonuniqueterm_index: skipping index due to error",
                index=getattr(index, "title", "?"), error=str(e))

    # Clear stale slugs no longer present, then write the fresh mapping.
    for slug in _get_registry():
        if slug not in mapping:
            delete_shared_cache_elem(_slug_key(slug))
    for slug, entries in mapping.items():
        set_shared_cache_elem(_slug_key(slug), entries)
    set_shared_cache_elem(REGISTRY_KEY, sorted(mapping.keys()))
    return count
