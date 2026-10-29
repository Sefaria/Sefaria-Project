"""
Version metadata, cache purges and read-only safety lookups for admin tools such as the AI chatbot's admin MCP endpoint.
See docs/arch_docs/topic_prompts_admin_mcp.md §3.7.

- Version metadata edits are the book page's version editor (VersionBlock → POST /api/version/flags, flag_text_api)
  through the same `tracker.update_version_metadata` (history log), limited to an allowlist, with read-before-write
  (a version hash of the metadata) and a dry run.
- A purge is /admin/reset/<ref> (reset_ref) without its redirect: a book refreshes its index caches, version state and
  TOC entry; any ref is purged from Varnish.
- Lookups are the moderator tools' /api/version-indices and /api/check-index-dependencies.
"""
import copy
import hashlib
import json

from sefaria import tracker
from sefaria.model import Ref, Version, VersionState, library
from sefaria.settings import USE_VARNISH
from sefaria.system.database import db
from sefaria.system.exceptions import InputError

# flag_text_api's attributes, less the ones that are bookkeeping rather than metadata (method, extendedNotes, …)
EDITABLE_FIELDS = (
    "versionTitleInHebrew", "shortVersionTitle", "shortVersionTitleInHebrew", "versionSource", "versionNotes",
    "versionNotesInHebrew", "license", "priority", "digitizedBySefaria", "purchaseInformationURL",
    "purchaseInformationImage", "direction", "isSource", "isPrimary", "status",
)
# changes with effects beyond the version's own page: they must be asked for by name
CONSEQUENTIAL_FIELDS = ("newVersionTitle", "isPrimary", "status")
LANGS = ("en", "he")


class VersionNotFound(InputError):
    pass


class VersionConflict(InputError):
    def __init__(self, message, current):
        super().__init__(message)
        self.current = current


def _load(title, lang, version_title):
    if lang not in LANGS:
        raise InputError(f"lang must be one of {LANGS}")
    vobj = Version().load({"title": title, "language": lang, "versionTitle": version_title})
    if vobj is None:
        raise VersionNotFound(f"No {lang} version '{version_title}' of {title}")
    return vobj


def _metadata(vobj):
    contents = vobj.contents()
    for key in ("chapter", "text", "_id"):
        contents.pop(key, None)
    return contents


def metadata_version(metadata):
    serialized = json.dumps(metadata or {}, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:12]


def get_version(title, lang, version_title):
    metadata = _metadata(_load(title, lang, version_title))
    return {"metadata": metadata, "version": metadata_version(metadata), "editable_fields": list(EDITABLE_FIELDS) + ["newVersionTitle"]}


def _validate(fields):
    unknown = set(fields) - set(EDITABLE_FIELDS) - {"newVersionTitle"}
    if unknown:
        raise InputError(f"Unknown fields: {sorted(unknown)}. Editable: {list(EDITABLE_FIELDS) + ['newVersionTitle']}")
    if not fields:
        raise InputError("Nothing to change")
    if "status" in fields and fields["status"] not in ("locked", None, ""):
        raise InputError('status must be "locked" (only moderators may edit the text) or null (unlocked)')
    if "direction" in fields and fields["direction"] not in ("rtl", "ltr"):
        raise InputError('direction must be "rtl" or "ltr"')
    for key in ("isSource", "isPrimary", "digitizedBySefaria"):
        if key in fields and not isinstance(fields[key], bool):
            raise InputError(f"{key} must be true or false")
    if "newVersionTitle" in fields and (not isinstance(fields["newVersionTitle"], str) or not fields["newVersionTitle"].strip()):
        raise InputError("newVersionTitle must be a non-empty string")


def _updates(fields):
    # flag_text_api: an empty license deletes it; so does an empty status (unlocked)
    updates = {}
    for key, value in fields.items():
        if key == "newVersionTitle":
            updates["versionTitle"] = value.strip()
        elif key in ("license", "status") and value in ("", None):
            updates[key] = None
        else:
            updates[key] = value
    return updates


def update_version(title, lang, version_title, fields, base_version, uid, dry_run=False):
    """Returns {"before", "after", "version", "dry_run"}. Raises VersionNotFound, VersionConflict or InputError."""
    _validate(fields)
    if not base_version:
        raise InputError("base_version is required. Read the version first and pass its version.")
    vobj = _load(title, lang, version_title)
    before = _metadata(vobj)
    if metadata_version(before) != base_version:
        raise VersionConflict("This version's metadata was changed since you read it.", {"metadata": before, "version": metadata_version(before)})
    updates = _updates(fields)
    if "versionTitle" in updates and Version().load({"title": title, "language": lang, "versionTitle": updates["versionTitle"]}):
        raise InputError(f"{title} already has a {lang} version titled '{updates['versionTitle']}'")
    after = copy.deepcopy(before)
    for key, value in updates.items():
        if value is None:
            after.pop(key, None)
        else:
            after[key] = value
    if dry_run:
        return {"before": before, "after": after, "version": metadata_version(after), "dry_run": True}
    tracker.update_version_metadata(uid, vobj, updates, method="API")
    saved = _metadata(_load(title, lang, updates.get("versionTitle", version_title)))
    return {"before": before, "after": saved, "version": metadata_version(saved), "dry_run": False}


def purge_cache(tref):
    """reset_ref without the redirect. Returns what was done."""
    from sefaria.system.varnish.wrapper import invalidate_ref, invalidate_title
    try:
        oref = Ref(tref)
    except InputError:
        # after an index title change the cached record may still have the old one
        library.refresh_index_record_in_cache(tref)
        oref = Ref(tref)
    done = []
    if oref.is_book_level():
        library.refresh_index_record_in_cache(oref.index)
        library.reset_text_titles_cache()
        index = library.get_index(oref.normal())
        VersionState(index=index).refresh()
        library.update_index_in_toc(index)
        done += ["index cache", "version state", "table of contents"]
        if USE_VARNISH:
            invalidate_title(oref.index.title)
            done.append("varnish (book)")
    elif USE_VARNISH:
        invalidate_ref(oref)
        done.append("varnish (ref)")
    return {"ref": oref.normal(), "book_level": oref.is_book_level(), "purged": done}


def find_versions(version_title, language=None):
    """/api/version-indices: the books with a version of this title, with their categories."""
    if not version_title:
        raise InputError("versionTitle is required")
    query = {"versionTitle": version_title}
    if language:
        query["language"] = language
    indices = sorted(db.texts.distinct("title", query))
    metadata = {}
    for title in indices:
        try:
            metadata[title] = {"categories": getattr(library.get_index(title), "categories", [])}
        except Exception:
            metadata[title] = {"categories": []}
    return {"indices": indices, "metadata": metadata}


def index_dependencies(title):
    """/api/check-index-dependencies: what would be affected by changing or removing this book."""
    from sefaria.model.text import prepare_index_regex_for_dependency_process
    dependent_indices = library.get_dependant_indices(title, full_records=False)
    version_count = db.texts.count_documents({"title": title})
    try:
        pattern = prepare_index_regex_for_dependency_process(library.get_index(title))
        link_count = db.links.count_documents({"refs": {"$regex": pattern}})
    except Exception:
        link_count = 0
    return {
        "title": title,
        "dependent_indices": dependent_indices,
        "version_count": version_count,
        "link_count": link_count,
        "has_dependencies": len(dependent_indices) > 0 or version_count > 0 or link_count > 0,
    }
