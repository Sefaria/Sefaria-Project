"""
Unit tests for webhooks/adapters/classy_api.py.

The module's session has a refuse-network adapter mounted by webhooks/conftest.py, so these
tests replace the session's post/get with fakes. Anything they forget to fake fails loudly.

The success path serves fixtures/classy_supporter.json, a real GET /2.0/supporters/{id}
response with the identifying values replaced, so the field the code reads (email_address)
is checked against what Classy actually sends, not against a guess. The token request was
captured at the same time: its response has access_token, expires_in and token_type, and
only access_token is read.
"""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
import requests

from sefaria.donors.types import DonorEmailAddressCouldNotBeResolved, NormalizedEmailAddress
from sefaria.donors.types import ReasonDonorEmailAddressCouldNotBeResolved as Reason
from webhooks.adapters import classy_api
from webhooks.adapters.classy_api import ClassyApiTemporaryFailure, look_up_classy_supporter_email_address

REAL_SUPPORTER_RESPONSE = json.loads(
    (Path(__file__).parent / "fixtures" / "classy_supporter.json").read_text()
)


def fake_response(status_code, json_body=None):
    response = MagicMock(spec=requests.Response)
    response.status_code = status_code
    response.json.return_value = json_body or {}
    response.raise_for_status.side_effect = (
        requests.HTTPError(f"{status_code}") if status_code >= 400 else None
    )
    return response


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(classy_api, "CLASSY_API_CLIENT_ID", "client-id")
    monkeypatch.setattr(classy_api, "CLASSY_API_CLIENT_SECRET", "client-secret")
    monkeypatch.setattr(
        classy_api.classy_api_session,
        "post",
        MagicMock(return_value=fake_response(200, {"access_token": "tok"})),
    )


# ============================================================================
# look_up_classy_supporter_email_address
# ============================================================================


class TestLookUpClassySupporterEmailAddress:

    def test_returns_the_supporters_normalized_address(self, configured, monkeypatch):
        """GET /2.0/supporters/{id} with the bearer token; the real response's email_address, normalized."""
        get = MagicMock(return_value=fake_response(200, REAL_SUPPORTER_RESPONSE))
        monkeypatch.setattr(classy_api.classy_api_session, "get", get)

        assert look_up_classy_supporter_email_address(5827) == NormalizedEmailAddress(
            "donor@example.org"
        )
        url = get.call_args.args[0]
        assert url == "https://api.classy.org/2.0/supporters/5827"
        assert get.call_args.kwargs["headers"] == {"Authorization": "Bearer tok"}

    def test_requests_a_client_credentials_token(self, configured, monkeypatch):
        """One OAuth client-credentials token per lookup (no caching — volume is tiny)."""
        monkeypatch.setattr(
            classy_api.classy_api_session,
            "get",
            MagicMock(
                return_value=fake_response(200, {"email_address": "d@example.org"})
            ),
        )
        look_up_classy_supporter_email_address(5827)
        post = classy_api.classy_api_session.post
        assert post.call_args.args[0] == "https://api.classy.org/oauth2/auth"
        assert post.call_args.kwargs["data"] == {
            "grant_type": "client_credentials",
            "client_id": "client-id",
            "client_secret": "client-secret",
        }

    def test_a_missing_supporter_is_not_found(self, configured, monkeypatch):
        """404 is a final answer: retrying can't change it."""
        monkeypatch.setattr(
            classy_api.classy_api_session,
            "get",
            MagicMock(return_value=fake_response(404)),
        )
        assert look_up_classy_supporter_email_address(
            5827
        ) == DonorEmailAddressCouldNotBeResolved(Reason.CLASSY_SUPPORTER_NOT_FOUND)

    @pytest.mark.parametrize(
        "body", [{}, {"email_address": None}, {"email_address": "not-an-address"}]
    )
    def test_a_supporter_without_a_usable_address(self, configured, monkeypatch, body):
        """No address on file is a final answer too."""
        monkeypatch.setattr(
            classy_api.classy_api_session,
            "get",
            MagicMock(return_value=fake_response(200, body)),
        )
        assert look_up_classy_supporter_email_address(
            5827
        ) == DonorEmailAddressCouldNotBeResolved(
            Reason.CLASSY_SUPPORTER_HAS_NO_EMAIL_ADDRESS
        )

    @pytest.mark.parametrize("status_code", [503, 429, 408])
    def test_temporary_failures_raise_so_the_task_retries(
        self, configured, monkeypatch, status_code
    ):
        """5xx, rate limiting (429) and request timeout (408) clear up by themselves: raise, don't answer."""
        monkeypatch.setattr(
            classy_api.classy_api_session,
            "get",
            MagicMock(return_value=fake_response(status_code)),
        )
        with pytest.raises(ClassyApiTemporaryFailure):
            look_up_classy_supporter_email_address(5827)

    def test_other_client_errors_are_not_retryable(self, configured, monkeypatch):
        """Only 429 and 408 among the 4xx codes are temporary; a 400 is our request being wrong."""
        monkeypatch.setattr(
            classy_api.classy_api_session,
            "get",
            MagicMock(return_value=fake_response(400)),
        )
        with pytest.raises(requests.HTTPError) as raised:
            look_up_classy_supporter_email_address(5827)
        assert not isinstance(raised.value, ClassyApiTemporaryFailure)

    @pytest.mark.parametrize(
        "client_id, client_secret", [(None, "s"), ("i", None), ("", "")]
    )
    def test_unconfigured_credentials_report_not_configured(
        self, monkeypatch, client_id, client_secret
    ):
        """Missing credentials never crash; they become a logged, final outcome with no network call."""
        monkeypatch.setattr(classy_api, "CLASSY_API_CLIENT_ID", client_id)
        monkeypatch.setattr(classy_api, "CLASSY_API_CLIENT_SECRET", client_secret)
        assert look_up_classy_supporter_email_address(
            5827
        ) == DonorEmailAddressCouldNotBeResolved(Reason.CLASSY_API_NOT_CONFIGURED)

    def test_the_real_network_is_refused(self, monkeypatch):
        """The conftest guard is in place: an unfaked call cannot leave the machine."""
        monkeypatch.setattr(classy_api, "CLASSY_API_CLIENT_ID", "i")
        monkeypatch.setattr(classy_api, "CLASSY_API_CLIENT_SECRET", "s")
        with pytest.raises(RuntimeError, match="must not call the real Classy API"):
            look_up_classy_supporter_email_address(5827)

    def test_rejected_credentials_on_the_token_request_are_not_retryable(
        self, configured, monkeypatch
    ):
        """A 401 from the token endpoint is a configuration problem: HTTPError, not the retryable server error."""
        monkeypatch.setattr(
            classy_api.classy_api_session,
            "post",
            MagicMock(return_value=fake_response(401)),
        )
        with pytest.raises(requests.HTTPError):
            look_up_classy_supporter_email_address(5827)

    def test_a_403_on_the_supporter_request_is_not_retryable(
        self, configured, monkeypatch
    ):
        """Forbidden will not fix itself on retry, so it fails the task instead of retrying."""
        monkeypatch.setattr(
            classy_api.classy_api_session,
            "get",
            MagicMock(return_value=fake_response(403)),
        )
        with pytest.raises(requests.HTTPError) as raised:
            look_up_classy_supporter_email_address(5827)
        assert not isinstance(raised.value, ClassyApiTemporaryFailure)

    @pytest.mark.parametrize("status_code", [502, 429])
    def test_a_temporary_failure_on_the_token_request_raises_so_the_task_retries(
        self, configured, monkeypatch, status_code
    ):
        """Classy being down or rate limiting while issuing tokens is as temporary as it is for lookups."""
        monkeypatch.setattr(
            classy_api.classy_api_session,
            "post",
            MagicMock(return_value=fake_response(status_code)),
        )
        with pytest.raises(ClassyApiTemporaryFailure):
            look_up_classy_supporter_email_address(5827)
