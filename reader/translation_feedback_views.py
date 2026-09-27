"""
Views for the translation-feedback POC.

  GET  /api/translation-feedback/segment       source + translation text of a segment, for the dialog
  POST /api/translation-feedback               save feedback from the reader (anonymous allowed)
  POST /api/translation-feedback/<id>/accept   apply a suggestion to the text (login required)
  GET  /translation-feedback                   dashboard, open to anyone with the URL (not linked)
"""
import difflib
import json
import urllib.parse
from datetime import datetime, timezone

from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from sefaria.client.util import jsonResponse
from sefaria.model import Ref
from sefaria.model.translation_feedback import ASSESSMENT_LEGEND, STATUS_ACCEPTED, visible_text, has_markup
from sefaria.helper.translation_feedback import create_feedback, accept_feedback, list_feedback, get_segment_texts
from sefaria.system.decorators import catch_error_as_json
from sefaria.system.exceptions import InputError

MAX_BODY_BYTES = 64000  # a whole-segment suggestion plus comment, UTF-8


def _json_body(request):
    if len(request.body or b"") > MAX_BODY_BYTES:
        raise InputError("Request too large.")
    try:
        return json.loads(request.body or b"{}")
    except ValueError:
        raise InputError("Invalid JSON.")


@catch_error_as_json
@require_GET
def translation_feedback_segment_api(request):
    return jsonResponse(get_segment_texts(request.GET.get("ref"), request.GET.get("versionTitle"),
                                          request.GET.get("actualLanguage")))


@catch_error_as_json
@require_POST
@csrf_protect
def translation_feedback_api(request):
    data = _json_body(request)
    user_id = request.user.id if request.user.is_authenticated else None
    feedback = create_feedback(data, user_id=user_id)
    return jsonResponse({"status": "ok", "id": str(feedback._id)})


@catch_error_as_json
@require_POST
@csrf_protect
def translation_feedback_accept_api(request, feedback_id):
    if not request.user.is_authenticated:
        return jsonResponse({"error": "You must be logged in to accept a suggestion."}, status=403)
    feedback, new_text = accept_feedback(feedback_id, request.user.id)
    return jsonResponse({"status": "ok", "id": str(feedback._id), "text": new_text})


def _reader_url(fb):
    try:
        url = "/" + Ref(fb.ref).url()
    except Exception:
        return None
    family = getattr(fb, "language_family", None) or "english"
    params = urllib.parse.urlencode({"ven": "{}|{}".format(family, fb.version_title.replace(" ", "_")), "lang": "bi"})
    return "{}?{}".format(url, params)


def _history_url(fb):
    try:
        url_ref = Ref(fb.ref).url()
    except Exception:
        return None
    return "/activity/{}/{}/{}".format(url_ref, fb.language, urllib.parse.quote(fb.version_title.replace(" ", "_")))


def word_diff(old, new):
    """
    Word-level diff of two plain texts as a list of {"op": "same"|"del"|"ins", "text": ...}
    chunks, for the dashboard (rendered with autoescaping).
    """
    a, b = old.split(), new.split()
    chunks = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if op == "equal":
            chunks.append({"op": "same", "text": " ".join(a[i1:i2])})
            continue
        if op in ("replace", "delete"):
            chunks.append({"op": "del", "text": " ".join(a[i1:i2])})
        if op in ("replace", "insert"):
            chunks.append({"op": "ins", "text": " ".join(b[j1:j2])})
    return chunks


def _row(fb):
    created = datetime.fromtimestamp(fb.created, tz=timezone.utc)
    return {
        "id": str(fb._id),
        "date": created.strftime("%Y-%m-%d %H:%M UTC"),
        "ref": fb.ref,
        "reader_url": _reader_url(fb),
        "history_url": _history_url(fb),
        "version_title": fb.version_title,
        "word": getattr(fb, "word", None),
        "occurrence": (fb.occurrence + 1) if getattr(fb, "occurrence", None) is not None else None,
        "user_id": getattr(fb, "user_id", None),
        "suggestion": getattr(fb, "suggestion", None),
        "comment": getattr(fb, "comment", None),
        "assessment": getattr(fb, "llm_assessment", None),
        "note": getattr(fb, "llm_note", None),
        "accepted": fb.status == STATUS_ACCEPTED,
        "diff": word_diff(visible_text(getattr(fb, "segment_text", "")), fb.suggestion)
                if fb.has_suggestion() and not fb.is_word_level() else None,
        "drops_markup": fb.has_suggestion() and not fb.is_word_level() and has_markup(getattr(fb, "segment_text", "")),
    }


@ensure_csrf_cookie
def translation_feedback_dashboard(request):
    from reader.views import render_template
    from sefaria.helper.llm.translation_feedback import assess_stale_in_background
    try:
        assess_stale_in_background()
    except Exception:
        pass  # never let the dashboard fail because of the LLM retry sweep
    rows = [_row(fb) for fb in list_feedback()]
    return render_template(request, "translation_feedback.html", None, {
        "rows": rows,
        "legend": ASSESSMENT_LEGEND,
        "logged_in": request.user.is_authenticated,
        "login_url": "/login?next=" + urllib.parse.quote(request.get_full_path()),
    })
