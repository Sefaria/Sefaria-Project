"""
Translation feedback POC: the accept/reject/reopen endpoints and the dashboard. Records are created
directly (the reject flow never touches the text; the text side is covered in
sefaria/helper/tests/translation_feedback_test.py).
"""
import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory

import reader.translation_feedback_views as views
from sefaria.model.translation_feedback import (
    TranslationFeedback, TranslationFeedbackSet, STATUS_NEW, STATUS_ACCEPTED, STATUS_REJECTED,
)

REF = "Translation Feedback Views Test 1:1"


@pytest.fixture
def records():
    created = []

    def make(**attrs):
        base = {"ref": REF, "version_title": "Test Version", "language": "en", "created": 1700000000 + len(created),
                "status": STATUS_NEW, "suggestion": "In the beginning", "comment": None, "user_id": None,
                "segment_text": "At the start", "llm_assessment": None}
        base.update(attrs)
        fb = TranslationFeedback(base).save()
        created.append(fb)
        return fb

    yield make
    TranslationFeedbackSet({"ref": REF}).delete()


def _post(path, user=None):
    request = RequestFactory().post(path, data="{}", content_type="application/json")
    request._dont_enforce_csrf_checks = True
    request.user = user or AnonymousUser()
    return request


def _user(uid=7):
    return SimpleNamespace(is_authenticated=True, id=uid)


def _json(response):
    return json.loads(response.content)


@pytest.mark.parametrize("view", [views.translation_feedback_accept_api, views.translation_feedback_reject_api,
                                  views.translation_feedback_reopen_api])
def test_decisions_require_login(records, view):
    fb = records(status=STATUS_REJECTED if view is views.translation_feedback_reopen_api else STATUS_NEW)
    before = fb.status
    response = view(_post("/api/translation-feedback/x"), str(fb._id))
    assert response.status_code == 403
    assert "logged in" in _json(response)["error"]
    assert TranslationFeedback().load_by_id(fb._id).status == before


def test_reject_and_reopen_api(records):
    fb = records(suggestion=None, comment="Comment only")
    with patch("sefaria.tracker.modify_text") as modify_text:
        response = views.translation_feedback_reject_api(_post("/", _user()), str(fb._id))
        assert response.status_code == 200
        data = _json(response)
        assert data["status"] == "ok" and data["decided_at"].endswith("UTC")
        loaded = TranslationFeedback().load_by_id(fb._id)
        assert loaded.status == STATUS_REJECTED and loaded.decided_by == 7
        modify_text.assert_not_called()  # reject never writes the text

        again = views.translation_feedback_reject_api(_post("/", _user()), str(fb._id))
        assert "already rejected" in _json(again)["error"]

        response = views.translation_feedback_reopen_api(_post("/", _user()), str(fb._id))
        assert _json(response)["status"] == "ok"
        assert TranslationFeedback().load_by_id(fb._id).status == STATUS_NEW
        modify_text.assert_not_called()


def test_user_label_is_id_only():
    assert views.user_label(5) == "#5"
    assert views.user_label(None) == "anon"


def test_dashboard_rows(records):
    records(word="beginning", occurrence=0, suggestion="start", llm_assessment="2", user_id=5)   # legacy word row
    records(llm_assessment="1", comment="Better & clearer", user_id=5)                            # segment row
    records(status=STATUS_ACCEPTED, accepted_by=6, accepted_at=1700000100, llm_assessment="3")  # accepted, older record
    records(status=STATUS_REJECTED, decided_by=6, decided_at=1700000200, llm_assessment="?")
    records(suggestion=None, comment="Comment only")                                             # pending
    rows = {r["grade"]: r for r in (views._row(fb) for fb in TranslationFeedbackSet({"ref": REF}))}
    assert rows["2"]["word"] == "beginning" and rows["2"]["diff"] is None
    assert rows["1"]["diff"] and rows["1"]["user_label"] == "#5"
    assert rows["1"]["search_text"] == REF + " In the beginning Better & clearer"
    assert rows["3"]["status"] == "accepted" and rows["3"]["decided_by_label"] == "#6"
    assert rows["?"]["status"] == "rejected" and rows["?"]["grade_class"] == "aQ"
    assert rows["pending"]["status"] == "undecided" and rows["pending"]["user_label"] == "anon"
    assert [rows[g]["grade_rank"] for g in ("1", "2", "3", "?", "pending")] == [0, 1, 2, 5, 6]


def test_dashboard_renders(records):
    records(word="beginning", occurrence=0, suggestion="start", llm_assessment="2", user_id=5)
    records(llm_assessment="1", comment="<b>not html</b>")
    records(status=STATUS_ACCEPTED, accepted_by=6, accepted_at=1700000100, llm_assessment="3")
    records(status=STATUS_REJECTED, decided_by=6, decided_at=1700000200, llm_assessment="4")
    records(suggestion=None, comment="Comment only")
    request = RequestFactory().get("/translation-feedback", {"status": "undecided"})
    request.user = AnonymousUser()
    with patch("sefaria.helper.llm.translation_feedback.assess_stale_in_background"), \
         patch.object(views, "list_feedback", lambda: TranslationFeedbackSet({"ref": REF}, sort=[("created", -1)])), \
         patch("reader.views.render_template", _render_plain):
        html = views.translation_feedback_dashboard(request).content.decode()
    assert '<details class="legend">' in html and "What do the grades mean?" in html
    assert 'id="tfFilters"' in html and 'id="tfUsers"' in html
    assert '<option value="anon">' in html and '<option value="#5">' in html
    assert html.count('type="checkbox" name="grade"') == 7 and html.count('type="checkbox" name="status"') == 3
    assert 'data-sort="date"' in html and 'data-sort="grade"' in html
    assert html.count('data-status="undecided"') == 3
    assert 'data-status="accepted"' in html and 'data-status="rejected"' in html
    assert "&lt;b&gt;not html&lt;/b&gt;" in html
    assert "Log in to accept or reject" in html and 'data-action="reject"' not in html


def _render_plain(request, template_name, app_props=None, template_context=None, **kwargs):
    """Render just the page template's own blocks, without base.html's site chrome and context processors."""
    from django.http import HttpResponse
    from django.template import engines
    from django.template.loader import get_template
    with open(get_template(template_name).origin.name) as f:
        source = f.read().replace('{% extends "base.html" %}', "")
    return HttpResponse(engines["django"].from_string(source).render(template_context))
