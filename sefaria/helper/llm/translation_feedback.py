"""
LLM assessment of reader feedback on AI translations (POC, see sefaria.model.translation_feedback).

The call runs off the request thread: `assess_in_background(feedback_id)` starts a daemon thread in
the web process. Cauldrons don't run Celery workers (tasks.enabled is false by default), so a
Celery task would never execute there; the dashboard also calls `assess_stale_in_background()` so
anything a restarted pod dropped gets picked up later.

Needs ANTHROPIC_API_KEY (Django setting or env var) in the *web* pod. Without it, records get
assessment "?" and a note explaining why, instead of an error.
"""
import json
import os
import threading

import regex
import structlog
from bson import ObjectId

from sefaria.system.database import db
from sefaria.model.translation_feedback import TranslationFeedback, ASSESSMENT_VALUES, now_epoch

logger = structlog.get_logger(__name__)

DEFAULT_MODEL = "claude-sonnet-4-6"  # same default as sefaria/helper/linker/disambiguator.py
CLAIM_TIMEOUT_SECONDS = 300          # a claimed-but-unfinished attempt older than this may be retried
STALE_PENDING_SECONDS = 60           # dashboard picks up pending records older than this
RETRY_UNAVAILABLE_SECONDS = 600      # and "?" records whose last attempt is older than this
MAX_STALE_PER_LOAD = 5

SYSTEM_PROMPT = """You review reader feedback on machine-generated translations of Jewish texts for Sefaria.
A reader looked at one segment (a verse, mishnah, or paragraph) of a translation and may have suggested a new translation for the whole segment and/or left a comment.

Rate the feedback with exactly one of these codes:
1 - Excellent suggestion, worthy of quickly updating the translation
2 - Good suggestion, suggest human review
3 - Not likely a good suggestion, suggest human review
4 - Bad suggestion, not worth considering (wrong, vandalism, spam, or nonsense)
C - Comment only (use this if and only if there is no suggestion)

Judge a suggestion by comparing the suggested translation with the current one against the source text: focus on what the reader changed. Is the new wording a more accurate, clearer or more idiomatic rendering of the source, and does it avoid dropping or adding meaning elsewhere in the segment? Consider the reader's reasoning if given, but verify it yourself.
For comment-only feedback, briefly assess whether the comment points to a real issue in the translation and what, if anything, an editor should do.

Reply with only a JSON object, no other text:
{"assessment": "<1|2|3|4|C>", "note": "<at most 3 concise sentences for an editor, saying what changed and whether it is right>"}"""


def _setting(name, default=None):
    from django.conf import settings
    return getattr(settings, name, None) or os.getenv(name) or default


def get_model_name():
    return _setting("TRANSLATION_FEEDBACK_LLM_MODEL", DEFAULT_MODEL)


def _get_llm():
    api_key = _setting("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured on this server")
    from langchain_anthropic import ChatAnthropic
    return ChatAnthropic(model=get_model_name(), max_tokens=1024, api_key=api_key, timeout=60, max_retries=2)


def _strip_html(text):
    from sefaria.model.translation_feedback import visible_text
    return visible_text(text).strip()


def build_prompt(feedback):
    from sefaria.model import Ref
    from sefaria.helper.translation_feedback import source_text
    oref = Ref(feedback.ref)
    suggestion = (getattr(feedback, "suggestion", None) or "").strip()
    comment = (getattr(feedback, "comment", None) or "").strip()
    lines = [
        "Book: {}".format(oref.index.title),
        "Ref: {}".format(oref.normal()),
        "Translation version: {} (language: {})".format(feedback.version_title,
                                                        getattr(feedback, "actual_language", None) or feedback.language),
        "",
        "<source_text>\n{}\n</source_text>".format(_strip_html(source_text(oref))),
        "",
        "<current_translation>\n{}\n</current_translation>".format(_strip_html(getattr(feedback, "segment_text", ""))),
        "",
    ]
    if feedback.is_word_level():
        lines.append("Selected word: \"{}\" (occurrence #{} of that word in the translation segment)".format(
            feedback.word, feedback.occurrence + 1))
        lines.append("Suggested replacement for that word: {}".format(
            "\"{}\"".format(suggestion) if suggestion else "(none - comment only)"))
    else:
        lines.append("<suggested_translation>\n{}\n</suggested_translation>".format(
            suggestion if suggestion else "(none - comment only)"))
    lines.append("Reader comment: {}".format(comment if comment else "(none)"))
    return "\n".join(lines)


_JSON_OBJ_RE = regex.compile(r"\{(?:[^{}]|(?R))*\}", regex.DOTALL)
_LOOSE_RE = regex.compile(r"assessment\"?\s*[:=]\s*\"?([1-4Cc])\b")


def parse_response(text, has_suggestion):
    """
    Parse the model's reply into (assessment, note). Tolerates code fences, extra prose, and
    near-JSON. Enforces: "C" only when there is no suggestion; no suggestion -> always "C".
    """
    text = (text or "").strip()
    assessment, note = None, None
    for m in _JSON_OBJ_RE.finditer(text):
        try:
            obj = json.loads(m.group(0))
        except ValueError:
            continue
        if isinstance(obj, dict) and "assessment" in obj:
            assessment = str(obj.get("assessment", "")).strip().upper()[:1] or None
            note = obj.get("note")
            break
    if assessment is None:
        m = _LOOSE_RE.search(text)
        if m:
            assessment = m.group(1).upper()
            note = text
    if not has_suggestion:
        assessment = "C" if assessment is not None else "?"
    elif assessment == "C":
        assessment = "?"
        note = "Model answered C although there is a suggestion. " + (note or "")
    if assessment not in ASSESSMENT_VALUES:
        assessment = "?"
        note = "Could not parse model output: " + text[:500]
    note = (str(note) if note is not None else "").strip()[:2000]
    return assessment, note


def assess(feedback):
    """Call the LLM for a TranslationFeedback. Returns (assessment, note); never raises."""
    try:
        llm = _get_llm()
    except Exception as e:
        return "?", "LLM unavailable: {}".format(e)
    from langchain_core.messages import SystemMessage, HumanMessage
    try:
        response = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=build_prompt(feedback))])
    except Exception as e:
        logger.warning("translation_feedback: LLM call failed", feedback_id=str(feedback._id), error=repr(e))
        return "?", "LLM unavailable: {}".format(repr(e)[:300])
    content = getattr(response, "content", "")
    if isinstance(content, list):  # list of content blocks
        content = "".join(b.get("text", "") if isinstance(b, dict) else str(b) for b in content)
    return parse_response(content, feedback.has_suggestion())


def _claim(feedback_id):
    """Atomically mark a record as being assessed, so concurrent threads/pods don't double-call."""
    now = now_epoch()
    return db.translation_feedback.find_one_and_update(
        {
            "_id": ObjectId(feedback_id),
            "$or": [
                {"llm_assessment": None, "llm_started": None},
                {"llm_assessment": None, "llm_started": {"$lt": now - CLAIM_TIMEOUT_SECONDS}},
                {"llm_assessment": "?", "llm_started": {"$lt": now - RETRY_UNAVAILABLE_SECONDS}},
            ],
        },
        {"$set": {"llm_started": now}},
    )


def assess_and_save(feedback_id):
    if not _claim(feedback_id):
        return None
    feedback = TranslationFeedback().load_by_id(feedback_id)
    if not feedback:
        return None
    assessment, note = assess(feedback)
    feedback.llm_assessment = assessment
    feedback.llm_note = note
    feedback.llm_model = get_model_name()
    feedback.llm_assessed = now_epoch()
    feedback.save()
    return feedback


def _run_safely(feedback_id):
    try:
        assess_and_save(feedback_id)
    except Exception as e:
        logger.exception("translation_feedback: assessment thread failed", feedback_id=str(feedback_id), error=repr(e))


def assess_in_background(feedback_id):
    t = threading.Thread(target=_run_safely, args=(str(feedback_id),), daemon=True,
                         name="translation-feedback-{}".format(feedback_id))
    t.start()
    return t


def assess_stale_in_background(limit=MAX_STALE_PER_LOAD):
    """Kick off assessment for records whose first attempt never finished (or couldn't reach the LLM)."""
    now = now_epoch()
    query = {
        "$or": [
            {"llm_assessment": None, "created": {"$lt": now - STALE_PENDING_SECONDS},
             "$or": [{"llm_started": None}, {"llm_started": {"$lt": now - CLAIM_TIMEOUT_SECONDS}}]},
            {"llm_assessment": "?", "llm_started": {"$lt": now - RETRY_UNAVAILABLE_SECONDS}},
        ]
    }
    ids = [d["_id"] for d in db.translation_feedback.find(query, {"_id": 1}).sort("created", -1).limit(limit)]
    for _id in ids:
        assess_in_background(_id)
    return ids
