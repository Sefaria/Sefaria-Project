"""
TEMPORARY QA tooling for unreleased books (PR #3838): copy an existing category, book or version as a
unreleased record, so testers can try the feature on real content from the site's admin menus.

Enabled only where UNRELEASED_QA_TOOLS is on (the QA cauldron), and only on a staff site.
Remove before merging, together with the QA views and routes in api/release_views.py / urls_shared.py
and the "QA: copy" buttons in static/js/ReleaseTools.jsx.
"""

import copy
import threading

import structlog
from django.conf import settings

from sefaria import tracker
from sefaria.model import Category, Index, Link, LinkSet, Ref, Version, VersionSet, library, log_add
from sefaria.model.abstract import show_unreleased_content
from sefaria.system.exceptions import BookNameError, DuplicateRecordError, InputError

logger = structlog.get_logger(__name__)

QA_METHOD = "Staff-only QA copy"
QA_GENERATED_BY = "release_qa_copy"
DEFAULT_MAX_LINKS = 100


def qa_tools_enabled():
    return show_unreleased_content() and bool(getattr(settings, "UNRELEASED_QA_TOOLS", False))


def _require_enabled():
    if not qa_tools_enabled():
        raise InputError("Unreleased QA tools are not enabled on this site.")


def _required(body, *keys):
    missing = [k for k in keys if not body.get(k)]
    if missing:
        raise InputError("Missing required field(s): {}.".format(", ".join(missing)))


def _check_title(title):
    if "-" in title:
        raise InputError(f"Titles may not contain hyphens: {title}")


def _load_index(title):
    try:
        return library.get_index(title)
    except BookNameError:
        raise InputError(f"No book called {title}.")


def copy_category(user, body):
    """An unreleased sibling of an existing category, with new names. Its books are not copied."""
    _require_enabled()
    _required(body, "path", "name", "heName")
    source = Category().load({"path": body["path"]})
    if not source:
        raise InputError("No category {}.".format("/".join(body["path"])))
    _check_title(body["name"])
    path = list(body["path"][:-1]) + [body["name"]]
    if Category().load({"path": path}):
        raise InputError("Category {} already exists.".format("/".join(path)))
    category = Category({"path": path, "lastPath": body["name"], "unreleased": True})
    category.add_primary_titles(body["name"], body["heName"])
    for key in ("enDesc", "heDesc", "enShortDesc", "heShortDesc"):
        if getattr(source, key, None):
            setattr(category, key, getattr(source, key))
    category.save()
    log_add(user, Category, category.contents(), method=QA_METHOD)
    return {"copied": "/".join(path), "unreleased": category.is_unreleased(), "url": "/texts/" + "/".join(path)}


def _copy_ref(tref, source_title, new_title):
    """`tref` moved into the copy if it belongs to the source book ("Ruth 1:1" does, "Ruth Rabbah 1:1" doesn't)."""
    try:
        if Ref(tref).index.title == source_title:
            return new_title + tref[len(source_title) :]
    except InputError:
        pass
    return tref


def _check_copy_index(body):
    _require_enabled()
    _required(body, "title", "newTitle", "heTitle")
    source = _load_index(body["title"])
    _check_title(body["newTitle"])
    if Index().load({"title": body["newTitle"]}):
        raise InputError("A book called {} already exists.".format(body["newTitle"]))
    return source


def start_copy_index(user, body):
    """
    Check the request, then copy in a background thread: a book with many versions takes longer than the
    gateway waits for a response. The copy shows up when it's done; failures are logged.
    """
    _check_copy_index(body)

    def work():
        try:
            copy_index(user, body)
        except Exception:
            logger.exception("unreleased QA copy failed", source=body.get("title"), copy=body.get("newTitle"))

    threading.Thread(target=work, daemon=True).start()
    return {"copying": body["newTitle"], "url": "/" + body["newTitle"].replace(" ", "_")}


def copy_index(user, body):
    """
    An unreleased copy of a book under a new title: its structure, all its versions and up to `max_links` of its
    links (rewritten to point at the copy). Placed in `categories` (default: the source's own categories).
    """
    source = _check_copy_index(body)
    new_title, he_title = body["newTitle"], body["heTitle"]
    max_links = int(body.get("maxLinks", DEFAULT_MAX_LINKS))

    raw = copy.deepcopy(source.contents(raw=True))
    for key in ("_id", "alt_structs", "compPlace", "pubPlace", "match_templates", "lexiconName", "dedication"):
        raw.pop(key, None)
    raw["title"] = new_title
    raw["categories"] = body.get("categories") or source.categories
    raw["unreleased"] = True
    raw["schema"].update(
        {
            "key": new_title,
            "titles": [
                {"lang": "en", "text": new_title, "primary": True},
                {"lang": "he", "text": he_title, "primary": True},
            ],
        }
    )
    raw["schema"].pop("sharedTitle", None)
    raw["schema"].pop("match_templates", None)
    index = tracker.add(user, Index, raw, method=QA_METHOD)

    versions = []
    # Primary versions first: a book must always have at least one primary version.
    for version in sorted(VersionSet({"title": source.title}), key=lambda v: not getattr(v, "isPrimary", False)):
        attrs = {k: v for k, v in version.contents().items() if k != "_id"}
        attrs.update({"title": new_title, "unreleased": True})
        Version(attrs).save()
        versions.append(version.versionTitle)
    tracker.count_segments(index)

    copied_links, skipped_links = 0, 0
    for link in LinkSet(Ref(source.title), limit=max_links):
        attrs = {
            k: v
            for k, v in link.contents().items()
            if k not in ("_id", "expandedRefs0", "expandedRefs1", "availableLangs", "source_text_oid")
        }
        attrs["refs"] = [_copy_ref(r, source.title, new_title) for r in link.refs]
        attrs["generated_by"] = QA_GENERATED_BY
        try:
            Link(attrs).save()
            copied_links += 1
        except (DuplicateRecordError, InputError, AssertionError):
            skipped_links += 1

    return {
        "copied": new_title,
        "unreleased": index.is_unreleased(),
        "versions": versions,
        "links": copied_links,
        "skippedLinks": skipped_links,
        "url": "/" + new_title.replace(" ", "_"),
    }


def copy_version(user, body):
    """An unreleased copy of a version on the same book, under a new version title."""
    _require_enabled()
    _required(body, "title", "versionTitle", "language", "newVersionTitle")
    source = Version().load(
        {"title": body["title"], "versionTitle": body["versionTitle"], "language": body["language"]}
    )
    if not source:
        raise InputError("No version {} / {} / {}.".format(body["title"], body["versionTitle"], body["language"]))
    if Version().load({"title": body["title"], "versionTitle": body["newVersionTitle"], "language": body["language"]}):
        raise InputError("Version {} already exists.".format(body["newVersionTitle"]))
    attrs = {k: v for k, v in source.contents().items() if k != "_id"}
    attrs.update({"versionTitle": body["newVersionTitle"], "unreleased": True, "isPrimary": False})
    version = Version(attrs).save()
    tracker.count_segments(source.get_index())
    return {"copied": version.versionTitle, "unreleased": version.is_unreleased()}
