"""Who may call /api/knn-search: the internal Bearer token, or an API key the auth service accepted."""

import pytest
from django.test import RequestFactory, override_settings

TOKEN = "test-token"
# What the auth service stamps on a request it accepted with a valid sfr_ key (enforce and observe alike).
ACCEPTED_KEY = {"HTTP_X_SEFARIA_AUTH_RESULT": "ok", "HTTP_X_SEFARIA_PROJECT": "proj_alpha", "HTTP_X_SEFARIA_TIER": "developer"}


def post(trusted, token=TOKEN, **headers):
    from api.views import KnnSearch

    # An empty query passes the auth check and stops at validation (400) before any search runs, so 400 means allowed.
    request = RequestFactory().post("/api/knn-search", data={"query": ""}, content_type="application/json", **headers)
    with override_settings(SEMANTIC_SEARCH_API_TOKEN=token, AUTH_SERVICE_HEADERS_TRUSTED=trusted):
        return KnnSearch.as_view()(request)


class TestKnnSearchAuthServiceTrusted:
    def test_bearer_token_still_works(self):
        assert post(True, HTTP_AUTHORIZATION=f"Bearer {TOKEN}").status_code == 400

    def test_accepted_key_without_bearer(self):
        assert post(True, **ACCEPTED_KEY).status_code == 400

    def test_accepted_key_with_a_wrong_bearer(self):
        assert post(True, HTTP_AUTHORIZATION="Bearer wrong", **ACCEPTED_KEY).status_code == 400

    def test_no_credentials(self):
        assert post(True).status_code == 401

    def test_wrong_bearer(self):
        assert post(True, HTTP_AUTHORIZATION="Bearer wrong").status_code == 401

    @pytest.mark.parametrize(
        "result",
        [
            # observe mode lets these through without a key; Django must still refuse them.
            "observed:api_key_required",
            "observed:api_key_invalid",
            "observed:origin_not_allowed",
            "anonymous",
            "embed",
            "jwt_pending",
            "api_key_invalid",
            "OK",
            "",
        ],
    )
    def test_any_other_auth_result_is_refused(self, result):
        assert post(True, HTTP_X_SEFARIA_AUTH_RESULT=result, HTTP_X_SEFARIA_PROJECT="proj_alpha").status_code == 401

    def test_ok_without_a_project_is_refused(self):
        assert post(True, HTTP_X_SEFARIA_AUTH_RESULT="ok").status_code == 401

    def test_no_token_configured_still_accepts_a_key(self):
        assert post(True, token="", **ACCEPTED_KEY).status_code == 400
        assert post(True, token="", HTTP_AUTHORIZATION="Bearer ").status_code == 401


class TestKnnSearchAuthServiceNotTrusted:
    """Auth service off (or headers not stripped): a client could send the x-sefaria-* headers itself."""

    def test_bearer_token_works(self):
        assert post(False, HTTP_AUTHORIZATION=f"Bearer {TOKEN}").status_code == 400

    def test_forged_auth_service_headers_are_ignored(self):
        assert post(False, **ACCEPTED_KEY).status_code == 401
