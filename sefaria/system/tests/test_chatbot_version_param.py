"""
The home page redirect keeps the query string, so ?chatbot_version=N on "/" reaches
apply_chatbot_version_param on the /texts request just as it does on /texts directly.
"""

from django.test import RequestFactory

from reader.views import home


def test_home_redirect_keeps_chatbot_version_query_string():
    response = home(RequestFactory().get("/", {"chatbot_version": "9298"}))
    assert response.status_code == 302
    assert response["Location"] == "/texts?chatbot_version=9298"


def test_home_redirect_without_query_string_is_unchanged():
    response = home(RequestFactory().get("/"))
    assert response.status_code == 302
    assert response["Location"] == "/texts"
