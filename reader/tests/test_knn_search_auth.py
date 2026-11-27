"""Who may call /api/knn-search: the internal Bearer token, or an API key the auth service accepted."""

import pytest
from django.test import RequestFactory, override_settings

TOKEN = "test-token"
SECRET = "test-upstream-secret"
# What the auth service stamps on a request it accepted with a valid sfr_ key (enforce and observe alike).
ACCEPTED_KEY = {
    "HTTP_X_SEFARIA_AUTH_RESULT": "ok",
    "HTTP_X_SEFARIA_PROJECT": "proj_alpha",
    "HTTP_X_SEFARIA_TIER": "developer",
    "HTTP_X_SEFARIA_AUTH_SECRET": SECRET,
}


def post(secret=SECRET, token=TOKEN, **headers):
    from api.views import KnnSearch

    # An empty query passes the auth check and stops at validation (400) before any search runs, so 400 means allowed.
    request = RequestFactory().post("/api/knn-search", data={"query": ""}, content_type="application/json", **headers)
    with override_settings(SEMANTIC_SEARCH_API_TOKEN=token, AUTH_SERVICE_UPSTREAM_SECRET=secret):
        return KnnSearch.as_view()(request)


def without(name, **overrides):
    headers = {k: v for k, v in ACCEPTED_KEY.items() if k != name}
    headers.update(overrides)
    return headers


class TestKnnSearchAuth:
    def test_bearer_token_still_works(self):
        assert post(HTTP_AUTHORIZATION=f"Bearer {TOKEN}").status_code == 400

    def test_accepted_key_without_bearer(self):
        assert post(**ACCEPTED_KEY).status_code == 400

    def test_accepted_key_with_a_wrong_bearer(self):
        assert post(HTTP_AUTHORIZATION="Bearer wrong", **ACCEPTED_KEY).status_code == 400

    def test_no_credentials(self):
        assert post().status_code == 401

    def test_wrong_bearer(self):
        assert post(HTTP_AUTHORIZATION="Bearer wrong").status_code == 401

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
        assert post(**without("HTTP_X_SEFARIA_AUTH_RESULT", HTTP_X_SEFARIA_AUTH_RESULT=result)).status_code == 401

    def test_ok_without_a_project_is_refused(self):
        assert post(**without("HTTP_X_SEFARIA_PROJECT")).status_code == 401

    def test_ok_without_the_secret_is_refused(self):
        # A client, an in-cluster caller or a request during a rollback: the gateway strip may be absent, the secret is not.
        assert post(**without("HTTP_X_SEFARIA_AUTH_SECRET")).status_code == 401

    def test_ok_with_a_wrong_secret_is_refused(self):
        assert post(**without("HTTP_X_SEFARIA_AUTH_SECRET", HTTP_X_SEFARIA_AUTH_SECRET="guess")).status_code == 401

    def test_no_secret_configured_trusts_no_header(self):
        # Auth service off, local dev: even a matching empty secret must not open the route.
        assert post(secret="", **ACCEPTED_KEY).status_code == 401
        assert (
            post(secret="", **without("HTTP_X_SEFARIA_AUTH_SECRET", HTTP_X_SEFARIA_AUTH_SECRET="")).status_code == 401
        )
        assert post(secret="", HTTP_AUTHORIZATION=f"Bearer {TOKEN}").status_code == 400

    def test_no_token_configured_still_accepts_a_key(self):
        assert post(token="", **ACCEPTED_KEY).status_code == 400
        assert post(token="", HTTP_AUTHORIZATION="Bearer ").status_code == 401


def test_sentry_events_drop_the_upstream_secret():
    from sefaria.settings_utils import remove_webhook_secrets_and_payloads

    event = {"request": {"url": "https://www.sefaria.org/api/knn-search", "headers": {"X-Sefaria-Auth-Secret": SECRET}}}
    scrubbed = remove_webhook_secrets_and_payloads(event)
    assert SECRET not in str(scrubbed)
