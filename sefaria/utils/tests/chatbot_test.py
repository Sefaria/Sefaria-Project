from django.test import RequestFactory

from sefaria.utils.chatbot import resolve_chatbot_version


def _request(query=None, session=None):
    request = RequestFactory().get("/", query or {})
    request.session = dict(session or {})
    return request


def test_query_param_is_returned_and_persisted():
    request = _request({"chatbot_version": "212"})
    assert resolve_chatbot_version(request) == "212"
    assert request.session["chatbot_version"] == "212"


def test_first_request_resolves_same_version_on_every_call():
    # The reader view and the context processor both resolve on the same request.
    request = _request({"chatbot_version": "212"})
    assert resolve_chatbot_version(request) == resolve_chatbot_version(request) == "212"


def test_falls_back_to_session():
    assert resolve_chatbot_version(_request(session={"chatbot_version": "212"})) == "212"


def test_clear_forgets_version():
    request = _request({"chatbot_version": "clear"}, {"chatbot_version": "212"})
    assert resolve_chatbot_version(request) is None
    assert "chatbot_version" not in request.session


def test_no_version():
    assert resolve_chatbot_version(_request()) is None
