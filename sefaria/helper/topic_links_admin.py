"""
Tagging a passage with a topic (a learning-team RefTopicLink) for admin tools such as the AI chatbot's
admin MCP endpoint. These are the moderator's Topics tool in the reader sidebar (TopicSearch, which
POSTs /api/ref-topic-links/<ref>) and the topic page's source delete (SourceEditor, DELETE on the
same URL), with the guards an automated caller needs:

- tagging only creates: a passage already tagged in that language is reported, never re-saved, so a
  call can't move an existing source to the top of the topic page (edit_topic_source resets
  curatedPrimacy when asked to "create" a link that exists);
- untagging refuses a link whose description has a title or prompt, so curated prompts are not lost
  by accident; those are removed on the topic page;
- a link's languages are read from its descriptions and curated positions (see _langs). Untagging one
  language removes only that language's data, including its `availableLangs` entry; the link is deleted only
  when none is left. (delete_ref_topic_link decides that from curatedPrimacy, which author links don't
  have, and leaves availableLangs behind.)
"""
from sefaria.helper.topic import edit_topic_source
from sefaria.model import Ref, RefTopicLink
from sefaria.model.topic import AuthorTopic, Topic
from sefaria.system.exceptions import InputError

LANGS = ("en", "he")


def _link_type(slug):
    # reader/views.py _CAT_REF_LINK_TYPE_FILTER_MAP: an author's writings are "popular-writing-of"
    return "popular-writing-of" if AuthorTopic.init(slug) else "about"


def _normal_ref(tref):
    try:
        return Ref(tref).normal()
    except InputError:
        raise InputError(f"Invalid ref: {tref}")


def _check(slug, lang):
    if lang not in LANGS:
        raise InputError(f"lang must be one of {LANGS}")
    topic = Topic.init(slug)
    if topic is None:
        raise InputError(f"No topic {slug}")
    return topic


def _existing(slug, tref):
    return RefTopicLink().load({"toTopic": slug, "linkType": _link_type(slug), "ref": tref, "dataSource": "learning-team"})


def _langs(link):
    """
    The languages a learning-team link is really present in: those with a description or a curated position. Not
    `order.availableLangs`, which the topic page's delete (delete_ref_topic_link) leaves behind; and not curatedPrimacy
    alone, which author links ("popular-writing-of") never get.
    """
    order = getattr(link, "order", {}) or {}
    return set(getattr(link, "descriptions", {}) or {}) | set(order.get("curatedPrimacy", {}) or {})


def tag_ref(tref, slug, lang="en", dry_run=False):
    """Tags `tref` with topic `slug` in `lang`. Returns {"status": "tagged"|"already_tagged", "link": ...}."""
    topic = _check(slug, lang)
    tref = _normal_ref(tref)
    link = _existing(slug, tref)
    summary = {"ref": tref, "topic": slug, "topic_title": {"en": topic.get_primary_title("en"), "he": topic.get_primary_title("he")}, "lang": lang}
    if link is not None and lang in _langs(link):
        return {"status": "already_tagged", "link": {**summary, "id": str(link._id)}}
    if dry_run:
        return {"status": "tagged", "dry_run": True, "link": summary}
    result = edit_topic_source(slug, orig_tref=tref, new_tref=tref, creating_new_link=True,
                               linkType=_link_type(slug), description={}, interface_lang=lang)
    if "error" in result:
        raise InputError(result["error"])
    saved = _existing(slug, tref)
    return {"status": "tagged", "link": {**summary, "id": str(saved._id) if saved else None}}


def untag_ref(tref, slug, lang="en", dry_run=False):
    """
    Removes `lang` from a learning-team tag: its description, curated position and `availableLangs` entry. The link itself
    is deleted only when no language is left, so another language's description (curated or not) is never removed.
    Refused when this language's description has a curated title or prompt.
    """
    _check(slug, lang)
    tref = _normal_ref(tref)
    link = _existing(slug, tref)
    langs = _langs(link) if link is not None else set()
    if lang not in langs:
        return {"status": "not_tagged", "ref": tref, "topic": slug, "lang": lang}
    description = (getattr(link, "descriptions", {}) or {}).get(lang, {})
    if description.get("title") or description.get("prompt"):
        raise InputError("This source has a curated title or prompt in this language. Remove it on the topic page instead.")
    remaining = langs - {lang}
    outcome = "untagged" if remaining else "link_deleted"
    result = {"status": outcome, "ref": tref, "topic": slug, "lang": lang, "id": str(link._id), "remaining_langs": sorted(remaining)}
    if dry_run:
        return {**result, "dry_run": True}
    if remaining:
        order = getattr(link, "order", {}) or {}
        (getattr(link, "descriptions", {}) or {}).pop(lang, None)
        (order.get("curatedPrimacy", {}) or {}).pop(lang, None)
        if lang in order.get("availableLangs", []):
            order["availableLangs"] = [l for l in order["availableLangs"] if l != lang]
        link.order = order
        link.save()
    elif link.can_delete():
        link.delete()
    else:
        raise InputError(f"Cannot delete link between {tref} and {slug}.")
    return result
