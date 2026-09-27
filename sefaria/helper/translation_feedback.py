"""
Business logic for the translation-feedback POC: creating feedback records from the reader and
accepting a suggestion into the text (through sefaria.tracker, so it shows in history/activity).
"""
import structlog

from sefaria.model import Ref, Version, VersionSet, TextChunk
from sefaria.model.translation_feedback import (
    TranslationFeedback, TranslationFeedbackSet, STATUS_NEW, STATUS_ACCEPTED,
    MAX_SUGGESTION_LEN, MAX_COMMENT_LEN,
    replace_word, WordReplacementError, now_epoch,
    visible_text, normalize_space, segment_replacement,
)
from sefaria.system.exceptions import InputError

logger = structlog.get_logger(__name__)

HISTORY_METHOD = "Translation Feedback"


def _clean_text(value, max_len, field):
    if value is None:
        return None
    if not isinstance(value, str):
        raise InputError("'{}' must be a string.".format(field))
    value = value.strip()
    if len(value) > max_len:
        raise InputError("'{}' is too long (max {} characters).".format(field, max_len))
    return value or None


def _load_version(oref, version_title, actual_language=None):
    query = {"title": oref.index.title, "versionTitle": version_title}
    if actual_language:
        query["actualLanguage"] = actual_language
    versions = VersionSet(query).array()
    if not versions and actual_language:
        versions = VersionSet({"title": oref.index.title, "versionTitle": version_title}).array()
    if not versions:
        raise InputError("Unknown version '{}' of {}.".format(version_title, oref.index.title))
    if len(versions) > 1:
        # same title in two languages; prefer the non-primary one since feedback is on translations
        versions = [v for v in versions if not getattr(v, "isPrimary", False)] or versions
    return versions[0]


def _segment_text(oref, version):
    chunk = TextChunk(oref, vtitle=version.versionTitle, actual_lang=getattr(version, "actualLanguage", None),
                      direction=getattr(version, "direction", None))
    return chunk.text


def _segment_ref(tref):
    try:
        oref = Ref(tref or "")
    except Exception:
        raise InputError("Invalid ref.")
    if not oref.is_segment_level():
        raise InputError("Feedback must be on a single segment.")
    return oref


def source_text(oref):
    """Primary (source-language) text of the segment, best effort; "" if there is none."""
    try:
        primary = VersionSet({"title": oref.index.title, "isPrimary": True}, limit=1).array()
        if primary:
            v = primary[0]
            return TextChunk(oref, vtitle=v.versionTitle, actual_lang=getattr(v, "actualLanguage", None),
                             direction=getattr(v, "direction", None)).text
        return TextChunk(oref, lang="he").text
    except Exception as e:
        logger.warning("translation_feedback: could not load source text", ref=oref.normal(), error=repr(e))
        return ""


def get_segment_texts(tref, version_title, actual_language=None):
    """
    Plain text of the source (Hebrew/Aramaic) and of the given translation for one segment, for the
    reader's feedback dialog. Returns {"ref", "he", "translation"}.
    """
    oref = _segment_ref(tref)
    version_title = _clean_text(version_title, 500, "versionTitle")
    if not version_title:
        raise InputError("Missing versionTitle.")
    version = _load_version(oref, version_title, _clean_text(actual_language, 20, "actualLanguage"))
    he = source_text(oref)
    translation = _segment_text(oref, version)
    return {
        "ref": oref.normal(),
        "he": visible_text(he).strip() if isinstance(he, str) else "",
        "translation": visible_text(translation).strip() if isinstance(translation, str) else "",
    }


def create_feedback(data, user_id=None, run_assessment=True):
    """
    `data` keys: ref (segment), versionTitle, actualLanguage (optional), suggestion (a plain-text
    replacement for the whole segment), comment. Returns the saved TranslationFeedback.
    """
    if not isinstance(data, dict):
        raise InputError("Expected a JSON object.")
    oref = _segment_ref(data.get("ref"))

    version_title = _clean_text(data.get("versionTitle"), 500, "versionTitle")
    if not version_title:
        raise InputError("Missing versionTitle.")
    version = _load_version(oref, version_title, _clean_text(data.get("actualLanguage"), 20, "actualLanguage"))
    if getattr(version, "isPrimary", False):
        raise InputError("Feedback is only collected on translations.")

    segment_text = _segment_text(oref, version)
    if not isinstance(segment_text, str) or not segment_text:
        raise InputError("No text found for {} in {}.".format(oref.normal(), version.versionTitle))

    suggestion = _clean_text(data.get("suggestion"), MAX_SUGGESTION_LEN, "suggestion")
    if suggestion and normalize_space(suggestion) == normalize_space(visible_text(segment_text)):
        suggestion = None  # "Start with existing" and saved without changes: not a suggestion
    comment = _clean_text(data.get("comment"), MAX_COMMENT_LEN, "comment")
    if not suggestion and not comment:
        raise InputError("Please change the translation or enter a comment.")

    feedback = TranslationFeedback({
        "ref": oref.normal(),
        "version_title": version.versionTitle,
        "language": version.language,
        "actual_language": getattr(version, "actualLanguage", None),
        "language_family": getattr(version, "languageFamilyName", None),
        "suggestion": suggestion,
        "comment": comment,
        "user_id": user_id,
        "segment_text": segment_text,
        "llm_assessment": None,
        "llm_note": None,
        "created": now_epoch(),
        "status": STATUS_NEW,
    }).save()

    if run_assessment:
        from sefaria.helper.llm.translation_feedback import assess_in_background
        assess_in_background(feedback._id)
    return feedback


def accept_feedback(feedback_id, user_id):
    """
    Replace the segment with the suggestion via tracker.modify_text (logs history, purges Varnish,
    reindexes). Refuses if the segment changed since the feedback was given. Returns
    (feedback, new_segment_text).
    """
    from sefaria import tracker
    try:
        feedback = TranslationFeedback().load_by_id(feedback_id)
    except Exception:
        feedback = None
    if not feedback:
        raise InputError("Feedback not found.")
    if feedback.status == STATUS_ACCEPTED:
        raise InputError("This suggestion was already accepted.")
    if not feedback.has_suggestion():
        raise InputError("This feedback has no suggestion to accept.")

    oref = Ref(feedback.ref)
    version = _load_version(oref, feedback.version_title, getattr(feedback, "actual_language", None))
    current = _segment_text(oref, version)
    current = current if isinstance(current, str) else ""
    if feedback.is_word_level():
        # legacy record from the word-level POC
        try:
            new_text = replace_word(current, feedback.word, feedback.occurrence, feedback.suggestion.strip())
        except WordReplacementError as e:
            raise InputError(str(e))
    else:
        if current != getattr(feedback, "segment_text", None):
            raise InputError("The translation of this segment has changed since this feedback was given; "
                             "please review and edit it manually.")
        new_text = segment_replacement(feedback.suggestion)

    tracker.modify_text(user_id, oref, version.versionTitle, getattr(version, "actualLanguage", None) or version.language,
                        new_text, direction=getattr(version, "direction", None), method=HISTORY_METHOD)

    feedback.status = STATUS_ACCEPTED
    feedback.accepted_by = user_id
    feedback.accepted_at = now_epoch()
    feedback.save()
    return feedback, new_text


def list_feedback(limit=500):
    return TranslationFeedbackSet({}, sort=[("created", -1)], limit=limit)
