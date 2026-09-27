"""
Views for the translation-feedback POC.

  POST /api/translation-feedback               save feedback from the reader (anonymous allowed)
  POST /api/translation-feedback/<id>/accept   apply a suggestion to the text (login required)
  GET  /translation-feedback                   dashboard, open to anyone with the URL (not linked)
"""
import json
import urllib.parse
from datetime import datetime, timezone

from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_POST

from sefaria.client.util import jsonResponse
from sefaria.model import Ref
from sefaria.model.translation_feedback import ASSESSMENT_LEGEND, STATUS_ACCEPTED
from sefaria.helper.translation_feedback import create_feedback, accept_feedback, list_feedback
from sefaria.system.decorators import catch_error_as_json
from sefaria.system.exceptions import InputError

MAX_BODY_BYTES = 20000


def _json_body(request):
    if len(request.body or b"") > MAX_BODY_BYTES:
        raise InputError("Request too large.")
    try:
        return json.loads(request.body or b"{}")
    except ValueError:
        raise InputError("Invalid JSON.")


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


def _row(fb):
    created = datetime.fromtimestamp(fb.created, tz=timezone.utc)
    return {
        "id": str(fb._id),
        "date": created.strftime("%Y-%m-%d %H:%M UTC"),
        "ref": fb.ref,
        "reader_url": _reader_url(fb),
        "history_url": _history_url(fb),
        "version_title": fb.version_title,
        "word": fb.word,
        "occurrence": fb.occurrence + 1,
        "user_id": getattr(fb, "user_id", None),
        "suggestion": getattr(fb, "suggestion", None),
        "comment": getattr(fb, "comment", None),
        "assessment": getattr(fb, "llm_assessment", None),
        "note": getattr(fb, "llm_note", None),
        "accepted": fb.status == STATUS_ACCEPTED,
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
