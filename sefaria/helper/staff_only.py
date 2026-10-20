"""
Publishing staff-only (`admin_only`) records: Categories, Indexes, Versions and Links.

Publishing only goes one way, from staff-only to public, and only from the staff site, where staff-only
records are visible. Publishing writes the shared database; the public servers keep the library in
memory and learn of the change through the existing refresh URLs, which staff call on the public site
afterwards (each response lists them under `refresh`).
"""
from bson.objectid import ObjectId

from sefaria.model import Category, Index, Version, VersionSet, LinkSet, Ref, library, log_update
from sefaria.model.abstract import show_admin_only_records
from sefaria.model.text import admin_only_category_path, admin_only_index_titles
from sefaria.settings import SEARCH_INDEX_ON_SAVE
from sefaria.system.database import db
from sefaria.system.exceptions import InputError, BookNameError
from sefaria import tracker


def _require_staff_site():
    if not show_admin_only_records():
        raise InputError("Staff-only records can only be published from the staff site.")


def _required(body, *keys):
    missing = [k for k in keys if not body.get(k)]
    if missing:
        raise InputError("Missing required field(s): {}.".format(", ".join(missing)))


def _load_index(title):
    try:
        return library.get_index(title)
    except BookNameError:
        raise InputError("No book called {}.".format(title))


def _publish_record(user, record):
    """Clear the flag on a Category or Index, save it through the normal save path, and log the change."""
    old_dict = record.contents()
    record.admin_only = False
    record.save()  # rejects publishing while a parent is still staff-only
    log_update(user, type(record), old_dict, record.contents())


def _queue_version_for_search(version):
    """Search indexing was skipped while the version was hidden: queue every segment of it now."""
    if not SEARCH_INDEX_ON_SAVE:
        return
    index = version.get_index()
    db.index_queue.insert_many([
        {"ref": oref.normal(), "lang": version.language, "version": version.versionTitle, "type": "ref"}
        for oref in index.all_segment_refs()
    ])


def _refresh_urls(*paths):
    return [path.replace(" ", "_") for path in paths]


def _links_query(index_title=None, ids=None):
    query = {"admin_only": True}
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
    """The staff-only state of a book and everything it depends on or that depends on it."""
    _require_staff_site()
    index = _load_index(index_title)
    categories = index.categories
    hidden_path = admin_only_category_path(categories)
    base_titles = getattr(index, "base_text_titles", None) or []
    hidden_bases = admin_only_index_titles(base_titles)
    links = list(LinkSet(_links_query(index_title=index.title)))
    blocked = sum(1 for link in links if link._admin_only_parent())
    return {
        "index": {"title": index.title, "admin_only": index.is_admin_only()},
        "categories": [
            {"path": categories[:i], "admin_only": bool(hidden_path) and len(categories[:i]) >= len(hidden_path)}
            for i in range(1, len(categories) + 1)
        ],
        "base_texts": [{"title": t, "admin_only": t in hidden_bases} for t in base_titles],
        "versions": [
            {"versionTitle": v.versionTitle, "language": v.language, "admin_only": v.is_admin_only()}
            for v in VersionSet({"title": index.title}, proj={"versionTitle": 1, "language": 1, "admin_only": 1})
        ],
        "links": {"admin_only": len(links), "publishable": len(links) - blocked, "blocked": blocked},
    }


def publish_category(user, body):
    _require_staff_site()
    _required(body, "path")
    category = Category().load({"path": body["path"]})
    if not category:
        raise InputError("No category {}.".format("/".join(body["path"])))
    if not category.is_admin_only():
        raise InputError("Category {} is already public.".format("/".join(category.path)))
    parent = category._admin_only_parent()
    if parent:
        raise InputError("Can not publish {} while {} is staff-only.".format(category, parent))
    if not body.get("dry_run"):
        _publish_record(user, category)
    return {"published": "/".join(category.path), "dry_run": bool(body.get("dry_run")), "refresh": _refresh_urls("/admin/reset/toc")}


def publish_version(user, body):
    _require_staff_site()
    _required(body, "title", "versionTitle", "language")
    version = Version().load({"title": body["title"], "versionTitle": body["versionTitle"], "language": body["language"]})
    if not version:
        raise InputError("No version {} / {} / {}.".format(body["title"], body["versionTitle"], body["language"]))
    if not version.is_admin_only():
        raise InputError("Version {} is already public.".format(version.versionTitle))
    parent = version._admin_only_parent()
    if parent:
        raise InputError("Can not publish {} while {} is staff-only.".format(version, parent))
    if not body.get("dry_run"):
        tracker.update_version_metadata(user, version, {"admin_only": None})
        _queue_version_for_search(version)
    return {"published": version.versionTitle, "dry_run": bool(body.get("dry_run")),
            "refresh": _refresh_urls("/admin/reset/{}".format(version.title))}


def publish_links(user, body):
    """
    Publish staff-only links that touch a book (`index`) or are listed by id (`ids`).
    Links whose other book is still staff-only are skipped and reported. Not logged to history
    one by one: a book can have thousands of links.
    """
    _require_staff_site()
    dry_run = bool(body.get("dry_run"))
    published, skipped = 0, []
    for link in LinkSet(_links_query(index_title=body.get("index"), ids=body.get("ids"))):
        parent = link._admin_only_parent()
        if parent:
            skipped.append({"id": str(link._id), "refs": link.refs, "reason": "{} is staff-only".format(parent)})
            continue
        if not dry_run:
            link.admin_only = False
            link._skip_lang_check = True  # neither changes by publishing
            link._skip_expanded_refs_set = True
            link.save()
        published += 1
    return {"published": published, "skipped": skipped, "dry_run": dry_run}


def publish_index(user, body):
    """Publish a book, and optionally its staff-only versions and links, in dependency order."""
    _require_staff_site()
    _required(body, "title")
    dry_run = bool(body.get("dry_run"))
    index = _load_index(body["title"])
    if not index.is_admin_only():
        raise InputError("{} is already public.".format(index.title))
    parent = index._admin_only_parent()
    if parent:
        raise InputError("Can not publish {} while {} is staff-only.".format(index.title, parent))
    result = {"published": index.title, "dry_run": dry_run, "versions": [], "links": None}
    if not dry_run:
        _publish_record(user, index)
    if body.get("include_versions"):
        for version in VersionSet({"title": index.title, "admin_only": True}):
            if not dry_run:
                tracker.update_version_metadata(user, version, {"admin_only": None})
                _queue_version_for_search(version)
            result["versions"].append(version.versionTitle)
    if body.get("include_links"):
        # In a dry run the book is still staff-only, so every one of its links would report as blocked by it.
        result["links"] = None if dry_run else publish_links(user, {"index": index.title})
    result["refresh"] = _refresh_urls("/admin/reset/{}".format(index.title), "/admin/reset/ac", "/admin/reset/linker-resolvers")
    return result
