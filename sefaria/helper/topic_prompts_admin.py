"""
Listing and editing topic prompts (the title/prompt "descriptions" on RefTopicLinks) for admin tools
such as the AI chatbot's admin MCP endpoint. See docs/arch_docs/topic_prompts_admin_mcp.md.

Unlike `edit_topic_source`, updates here never create links, change refs, reorder, or publish, and they
write only the edited language's description, atomically (see update_prompt).

RefTopicLink.save() is deliberately not used: it replaces the whole document, which would lose
concurrent edits to other languages or fields. The lifecycle steps are run explicitly instead. Its
topic.update_after_link_change() hook is skipped because a description edit doesn't change link
counts or pools.
"""
import copy
import datetime
import hashlib
import json
import re

from bson import ObjectId
from bson.errors import InvalidId

import structlog

from sefaria.model import Ref, RefTopicLink, RefTopicLinkSet, TopicSet
from sefaria.model.abstract import notify
from sefaria.system.database import db
from sefaria.system.exceptions import InputError
from sefaria.helper.topic import _get_merged_descriptions

LANGS = ("en", "he")
REVIEW_STATES = ("not reviewed", "edited", "reviewed")
SETTABLE_REVIEW_STATES = ("edited", "reviewed")
EDITABLE_FIELDS = ("title", "prompt", "ai_context")
FIELD_MAX_LENGTHS = {"title": 300, "prompt": 5000, "ai_context": 5000}
DEFAULT_LIMIT = 25
MAX_LIMIT = 100
AUDIT_COLLECTION = "topic_prompt_edits"

logger = structlog.get_logger(__name__)


class TopicPromptNotFound(InputError):
    pass


class TopicPromptConflict(InputError):
    def __init__(self, message, current):
        super().__init__(message)
        self.current = current


def _parse_object_id(value, name="id"):
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise InputError(f"Invalid {name}: {value}")


def _validate_lang(lang):
    if lang not in LANGS:
        raise InputError(f"lang must be one of {LANGS}")


def description_version(description):
    """Short stable hash of a description, used for optimistic concurrency."""
    serialized = json.dumps(description or {}, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:12]


def serialize_prompt(link, lang, topic_titles=None, base_url="", descriptions=None):
    descriptions = descriptions if descriptions is not None else getattr(link, "descriptions", {})
    description = descriptions.get(lang, {})
    topic_titles = topic_titles or {}
    return {
        "id": str(link._id),
        "topic": link.toTopic,
        "topic_title": topic_titles.get(link.toTopic),
        "ref": link.ref,
        "lang": lang,
        "title": description.get("title"),
        "prompt": description.get("prompt"),
        "ai_context": description.get("ai_context"),
        "ai_title": description.get("ai_title"),
        "ai_prompt": description.get("ai_prompt"),
        "review_state": description.get("review_state"),
        "published": description.get("published", True) is not False,
        "version": description_version(description),
        "url": f"{base_url}/topics/{link.toTopic}",
    }


def _get_topic_titles(slugs):
    return {
        topic.slug: {"en": topic.get_primary_title("en"), "he": topic.get_primary_title("he")}
        for topic in TopicSet({"slug": {"$in": list(slugs)}})
    }


def _bool_param(value, name):
    if value is None or isinstance(value, bool):
        return value
    if str(value).lower() in ("true", "1"):
        return True
    if str(value).lower() in ("false", "0"):
        return False
    raise InputError(f"{name} must be true or false")


def build_list_query(lang="en", link_id=None, topics=None, review_state=None, published=None,
                     ai_generated=None, ref=None, q=None, cursor=None):
    _validate_lang(lang)
    prefix = f"descriptions.{lang}"
    clauses = [{prefix: {"$exists": True}}]
    if link_id:
        clauses.append({"_id": _parse_object_id(link_id)})
    if topics:
        clauses.append({"toTopic": {"$in": list(topics)}})
    if review_state:
        if review_state == "none":
            clauses.append({f"{prefix}.review_state": {"$exists": False}})
        elif review_state in REVIEW_STATES:
            clauses.append({f"{prefix}.review_state": review_state})
        else:
            raise InputError(f"review_state must be one of {REVIEW_STATES + ('none',)}")
    published = _bool_param(published, "published")
    if published is True:
        clauses.append({f"{prefix}.published": {"$ne": False}})
    elif published is False:
        clauses.append({f"{prefix}.published": False})
    ai_generated = _bool_param(ai_generated, "ai_generated")
    if ai_generated is True:
        clauses.append({f"{prefix}.ai_title": {"$exists": True, "$nin": ["", None]}})
    elif ai_generated is False:
        clauses.append({f"{prefix}.ai_title": {"$in": ["", None]}})
    if ref:
        try:
            oref = Ref(ref)
        except InputError:
            raise InputError(f"Invalid ref: {ref}")
        clauses.append({"expandedRefs": {"$regex": oref.regex()}})
    if q:
        pattern = {"$regex": re.escape(q), "$options": "i"}
        clauses.append({"$or": [{f"{prefix}.title": pattern}, {f"{prefix}.prompt": pattern}]})
    if cursor:
        clauses.append({"_id": {"$gt": _parse_object_id(cursor, "cursor")}})
    return {"$and": clauses}


def list_prompts(lang="en", link_id=None, topics=None, review_state=None, published=None,
                 ai_generated=None, ref=None, q=None, limit=DEFAULT_LIMIT, cursor=None, base_url=""):
    """
    Returns {"results": [...], "next_cursor": str|None}, paginated by _id.
    """
    try:
        limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))
    except (TypeError, ValueError):
        raise InputError("limit must be an integer")
    query = build_list_query(lang, link_id, topics, review_state, published, ai_generated, ref, q, cursor)
    links = list(RefTopicLinkSet(query, sort=[("_id", 1)], limit=limit + 1))
    has_more = len(links) > limit
    links = links[:limit]
    topic_titles = _get_topic_titles({link.toTopic for link in links})
    return {
        "results": [serialize_prompt(link, lang, topic_titles, base_url) for link in links],
        "next_cursor": str(links[-1]._id) if has_more else None,
    }


def _validate_update_fields(fields):
    unknown = set(fields) - set(EDITABLE_FIELDS) - {"review_state"}
    if unknown:
        raise InputError(f"Unknown fields: {sorted(unknown)}")
    if not any(field in fields for field in EDITABLE_FIELDS):
        raise InputError(f"At least one of {EDITABLE_FIELDS} is required")
    for field in EDITABLE_FIELDS:
        if field in fields:
            value = fields[field]
            if not isinstance(value, str):
                raise InputError(f"{field} must be a string")
            if len(value) > FIELD_MAX_LENGTHS[field]:
                raise InputError(f"{field} is longer than {FIELD_MAX_LENGTHS[field]} characters")
    if "review_state" in fields and fields["review_state"] not in SETTABLE_REVIEW_STATES:
        raise InputError(f"review_state must be one of {SETTABLE_REVIEW_STATES}")


def _prepare_description(link, lang, merged_descriptions):
    """
    Runs the RefTopicLink save lifecycle (normalize, validate, sanitize, pre-save) on `link` with
    `merged_descriptions`, without writing. Returns the description for `lang` exactly as save()
    would store it, so dry runs and real writes produce the same text and version.
    """
    link.descriptions = merged_descriptions
    link._normalize()
    link._validate()
    link._sanitize()
    link._pre_save()
    return link.descriptions[lang]


def _audit_fields(serialized):
    return {k: serialized[k] for k in EDITABLE_FIELDS + ("review_state",)}


def _current_or_none(link_id, lang, topic_titles, base_url):
    link = RefTopicLink().load({"_id": link_id})
    if link is None or lang not in getattr(link, "descriptions", {}):
        return None
    return serialize_prompt(link, lang, topic_titles, base_url)


def update_prompt(link_id, lang, fields, base_version, uid, dry_run=False, base_url="", via="session"):
    """
    Edits title/prompt/ai_context (and optionally review_state) of one existing description.
    `via` records how the editor authenticated ("mcp" or "session") in the audit log.
    Returns {"result": ..., "before": ..., "dry_run": bool, "warnings": [...]}.
    Raises TopicPromptNotFound, TopicPromptConflict (stale base_version) or InputError.

    Concurrency: the write is a single conditional update that $sets only descriptions.<lang>, and
    only if that description is still exactly what was read. A concurrent edit to the same
    description (including publishing) makes this call fail with a conflict. Other languages and
    other fields of the link are never written.

    Auditing: a "pending" audit record is inserted before the write, so content never changes
    without one. It is then marked "applied" (or "conflict"/"failed"). If something fails after the
    write has committed, the call still succeeds and returns a warning. A record left "pending" whose
    `after.version` matches the link's current version was applied.
    """
    _validate_lang(lang)
    _validate_update_fields(fields)
    if not base_version:
        raise InputError("base_version is required. Read the prompt first and pass its version.")

    oid = _parse_object_id(link_id)
    link = RefTopicLink().load({"_id": oid})
    if link is None:
        raise TopicPromptNotFound(f"No topic prompt with id {link_id}")
    current_descriptions = copy.deepcopy(getattr(link, "descriptions", {}))
    if lang not in current_descriptions:
        raise TopicPromptNotFound(f"Topic prompt {link_id} has no '{lang}' description")
    original_description = copy.deepcopy(current_descriptions[lang])

    topic_titles = _get_topic_titles([link.toTopic])
    before = serialize_prompt(link, lang, topic_titles, base_url)
    if before["version"] != base_version:
        raise TopicPromptConflict("This prompt was changed since you read it.", before)

    requested = {k: v for k, v in fields.items() if k in EDITABLE_FIELDS or k == "review_state"}
    text_changed = any(requested.get(k) != original_description.get(k) for k in ("title", "prompt") if k in requested)
    if text_changed and "review_state" not in requested:
        requested["review_state"] = "edited"
    merged = _get_merged_descriptions(copy.deepcopy(current_descriptions), {lang: requested})
    new_description = _prepare_description(link, lang, merged)
    after = serialize_prompt(link, lang, topic_titles, base_url)

    if dry_run:
        return {"result": after, "before": before, "dry_run": True, "warnings": []}

    audit_id = db[AUDIT_COLLECTION].insert_one({
        "link_id": oid,
        "topic": link.toTopic,
        "ref": link.ref,
        "lang": lang,
        "uid": uid,
        "via": via,
        "status": "pending",
        "before": {**_audit_fields(before), "version": before["version"]},
        "after": {**_audit_fields(after), "version": after["version"]},
        "date": datetime.datetime.utcnow(),
    }).inserted_id

    def mark_audit(status):
        db[AUDIT_COLLECTION].update_one({"_id": audit_id}, {"$set": {"status": status}})

    try:
        result = db[RefTopicLink.collection].update_one(
            {"_id": oid, "class": "refTopic", f"descriptions.{lang}": original_description},
            {"$set": {f"descriptions.{lang}": new_description}},
        )
    except Exception:
        _best_effort(mark_audit, "failed")
        raise
    if result.matched_count == 0:
        _best_effort(mark_audit, "conflict")
        current = _current_or_none(oid, lang, topic_titles, base_url)
        if current is None:
            raise TopicPromptNotFound(f"Topic prompt {link_id} was deleted while being edited")
        raise TopicPromptConflict("This prompt was changed while you were saving.", current)

    # The content is committed. Nothing below may turn this into a failure for the caller.
    warnings = []
    if not _best_effort(mark_audit, "applied"):
        warnings.append("Saved, but the audit record could not be marked applied. It remains 'pending'.")
    if not _best_effort(notify, link, "save", orig_vals={}, is_new=False):
        warnings.append("Saved, but a post-save callback failed.")
    return {"result": after, "before": before, "dry_run": False, "warnings": warnings}


def _best_effort(func, *args, **kwargs):
    try:
        func(*args, **kwargs)
        return True
    except Exception:
        logger.exception("topic_prompts_admin.best_effort_failed", func=getattr(func, "__name__", str(func)))
        return False


MAX_BATCH = 50


def set_published(items, lang, published, uid, dry_run=False, base_url="", via="session"):
    """
    Publishes (or unpublishes) descriptions, as the topic page's "Publish" button does through
    /api/ref-topic-links/bulk, but per description and atomically.
    `items` is a list of {"id", "base_version"} read with list_prompts.

    Publishing follows the topic page's rule (getLinksToPublish): only a description whose
    review_state is not "not reviewed". Unpublishing has no such rule; it hides the description from
    readers again (moderators still see it).

    Returns {"results": [{"id", "status", "result"?}], "dry_run": bool}. A status is one of
    "published", "unpublished", "unchanged", "not_reviewed", "conflict" or "not_found"; an item
    that fails does not stop the others.
    """
    _validate_lang(lang)
    published = _bool_param(published, "published")
    if published is None:
        raise InputError("published must be true or false")
    if not isinstance(items, list) or not items:
        raise InputError("items must be a non-empty list of {id, base_version}")
    if len(items) > MAX_BATCH:
        raise InputError(f"At most {MAX_BATCH} items at a time")

    results = []
    for item in items:
        link_id = item.get("id") if isinstance(item, dict) else None
        base_version = item.get("base_version") if isinstance(item, dict) else None
        if not link_id or not base_version:
            raise InputError("Each item needs an id and the base_version you read")
        results.append(_set_one_published(link_id, base_version, lang, published, uid, dry_run, base_url, via))
    return {"results": results, "dry_run": dry_run}


def _set_one_published(link_id, base_version, lang, published, uid, dry_run, base_url, via):
    oid = _parse_object_id(link_id)
    link = RefTopicLink().load({"_id": oid})
    if link is None or lang not in getattr(link, "descriptions", {}):
        return {"id": link_id, "status": "not_found"}
    topic_titles = _get_topic_titles([link.toTopic])
    before = serialize_prompt(link, lang, topic_titles, base_url)
    if before["version"] != base_version:
        return {"id": link_id, "status": "conflict", "result": before}
    if before["published"] == published:
        return {"id": link_id, "status": "unchanged", "result": before}
    if published and before["review_state"] == "not reviewed":
        return {"id": link_id, "status": "not_reviewed", "result": before}

    original = copy.deepcopy(link.descriptions[lang])
    new_description = {**original, "published": published}
    after = serialize_prompt(link, lang, topic_titles, base_url, descriptions={lang: new_description})
    status = "published" if published else "unpublished"
    if dry_run:
        return {"id": link_id, "status": status, "result": after}

    audit_id = db[AUDIT_COLLECTION].insert_one({
        "link_id": oid, "topic": link.toTopic, "ref": link.ref, "lang": lang, "uid": uid, "via": via,
        "action": "publish" if published else "unpublish", "status": "pending",
        "before": {"published": before["published"], "version": before["version"]},
        "after": {"published": published, "version": after["version"]},
        "date": datetime.datetime.utcnow(),
    }).inserted_id
    result = db[RefTopicLink.collection].update_one(
        {"_id": oid, "class": "refTopic", f"descriptions.{lang}": original},
        {"$set": {f"descriptions.{lang}.published": published}},
    )
    if result.matched_count == 0:
        _best_effort(lambda: db[AUDIT_COLLECTION].update_one({"_id": audit_id}, {"$set": {"status": "conflict"}}))
        current = _current_or_none(oid, lang, topic_titles, base_url)
        return {"id": link_id, "status": "conflict" if current else "not_found", **({"result": current} if current else {})}
    _best_effort(lambda: db[AUDIT_COLLECTION].update_one({"_id": audit_id}, {"$set": {"status": "applied"}}))
    link.descriptions[lang] = new_description
    _best_effort(notify, link, "save", orig_vals={}, is_new=False)
    return {"id": link_id, "status": status, "result": after}


def generate_prompts(topic_slug, link_ids, lang):
    """
    Queues AI generation for sources of a topic that have an editor's context ("ai_context") and no
    prompt yet, as the topic page's "Generate" button does (getLinksToGenerate →
    /api/topics/generate-prompts). The output is saved unpublished and "not reviewed".
    `link_ids` narrows the batch; omitted, every eligible source of the topic in `lang` is queued.
    Returns {"task_ids": [...], "queued": [{"id", "ref"}], "skipped": [{"id", "reason"}]}.
    """
    from sefaria.model import Topic
    from sefaria.helper.llm.tasks.topic_prompts import generate_and_save_topic_prompts

    _validate_lang(lang)
    topic = Topic.init(topic_slug)
    if topic is None:
        raise InputError(f"No topic {topic_slug}")
    query = {"toTopic": topic_slug, f"descriptions.{lang}": {"$exists": True}}
    if link_ids:
        if len(link_ids) > MAX_BATCH:
            raise InputError(f"At most {MAX_BATCH} sources at a time")
        query["_id"] = {"$in": [_parse_object_id(i) for i in link_ids]}
    queued, skipped, orefs, hints = [], [], [], []
    for link in RefTopicLinkSet(query, sort=[("_id", 1)], limit=MAX_BATCH):
        description = link.descriptions.get(lang, {})
        if description.get("prompt"):
            skipped.append({"id": str(link._id), "reason": "already has a prompt"})
        elif not description.get("ai_context"):
            skipped.append({"id": str(link._id), "reason": "no ai_context: add one with update_topic_prompt first"})
        else:
            orefs.append(Ref(link.ref))
            hints.append(description["ai_context"])
            queued.append({"id": str(link._id), "ref": link.ref})
    task_ids = [generate_and_save_topic_prompts(lang, topic, orefs, hints).id] if orefs else []
    return {"task_ids": task_ids, "queued": queued, "skipped": skipped}
