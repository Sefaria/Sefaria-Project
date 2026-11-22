"""
The home page redirect keeps the query string, so ?chatbot_version=N on "/" reaches
apply_chatbot_version_param on the /texts request just as it does on /texts directly.
"""

from django.test import RequestFactory

from reader.views import home
from sefaria.system.context_processors import apply_chatbot_version_param


def test_home_redirect_keeps_chatbot_version_query_string():
    response = home(RequestFactory().get("/", {"chatbot_version": "9298"}))
    assert response.status_code == 302
    assert response["Location"] == "/texts?chatbot_version=9298"


def test_home_redirect_without_query_string_is_unchanged():
    response = home(RequestFactory().get("/"))
    assert response.status_code == 302
    assert response["Location"] == "/texts"


def _request(query, session=None):
    request = RequestFactory().get("/texts", query)
    request.session = session if session is not None else {}
    return request


def test_param_is_saved_to_the_session_and_returned_on_the_same_request():
    request = _request({"chatbot_version": "9298"})
    assert apply_chatbot_version_param(request) == "9298"
    assert request.session["chatbot_version"] == "9298"


def test_clear_removes_the_session_value():
    request = _request({"chatbot_version": "clear"}, {"chatbot_version": "9298"})
    assert apply_chatbot_version_param(request) == ""
    assert "chatbot_version" not in request.session


def test_session_value_is_used_without_a_param():
    assert apply_chatbot_version_param(_request({}, {"chatbot_version": "9298"})) == "9298"
