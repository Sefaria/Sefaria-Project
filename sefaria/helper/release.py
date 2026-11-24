"""
Releasing unreleased records (`unreleased`): Categories, Indexes, Versions and Links.

Releasing only goes one way, from unreleased to public, and only from the staff site, where unreleased
records are visible. Releasing writes the shared database; the public servers keep the library in
memory and learn of the change through the existing refresh URLs, which staff call on the public site
afterwards (each response lists them under `refresh`).
"""

from bson.objectid import ObjectId
from pymongo import UpdateOne

from sefaria import tracker
from sefaria.model import Category, Index, LinkSet, Ref, Version, VersionSet, library, log_update
from sefaria.model.abstract import show_unreleased_content
from sefaria.model.text import unreleased_category_path, unreleased_index_titles
from sefaria.settings import SEARCH_INDEX_ON_SAVE
from sefaria.system.database import db
from sefaria.system.exceptions import BookNameError, InputError


def _require_staff_site():
    if not show_unreleased_content():
        raise InputError("Unreleased records can only be released from the staff site.")


def _required(body, *keys):
    missing = [k for k in keys if not body.get(k)]
    if missing:
        raise InputError("Missing required field(s): {}.".format(", ".join(missing)))


def _load_index(title):
    try:
        return library.get_index(title)
    except BookNameError:
        raise InputError(f"No book called {title}.")


def _release_record(user, record):
    """Clear the flag on a Category or Index, save it through the normal save path, and log the change."""
    old_dict = record.contents()
    record.unreleased = False
    record.save()  # rejects releasing while a parent is still unreleased
    log_update(user, type(record), old_dict, record.contents())


def _queue_version_for_search(version):
    """Search indexing was skipped while the version was hidden: queue every segment of it now."""
    if not SEARCH_INDEX_ON_SAVE:
        return
    index = version.get_index()
    # Upsert: a segment may already be queued, and the queue is unique on (lang, version, ref).
    db.index_queue.bulk_write(
        [
            UpdateOne(
                {"ref": oref.normal(), "lang": version.language, "version": version.versionTitle},
                {"$setOnInsert": {"type": "ref"}},
                upsert=True,
            )
            for oref in index.all_segment_refs()
        ],
        ordered=False,
    )


def _refresh_urls(*paths):
    return [path.replace(" ", "_") for path in paths]


def _links_query(index_title=None, ids=None):
    query = {"unreleased": True}
    if ids:
        try:
            query["_id"] = {"$in": [ObjectId(i) for i in ids]}
        except Exception:
            raise InputError("`ids` must be a list of link ids.")
    elif index_title:
        query.update(Ref(index_title).ref_regex_query())
    else:
        raise InputError("Provide either `index` or `ids`.")
    return query


def status(index_title):
    """The unreleased state of a book and everything it depends on or that depends on it."""
    _require_staff_site()
    index = _load_index(index_title)
    categories = index.categories
    hidden_path = unreleased_category_path(categories)
    base_titles = getattr(index, "base_text_titles", None) or []
    hidden_bases = unreleased_index_titles(base_titles)
    links = list(LinkSet(_links_query(index_title=index.title)))
    blocked = sum(1 for link in links if link._unreleased_parent())
    return {
        "index": {"title": index.title, "unreleased": index.is_unreleased()},
        "categories": [
            {"path": categories[:i], "unreleased": bool(hidden_path) and len(categories[:i]) >= len(hidden_path)}
            for i in range(1, len(categories) + 1)
        ],
        "base_texts": [{"title": t, "unreleased": t in hidden_bases} for t in base_titles],
        "versions": [
            {"versionTitle": v.versionTitle, "language": v.language, "unreleased": v.is_unreleased()}
            for v in VersionSet({"title": index.title}, proj={"versionTitle": 1, "language": 1, "unreleased": 1})
        ],
        "links": {"unreleased": len(links), "releasable": len(links) - blocked, "blocked": blocked},
    }


def release_category(user, body):
    _require_staff_site()
    _required(body, "path")
    category = Category().load({"path": body["path"]})
    if not category:
        raise InputError("No category {}.".format("/".join(body["path"])))
    if not category.is_unreleased():
        raise InputError("Category {} is already public.".format("/".join(category.path)))
    parent = category._unreleased_parent()
    if parent:
        raise InputError(f"Can not release {category} while {parent} is unreleased.")
    if not body.get("dry_run"):
        _release_record(user, category)
    return {
        "released": "/".join(category.path),
        "dry_run": bool(body.get("dry_run")),
        "refresh": _refresh_urls("/admin/reset/toc"),
    }


def release_version(user, body):
    _require_staff_site()
    _required(body, "title", "versionTitle", "language")
    version = Version().load(
        {"title": body["title"], "versionTitle": body["versionTitle"], "language": body["language"]}
    )
    if not version:
        raise InputError("No version {} / {} / {}.".format(body["title"], body["versionTitle"], body["language"]))
    if not version.is_unreleased():
        raise InputError(f"Version {version.versionTitle} is already public.")
    parent = version._unreleased_parent()
    if parent:
        raise InputError(f"Can not release {version} while {parent} is unreleased.")
    if not body.get("dry_run"):
        tracker.update_version_metadata(user, version, {"unreleased": None})
        _queue_version_for_search(version)
    return {
        "released": version.versionTitle,
        "dry_run": bool(body.get("dry_run")),
        "refresh": _refresh_urls(f"/admin/reset/{version.title}"),
    }


def release_links(user, body):
    """
    Release unreleased links that touch a book (`index`) or are listed by id (`ids`).
    Links whose other book is still unreleased are skipped and reported. Not logged to history
    one by one: a book can have thousands of links.

    Only the flag changes, so it is cleared directly rather than by re-saving each link: a re-save re-runs
    every link validation, and existing links that fail an unrelated check (e.g. stale `charLevelData`)
    would abort the release halfway. Nothing subscribes to link saves.
    """
    _require_staff_site()
    dry_run = bool(body.get("dry_run"))
    releasable, skipped = [], []
    for link in LinkSet(_links_query(index_title=body.get("index"), ids=body.get("ids"))):
        parent = link._unreleased_parent()
        if parent:
            skipped.append({"id": str(link._id), "refs": link.refs, "reason": f"{parent} is unreleased"})
        else:
            releasable.append(link._id)
    if releasable and not dry_run:
        db.links.update_many({"_id": {"$in": releasable}}, {"$unset": {"unreleased": ""}})
    return {"released": len(releasable), "skipped": skipped, "dry_run": dry_run}


def release_index(user, body):
    """Release a book, and optionally its unreleased versions and links, in dependency order."""
    _require_staff_site()
    _required(body, "title")
    dry_run = bool(body.get("dry_run"))
    index = _load_index(body["title"])
    if not index.is_unreleased():
        raise InputError(f"{index.title} is already public.")
    parent = index._unreleased_parent()
    if parent:
        raise InputError(f"Can not release {index.title} while {parent} is unreleased.")
    result = {"released": index.title, "dry_run": dry_run, "versions": [], "links": None}
    if not dry_run:
        _release_record(user, index)
    if body.get("include_versions"):
        for version in VersionSet({"title": index.title, "unreleased": True}):
            if not dry_run:
                tracker.update_version_metadata(user, version, {"unreleased": None})
                _queue_version_for_search(version)
            result["versions"].append(version.versionTitle)
    if body.get("include_links"):
        # In a dry run the book is still unreleased, so every one of its links would report as blocked by it.
        result["links"] = None if dry_run else release_links(user, {"index": index.title})
    result["refresh"] = _refresh_urls(f"/admin/reset/{index.title}", "/admin/reset/ac", "/admin/reset/linker-resolvers")
    return result
