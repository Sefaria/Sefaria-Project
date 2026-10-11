"""
Newsletter API Integration Tests

Integration tests for all newsletter API endpoints. Use Django's
test Client to hit real URLs but with the *_impl service functions mocked at
the view layer. This keeps the focus on HTTP-layer concerns: authentication,
request parsing, validation, and response formatting.

These tests complement the unit tests in test_newsletter.py by exercising the
full HTTP request/response cycle including Django middleware and authentication.
"""

import json
import time
import pytest
from unittest import mock
from typing import cast
from django.conf import settings
from django.core import signing
from django.http import HttpResponse
from django.test import Client
from api.newsletter_service import (
    LEARNING_LEVEL_TOKEN_MAX_AGE,
    LEARNING_LEVEL_TOKEN_SALT,
    ActiveCampaignError,
    NewsletterListUnavailableError,
    make_learning_level_token,
    read_learning_level_token,
)
from sefaria.system.exceptions import InputError


# Shared fixtures (`client`, `test_user`, `test_user_no_name`,
# `logged_in_client`, `mock_newsletters`) live in api/conftest.py.


# ============================================================================
# Assertion helpers
# ============================================================================


def assert_success(response, expected_status=200):
    """Assert a successful response and return its parsed JSON body."""
    assert response.status_code == expected_status
    data = json.loads(response.content)
    assert "error" not in data
    return data


def assert_error(response, expected_status, expected_error_part=None):
    """Assert an error response and return its parsed JSON body."""
    assert response.status_code == expected_status
    data = json.loads(response.content)
    assert "error" in data
    if expected_error_part:
        assert expected_error_part.lower() in data["error"].lower()
    return data


def parse_json(response):
    return json.loads(response.content)


def csrf_checked_logged_in_client(test_user, token="a" * 32):
    client = Client(enforce_csrf_checks=True)
    client.login(email="testuser@sefaria.org", password="testpass123")
    client.cookies[settings.CSRF_COOKIE_NAME] = token
    return client, token


def csrf_checked_client(token="a" * 32):
    client = Client(enforce_csrf_checks=True)
    client.cookies[settings.CSRF_COOKIE_NAME] = token
    return client, token


# ============================================================================
# Update User Preferences Integration Tests (Authenticated, REPLACE behavior)
# ============================================================================


@pytest.mark.django_db
class TestUpdateUserPreferencesIntegration:
    """
    Integration tests for POST /api/newsletter/preferences (authenticated users).

    This endpoint uses REPLACE behavior: the selected newsletters become the
    user's complete subscription list. Unselected newsletters are unsubscribed.
    """

    def test_unauthenticated_request_returns_401(self, client):
        """Unauthenticated request returns 401 Unauthorized."""
        response = client.post(
            "/api/newsletter/preferences",
            json.dumps(
                {
                    "newsletters": {
                        "sefaria_news": True,
                        "text_updates": True,
                    }
                }
            ),
            content_type="application/json",
        )

        assert response.status_code == 401
        data = json.loads(response.content)
        assert "authentication required" in data["error"].lower()
        # The page uses this code to show a translated "please log in again" message
        assert data["code"] == "authentication_required"

    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_authenticated_user_can_update_preferences(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Authenticated user can successfully update preferences."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            "contact": {"id": "12345", "email": "testuser@sefaria.org"},
            "subscribed_newsletters": ["sefaria_news", "parashah_series"],
        }

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps(
                {
                    "newsletters": {
                        "sefaria_news": True,
                        "text_updates": False,
                        "parashah_series": True,
                        "educator_resources": False,
                    }
                }
            ),
            content_type="application/json",
        )

        data = assert_success(response, 200)
        assert data["success"] is True
        assert data["email"] == "testuser@sefaria.org"
        assert "sefaria_news" in data["subscribedNewsletters"]
        assert "parashah_series" in data["subscribedNewsletters"]
        assert len(data["subscribedNewsletters"]) == 2

        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        assert call_args[0] == "testuser@sefaria.org"  # email
        assert call_args[1] == "Test"  # first_name
        assert call_args[2] == "User"  # last_name
        assert "sefaria_news" in call_args[3]  # selected_stringids
        assert "parashah_series" in call_args[3]

    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_empty_selection_allowed_unsubscribes_from_all(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Empty selection is allowed for authenticated users (unsubscribe from all)."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            "contact": {"id": "12345", "email": "testuser@sefaria.org"},
            "subscribed_newsletters": [],
        }

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps(
                {
                    "newsletters": {
                        "sefaria_news": False,
                        "text_updates": False,
                        "parashah_series": False,
                        "educator_resources": False,
                    }
                }
            ),
            content_type="application/json",
        )

        data = assert_success(response, 200)
        assert data["success"] is True
        assert data["subscribedNewsletters"] == []

        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        assert call_args[3] == []  # selected_stringids should be empty

    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_replace_behavior_removes_old_adds_new(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Replace behavior correctly removes old subscriptions and adds new ones."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            "contact": {"id": "12345", "email": "testuser@sefaria.org"},
            "subscribed_newsletters": ["parashah_series", "educator_resources"],
        }

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps(
                {
                    "newsletters": {
                        "sefaria_news": False,
                        "text_updates": False,
                        "parashah_series": True,
                        "educator_resources": True,
                    }
                }
            ),
            content_type="application/json",
        )

        data = assert_success(response, 200)
        assert data["success"] is True
        assert "sefaria_news" not in data["subscribedNewsletters"]
        assert "text_updates" not in data["subscribedNewsletters"]
        assert "parashah_series" in data["subscribedNewsletters"]
        assert "educator_resources" in data["subscribedNewsletters"]

    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_partial_overlap_add_remove_keep(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Handles partial overlap (add some, remove some, keep some)."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            "contact": {"id": "12345", "email": "testuser@sefaria.org"},
            "subscribed_newsletters": ["sefaria_news", "parashah_series"],
        }

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps(
                {
                    "newsletters": {
                        "sefaria_news": True,  # keep
                        "text_updates": False,  # remove
                        "parashah_series": True,  # add
                        "educator_resources": False,
                    }
                }
            ),
            content_type="application/json",
        )

        data = assert_success(response, 200)
        assert "sefaria_news" in data["subscribedNewsletters"]
        assert "text_updates" not in data["subscribedNewsletters"]
        assert "parashah_series" in data["subscribedNewsletters"]

    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_invalid_stringid_returns_400(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Invalid newsletter stringid raises error from service layer."""
        mock_get_list.return_value = mock_newsletters
        mock_update.side_effect = InputError(
            "Invalid newsletter IDs: invalid_newsletter_123"
        )

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps({"newsletters": {"invalid_newsletter_123": True}}),
            content_type="application/json",
        )

        data = assert_error(response, 400)
        assert "error" in data
        # The person can't fix this one, so it has no code and stays in English
        assert "code" not in data

    def test_authenticated_preferences_requires_csrf_when_enforced(self, test_user):
        """Authenticated preference mutations require CSRF under real middleware checks."""
        client = Client(enforce_csrf_checks=True)
        client.login(email="testuser@sefaria.org", password="testpass123")

        response = cast(
            HttpResponse,
            client.post(
                "/api/newsletter/preferences",
                json.dumps({"newsletters": {"sefaria_news": True}}),
                content_type="application/json",
            ),
        )

        assert response.status_code == 403

    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_authenticated_preferences_accepts_valid_csrf(
        self, mock_get_list, mock_update, test_user, mock_newsletters
    ):
        """Authenticated preference mutations pass with a valid CSRF cookie/header pair."""
        client, token = csrf_checked_logged_in_client(test_user)
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            "contact": {"id": "12345", "email": "testuser@sefaria.org"},
            "subscribed_newsletters": ["sefaria_news"],
        }

        response = client.post(
            "/api/newsletter/preferences",
            json.dumps({"newsletters": {"sefaria_news": True}}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )

        assert_success(response, 200)

    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_ac_api_error_returns_500(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """ActiveCampaign API error returns 500."""
        mock_get_list.return_value = mock_newsletters
        mock_update.side_effect = ActiveCampaignError(
            "Failed to connect to ActiveCampaign API"
        )

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps({"newsletters": {"sefaria_news": True}}),
            content_type="application/json",
        )

        assert_error(response, 500, "ActiveCampaign")

    def test_invalid_json_returns_400(self, logged_in_client):
        """Invalid JSON in request body returns 400."""
        response = logged_in_client.post(
            "/api/newsletter/preferences",
            "this is not valid json",
            content_type="application/json",
        )

        assert_error(response, 400)

    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_response_format_is_correct(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Response has correct format with all required fields and types."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            "contact": {"id": "12345", "email": "testuser@sefaria.org"},
            "subscribed_newsletters": ["sefaria_news"],
        }

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps({"newsletters": {"sefaria_news": True}}),
            content_type="application/json",
        )

        data = assert_success(response, 200)

        # Required fields
        for field in ("success", "message", "email", "subscribedNewsletters"):
            assert field in data

        # Field types
        assert isinstance(data["success"], bool)
        assert isinstance(data["message"], str)
        assert isinstance(data["email"], str)
        assert isinstance(data["subscribedNewsletters"], list)

    @pytest.mark.parametrize("method", ["get", "put", "delete"])
    def test_non_post_methods_not_allowed(self, logged_in_client, method):
        """Only POST is allowed on /preferences; GET/PUT/DELETE return 405."""
        response = getattr(logged_in_client, method)("/api/newsletter/preferences")

        # The 'Only POST method is supported' message comes from the same code
        # path for every non-POST method, so checking it once (on GET) is enough.
        if method == "get":
            assert_error(response, 405, "Only POST method is supported")
        else:
            assert_error(response, 405)

    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_user_without_first_name_uses_default(
        self, mock_get_list, mock_update, client, test_user_no_name, mock_newsletters
    ):
        """User without first_name gets default value 'User'."""
        client.login(email="testuser@sefaria.org", password="testpass123")

        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            "contact": {"id": "12345", "email": "testuser@sefaria.org"},
            "subscribed_newsletters": ["sefaria_news"],
        }

        response = client.post(
            "/api/newsletter/preferences",
            json.dumps({"newsletters": {"sefaria_news": True}}),
            content_type="application/json",
        )

        assert_success(response, 200)

        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        assert call_args[1] == "User"  # first_name defaulted to 'User'
        assert call_args[2] == ""  # last_name remains empty

    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_marketing_opt_out_threaded_to_service(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """The `marketingOptOut` request flag is threaded through to the service layer."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            "contact": {"id": "12345", "email": "testuser@sefaria.org"},
            "subscribed_newsletters": [],
        }

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps(
                {
                    "newsletters": {"sefaria_news": True},
                    "marketingOptOut": True,
                }
            ),
            content_type="application/json",
        )

        assert response.status_code == 200
        mock_update.assert_called_once()
        call_kwargs = mock_update.call_args[1]
        assert call_kwargs["marketing_opt_out"] is True


# ============================================================================
# Get User Subscriptions Integration Tests (Authenticated, GET)
# ============================================================================


@pytest.mark.django_db
class TestGetUserSubscriptionsIntegration:
    """
    Integration tests for GET /api/newsletter/subscriptions (authenticated users).

    Retrieves the current newsletter subscriptions for an authenticated user.
    """

    def test_unauthenticated_request_returns_401(self, client):
        """Unauthenticated request returns 401 Unauthorized."""
        response = client.get("/api/newsletter/subscriptions")

        data = assert_error(response, 401, "Authentication required")
        assert data["code"] == "authentication_required"

    @mock.patch("api.newsletter_views.fetch_user_subscriptions_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_authenticated_user_with_subscriptions(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """Authenticated user with subscriptions returns correct list."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            "subscribed_newsletters": ["sefaria_news", "parashah_series"],
            "wants_marketing_emails": True,
            "learning_level": 3,
        }

        response = logged_in_client.get("/api/newsletter/subscriptions")

        data = assert_success(response, 200)
        assert data["success"] is True
        assert data["email"] == "testuser@sefaria.org"
        assert "sefaria_news" in data["subscribedNewsletters"]
        assert "parashah_series" in data["subscribedNewsletters"]
        assert len(data["subscribedNewsletters"]) == 2

    @mock.patch("api.newsletter_views.fetch_user_subscriptions_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_authenticated_user_with_no_subscriptions(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """Authenticated user with no subscriptions returns empty array."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            "subscribed_newsletters": [],
            "wants_marketing_emails": True,
            "learning_level": None,
        }

        response = logged_in_client.get("/api/newsletter/subscriptions")

        data = assert_success(response, 200)
        assert data["success"] is True
        assert data["subscribedNewsletters"] == []

    @mock.patch("api.newsletter_views.fetch_user_subscriptions_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_user_not_in_ac_returns_empty_array(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """User not in ActiveCampaign returns empty array (not error)."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            "subscribed_newsletters": [],
            "wants_marketing_emails": True,
            "learning_level": None,
        }

        response = logged_in_client.get("/api/newsletter/subscriptions")

        data = assert_success(response, 200)
        assert data["success"] is True
        assert data["subscribedNewsletters"] == []

    @mock.patch("api.newsletter_views.fetch_user_subscriptions_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_ac_api_error_returns_500(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """ActiveCampaign API error returns 500."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.side_effect = ActiveCampaignError(
            "Failed to connect to ActiveCampaign API"
        )

        response = logged_in_client.get("/api/newsletter/subscriptions")

        assert_error(response, 500, "ActiveCampaign")

    @mock.patch("api.newsletter_views.fetch_user_subscriptions_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_response_format_is_correct(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """Response has correct format with all required fields and types."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            "subscribed_newsletters": ["sefaria_news"],
            "wants_marketing_emails": True,
            "learning_level": 1,
        }

        response = logged_in_client.get("/api/newsletter/subscriptions")

        data = assert_success(response, 200)

        for field in ("success", "email", "subscribedNewsletters"):
            assert field in data

        assert isinstance(data["success"], bool)
        assert isinstance(data["email"], str)
        assert isinstance(data["subscribedNewsletters"], list)

    @mock.patch("api.newsletter_views.fetch_user_subscriptions_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_response_includes_learning_level(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """`learningLevel` is included in the GET response when the user has one set."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            "subscribed_newsletters": ["sefaria_news"],
            "learning_level": 3,
            "wants_marketing_emails": True,
        }

        response = logged_in_client.get("/api/newsletter/subscriptions")

        data = assert_success(response, 200)
        assert data["learningLevel"] == 3

    @mock.patch("api.newsletter_views.fetch_user_subscriptions_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_response_includes_wants_marketing_false(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """`wantsMarketingEmails: false` is reflected in the GET response when the user opted out."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            "subscribed_newsletters": [],
            "learning_level": None,
            "wants_marketing_emails": False,
        }

        response = logged_in_client.get("/api/newsletter/subscriptions")

        data = assert_success(response, 200)
        assert data["wantsMarketingEmails"] is False
        assert data["subscribedNewsletters"] == []

    def test_post_method_not_allowed(self, logged_in_client):
        """POST request returns 405 Method Not Allowed."""
        response = logged_in_client.post("/api/newsletter/subscriptions")

        assert_error(response, 405)


# ============================================================================
# Get Newsletter Lists Endpoint Tests (Public, GET /api/newsletter/lists)
# ============================================================================


class TestGetNewsletterListsView:
    """Tests for the public /api/newsletter/lists endpoint."""

    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_get_request_success(self, mock_get_list, client):
        """Successful GET request returns the available newsletters."""
        mock_get_list.return_value = [
            {
                "id": "1",
                "stringid": "sefaria_news",
                "displayName": {"en": "Sefaria News", "he": None},
                "icon": "news-and-resources.svg",
                "language": "english",
            }
        ]
        response = client.get("/api/newsletter/lists")

        assert response.status_code == 200
        data = json.loads(response.content)
        assert "newsletters" in data
        assert len(data["newsletters"]) == 1
        assert data["newsletters"][0]["stringid"] == "sefaria_news"

    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_error_response_500(self, mock_get_list, client):
        """When the service raises ActiveCampaignError, the view returns 500."""
        mock_get_list.side_effect = ActiveCampaignError("Connection failed")
        response = client.get("/api/newsletter/lists")

        assert response.status_code == 500
        data = json.loads(response.content)
        assert "error" in data
        assert "Connection failed" in data["error"]

    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_hebrew_newsletter_displayname_shape(self, mock_get_list, client):
        """Hebrew-language newsletter produces {en: None, he: ...} displayName."""
        mock_get_list.return_value = [
            {
                "id": "9",
                "stringid": "hebrew_newsletter",
                "displayName": {"en": None, "he": "חדשות עברית"},
                "icon": "news-and-resources.svg",
                "language": "hebrew",
            }
        ]
        response = client.get("/api/newsletter/lists")

        assert response.status_code == 200
        data = json.loads(response.content)
        nl = data["newsletters"][0]
        assert nl["displayName"] == {"en": None, "he": "חדשות עברית"}
        assert nl["stringid"] == "hebrew_newsletter"

    def test_post_not_allowed(self, client):
        """POST is not a valid method on the lists endpoint."""
        response = client.post("/api/newsletter/lists")

        assert response.status_code == 405
        data = json.loads(response.content)
        assert "error" in data
        assert "GET" in data["error"]

    @mock.patch(
        "api.newsletter_views.is_newsletter_service_configured", return_value=False
    )
    def test_returns_503_when_not_configured(self, mock_configured, client):
        """Returns 503 with a stable error key when AC credentials are absent."""
        response = client.get("/api/newsletter/lists")

        assert response.status_code == 503
        data = json.loads(response.content)
        assert data["error"] == "newsletter_service_not_configured"


# ============================================================================
# Subscribe Endpoint Tests (Logged-out users, POST /api/newsletter/subscribe)
# ============================================================================


class TestSubscribeNewsletterEndpoint:
    """Tests for POST /api/newsletter/subscribe (the logged-out subscription flow)."""

    def test_subscribe_requires_csrf_when_enforced(self):
        """Logged-out subscription posts require CSRF under real middleware checks."""
        client = Client(enforce_csrf_checks=True)

        response = cast(
            HttpResponse,
            client.post(
                "/api/newsletter/subscribe",
                json.dumps(
                    {
                        "firstName": "John",
                        "lastName": "Doe",
                        "email": "test@example.com",
                        "newsletters": {"sefaria_news": True},
                    }
                ),
                content_type="application/json",
            ),
        )

        assert response.status_code == 403

    @mock.patch("api.newsletter_views.subscribe_with_union")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_subscribe_accepts_valid_csrf(self, mock_get_list, mock_subscribe):
        """Logged-out subscription posts pass with a valid CSRF cookie/header pair."""
        client, token = csrf_checked_client()
        mock_get_list.return_value = [{"stringid": "sefaria_news", "id": "1"}]
        mock_subscribe.return_value = {
            "contact": {"id": "28529", "email": "test@example.com"},
            "all_subscriptions": ["sefaria_news"],
        }

        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(
                {
                    "firstName": "John",
                    "lastName": "Doe",
                    "email": "test@example.com",
                    "newsletters": {"sefaria_news": True},
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )

        assert_success(response, 200)

    @mock.patch("api.newsletter_views.subscribe_with_union")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_subscribe_success(self, mock_get_list, mock_subscribe, client):
        """Logged-out user successfully subscribes with valid first name + email + selections."""
        mock_get_list.return_value = [
            {"stringid": "sefaria_news", "id": "1"},
            {"stringid": "text_updates", "id": "3"},
        ]
        mock_subscribe.return_value = {
            "contact": {"id": "28529", "email": "test@example.com"},
            "all_subscriptions": ["sefaria_news", "text_updates"],
        }

        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(
                {
                    "firstName": "John",
                    "lastName": "Doe",
                    "email": "test@example.com",
                    "newsletters": {
                        "sefaria_news": True,
                        "text_updates": True,
                        "parashah_series": False,
                    },
                }
            ),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data["success"] is True
        assert data["email"] == "test@example.com"
        assert len(data["subscribedNewsletters"]) == 2

    @mock.patch("api.newsletter_views.subscribe_with_union")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_subscribe_returns_learning_level_token(
        self, mock_get_list, mock_subscribe, client
    ):
        """Subscribe returns a token that the learning-level step can use for this email."""
        mock_get_list.return_value = [{"stringid": "sefaria_news", "id": "1"}]
        mock_subscribe.return_value = {
            "contact": {"id": "28529", "email": "test@example.com"},
            "all_subscriptions": ["sefaria_news"],
        }

        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(
                {
                    "firstName": "John",
                    "lastName": "Doe",
                    "email": " test@example.com ",
                    "newsletters": {"sefaria_news": True},
                }
            ),
            content_type="application/json",
        )

        data = assert_success(response, 200)
        assert read_learning_level_token(data["learningLevelToken"]) == "test@example.com"

    def test_subscribe_missing_first_name(self, client):
        """Empty first name is rejected with 400."""
        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(
                {
                    "firstName": "",
                    "lastName": "Doe",
                    "email": "test@example.com",
                    "newsletters": {"sefaria_news": True},
                }
            ),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert "First name, last name, and email are required" in data["error"]

    def test_subscribe_missing_email(self, client):
        """Empty email is rejected with 400."""
        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(
                {
                    "firstName": "John",
                    "lastName": "Doe",
                    "email": "",
                    "newsletters": {"sefaria_news": True},
                }
            ),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert "First name, last name, and email are required" in data["error"]

    def test_subscribe_invalid_email(self, client):
        """Malformed non-empty email is rejected before calling ActiveCampaign."""
        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(
                {
                    "firstName": "John",
                    "lastName": "Doe",
                    "email": "not-an-email",
                    "newsletters": {"sefaria_news": True},
                }
            ),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert "Invalid email address" in data["error"]
        # The page uses this code to show a translated "enter a valid email" message
        assert data["code"] == "invalid_email"

    def test_subscribe_no_newsletters_selected(self, client):
        """
        Logged-out users must select at least one newsletter.
        (This is different from the authenticated /preferences endpoint, which
        allows empty selection as a way to unsubscribe from everything.)
        """
        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(
                {
                    "firstName": "John",
                    "lastName": "Doe",
                    "email": "test@example.com",
                    "newsletters": {
                        "sefaria_news": False,
                        "text_updates": False,
                    },
                }
            ),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert "Please select at least one newsletter" in data["error"]

    @mock.patch("api.newsletter_views.subscribe_with_union")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_subscribe_invalid_json(self, mock_get_list, mock_subscribe, client):
        """Malformed JSON in the request body returns 400."""
        response = client.post(
            "/api/newsletter/subscribe",
            "invalid json",
            content_type="application/json",
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert "Invalid JSON" in data["error"]

    @mock.patch("api.newsletter_views.subscribe_with_union")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_subscribe_activecampaign_error(
        self, mock_get_list, mock_subscribe, client
    ):
        """When the service raises ActiveCampaignError, the view returns 500."""
        mock_get_list.return_value = [
            {"stringid": "sefaria_news", "id": "1"},
        ]
        mock_subscribe.side_effect = ActiveCampaignError("Connection failed")

        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(
                {
                    "firstName": "John",
                    "lastName": "Doe",
                    "email": "test@example.com",
                    "newsletters": {"sefaria_news": True},
                }
            ),
            content_type="application/json",
        )

        assert response.status_code == 500
        data = json.loads(response.content)
        assert "Connection failed" in data["error"]

    @mock.patch("api.newsletter_views.subscribe_with_union")
    def test_subscribe_ac_unavailable_returns_503(self, mock_subscribe, client):
        """When managed newsletter metadata is unavailable, the view returns 503."""
        mock_subscribe.side_effect = NewsletterListUnavailableError(
            "Newsletter service is temporarily unavailable. Please try again later."
        )

        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(
                {
                    "firstName": "John",
                    "lastName": "Doe",
                    "email": "test@example.com",
                    "newsletters": {"sefaria_news": True},
                }
            ),
            content_type="application/json",
        )

        assert response.status_code == 503
        data = json.loads(response.content)
        assert "temporarily unavailable" in data["error"]

    @mock.patch("api.newsletter_views.subscribe_with_union")
    def test_subscribe_empty_newsletter_list_returns_503(self, mock_subscribe, client):
        """When managed newsletter metadata is empty, the view returns 503."""
        mock_subscribe.side_effect = NewsletterListUnavailableError(
            "Newsletter service is temporarily unavailable. Please try again later."
        )

        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(
                {
                    "firstName": "John",
                    "lastName": "Doe",
                    "email": "test@example.com",
                    "newsletters": {"sefaria_news": True},
                }
            ),
            content_type="application/json",
        )

        assert response.status_code == 503
        data = json.loads(response.content)
        assert "temporarily unavailable" in data["error"]

    def test_subscribe_get_not_allowed(self, client):
        """GET is not a valid method on the subscribe endpoint."""
        response = client.get("/api/newsletter/subscribe")

        assert response.status_code == 405
        data = json.loads(response.content)
        assert "POST" in data["error"]

# ============================================================================
# Update Learning Level Endpoint Tests (POST /api/newsletter/learning-level)
# ============================================================================

LEARNING_LEVEL_URL = "/api/newsletter/learning-level"


def learning_level_result(email, learning_level, user_id=None):
    """What update_learning_level_impl returns, for use as a mock return value."""
    return {
        "email": email,
        "learning_level": learning_level,
        "user_id": user_id,
        "message": "Learning level updated successfully",
    }


def post_learning_level(client, body, **extra):
    return client.post(
        LEARNING_LEVEL_URL, json.dumps(body), content_type="application/json", **extra
    )


def expired_learning_level_token(email):
    """Build a token whose signing time is just past the allowed age."""
    too_old = time.time() - LEARNING_LEVEL_TOKEN_MAX_AGE - 60
    with mock.patch("django.core.signing.time.time", return_value=too_old):
        return make_learning_level_token(email)


def tampered_learning_level_token(email):
    """Change the last character of a real token so its signature no longer matches."""
    token = make_learning_level_token(email)
    return token[:-1] + ("A" if token[-1] != "A" else "B")


@pytest.mark.django_db
class TestUpdateLearningLevelView:
    """Tests for the POST /api/newsletter/learning-level endpoint."""

    def test_update_learning_level_get_not_allowed(self, client):
        """GET is not a valid method on the learning-level endpoint."""
        response = client.get(LEARNING_LEVEL_URL)

        assert response.status_code == 405
        data = json.loads(response.content)
        assert "POST" in data["error"]

    # ---------- Logged out: the token from subscribe decides whose level it is ----------

    @mock.patch("api.newsletter_views.update_learning_level_impl")
    def test_logged_out_uses_email_from_token(self, mock_update, client):
        """The email inside the token is used; an email in the body is ignored."""
        mock_update.return_value = learning_level_result("newuser@example.com", 3)

        response = post_learning_level(
            client,
            {
                "token": make_learning_level_token("newuser@example.com"),
                "email": "someone-else@example.com",
                "learningLevel": 3,
            },
        )

        assert_success(response, 200)
        mock_update.assert_called_once_with("newuser@example.com", 3)

    @mock.patch("api.newsletter_views.update_learning_level_impl")
    def test_logged_out_never_gets_user_id(self, mock_update, client):
        """Even when the email has an account, its user ID is not sent back."""
        mock_update.return_value = learning_level_result(
            "has-account@example.com", 3, user_id=42
        )

        response = post_learning_level(
            client,
            {"token": make_learning_level_token("has-account@example.com"), "learningLevel": 3},
        )

        data = assert_success(response, 200)
        assert "userId" not in data

    @pytest.mark.parametrize(
        "token",
        [
            pytest.param(None, id="missing"),
            pytest.param("", id="empty"),
            pytest.param("not-a-real-token", id="junk"),
            pytest.param(12345, id="not-a-string"),
            pytest.param(tampered_learning_level_token("a@example.com"), id="tampered"),
            pytest.param(
                signing.dumps({"email": "a@example.com"}, salt="some-other-purpose"),
                id="wrong-salt",
            ),
            pytest.param(
                signing.dumps({"email": "not-an-email"}, salt=LEARNING_LEVEL_TOKEN_SALT),
                id="bad-email-inside",
            ),
        ],
    )
    @mock.patch("api.newsletter_views.update_learning_level_impl")
    def test_logged_out_rejects_bad_token(self, mock_update, client, token):
        """A missing or untrustworthy token is rejected before anything is saved."""
        body = {"learningLevel": 2}
        if token is not None:
            body["token"] = token

        data = assert_error(post_learning_level(client, body), 400, "expired")

        assert data["code"] == "learning_level_token_invalid"
        mock_update.assert_not_called()

    @mock.patch("api.newsletter_views.update_learning_level_impl")
    def test_logged_out_rejects_expired_token(self, mock_update, client):
        """A token older than the allowed age is rejected."""
        response = post_learning_level(
            client,
            {"token": expired_learning_level_token("a@example.com"), "learningLevel": 2},
        )

        data = assert_error(response, 400)
        assert data["code"] == "learning_level_token_invalid"
        mock_update.assert_not_called()

    # ---------- Logged in: the session decides whose level it is ----------

    @mock.patch("api.newsletter_views.update_learning_level_impl")
    def test_logged_in_uses_session_email(
        self, mock_update, logged_in_client, test_user
    ):
        """Logged-in users need no token. Their user ID isn't sent back either."""
        mock_update.return_value = learning_level_result(
            "testuser@sefaria.org", 4, user_id=test_user.id
        )

        response = post_learning_level(logged_in_client, {"learningLevel": 4})

        data = assert_success(response, 200)
        mock_update.assert_called_once_with("testuser@sefaria.org", 4)
        assert "userId" not in data

    # ---------- CSRF ----------

    def test_learning_level_requires_csrf_when_enforced(self):
        """Learning-level mutations require CSRF under real middleware checks."""
        client = Client(enforce_csrf_checks=True)

        response = cast(
            HttpResponse,
            post_learning_level(
                client,
                {"token": make_learning_level_token("newuser@example.com"), "learningLevel": 2},
            ),
        )

        assert response.status_code == 403

    def test_authenticated_learning_level_requires_csrf_when_enforced(self, test_user):
        """Authenticated learning-level mutations also require CSRF."""
        client = Client(enforce_csrf_checks=True)
        client.login(email="testuser@sefaria.org", password="testpass123")

        response = cast(HttpResponse, post_learning_level(client, {"learningLevel": 2}))

        assert response.status_code == 403

    @mock.patch("api.newsletter_views.update_learning_level_impl")
    def test_learning_level_accepts_valid_csrf(self, mock_update):
        """Logged-out learning-level posts pass with a valid CSRF cookie/header pair."""
        client, csrf_token = csrf_checked_client()
        mock_update.return_value = learning_level_result("newuser@example.com", 3)

        response = post_learning_level(
            client,
            {"token": make_learning_level_token("newuser@example.com"), "learningLevel": 3},
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        assert_success(response, 200)

    # ---------- Request validation ----------

    def test_update_learning_level_invalid_json(self, client):
        """Malformed JSON in the request body returns 400."""
        response = client.post(
            LEARNING_LEVEL_URL, "invalid json", content_type="application/json"
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert "Invalid JSON" in data["error"]

    def test_update_learning_level_invalid_learning_level(self, client):
        """A level outside 1-5 is rejected with 400, checked before the token."""
        response = post_learning_level(client, {"learningLevel": 10})

        assert_error(response, 400, "Learning level must be")

    @mock.patch("api.newsletter_views.update_learning_level_impl")
    def test_update_learning_level_none_is_valid(self, mock_update, client):
        """Learning level can be set to None to clear it (it's optional)."""
        mock_update.return_value = learning_level_result("test@example.com", None)

        response = post_learning_level(
            client,
            {"token": make_learning_level_token("test@example.com"), "learningLevel": None},
        )

        data = assert_success(response, 200)
        mock_update.assert_called_once_with("test@example.com", None)
        assert data["learningLevel"] is None

    @mock.patch("api.newsletter_views.update_learning_level_impl")
    def test_update_learning_level_ac_error(self, mock_update, client):
        """When the service raises ActiveCampaignError, the view returns 500."""
        mock_update.side_effect = ActiveCampaignError("AC API failed")

        response = post_learning_level(
            client,
            {"token": make_learning_level_token("test@example.com"), "learningLevel": 2},
        )

        assert_error(response, 500)


# ============================================================================
# Request Body Type Checks (wrong JSON types get a 400, not a 500 or a wrong action)
# ============================================================================

# Each of these "newsletters" values used to either crash on .items() (a 500) or,
# for "false", count as selected because a non-empty string is truthy in Python.
BAD_NEWSLETTERS_VALUES = [
    ["sefaria_news"],
    "sefaria_news",
    None,
    {"sefaria_news": "false"},
    {"sefaria_news": 1},
]


def valid_subscribe_body(**overrides):
    return {
        "firstName": "John",
        "lastName": "Doe",
        "email": "test@example.com",
        "newsletters": {"sefaria_news": True},
        **overrides,
    }


@pytest.mark.django_db
class TestRequestBodyTypeChecks:
    """Wrong JSON types are rejected before any ActiveCampaign work happens."""

    @pytest.mark.parametrize("newsletters", BAD_NEWSLETTERS_VALUES)
    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    def test_preferences_rejects_bad_newsletters(
        self, mock_update, logged_in_client, newsletters
    ):
        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps({"newsletters": newsletters}),
            content_type="application/json",
        )

        data = assert_error(
            response, 400, "newsletters must be an object of true/false values."
        )
        # Not something the person can fix, so no code and the text stays in English
        assert "code" not in data
        mock_update.assert_not_called()

    @pytest.mark.parametrize("marketing_opt_out", ["false", "true", 0, 1, None])
    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    def test_preferences_rejects_non_boolean_marketing_opt_out(
        self, mock_update, logged_in_client, marketing_opt_out
    ):
        """
        Opting out unsubscribes from every list, so "false" (truthy in Python) must
        never reach the service, where it would have meant "opt out".
        """
        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps(
                {
                    "newsletters": {"sefaria_news": True},
                    "marketingOptOut": marketing_opt_out,
                }
            ),
            content_type="application/json",
        )

        assert_error(response, 400, "marketingOptOut must be true or false.")
        mock_update.assert_not_called()

    @mock.patch("api.newsletter_views.update_user_preferences_impl")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_preferences_missing_marketing_opt_out_means_false(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            "contact": {"id": "12345", "email": "testuser@sefaria.org"},
            "subscribed_newsletters": ["sefaria_news"],
        }

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps({"newsletters": {"sefaria_news": True}}),
            content_type="application/json",
        )

        assert_success(response, 200)
        assert mock_update.call_args[1]["marketing_opt_out"] is False

    @pytest.mark.parametrize("newsletters", BAD_NEWSLETTERS_VALUES)
    @mock.patch("api.newsletter_views.subscribe_with_union")
    def test_subscribe_rejects_bad_newsletters(self, mock_subscribe, client, newsletters):
        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(valid_subscribe_body(newsletters=newsletters)),
            content_type="application/json",
        )

        data = assert_error(
            response, 400, "newsletters must be an object of true/false values."
        )
        assert "code" not in data
        mock_subscribe.assert_not_called()

    @pytest.mark.parametrize("learning_level", [True, False])
    @mock.patch("api.newsletter_views.update_learning_level_impl")
    def test_learning_level_rejects_booleans(
        self, mock_update, logged_in_client, learning_level
    ):
        """
        In Python True == 1 and bool is a kind of int, so without an explicit
        check `true` would be saved as a learning level.
        """
        response = post_learning_level(
            logged_in_client, {"learningLevel": learning_level}
        )

        assert_error(response, 400, "Learning level must be")
        mock_update.assert_not_called()


@pytest.mark.django_db
class TestSubscribeDoesNotRevealExistingSubscriptions:
    """
    Subscribe doesn't require login, so anyone can call it with any email
    address. The response must not tell them what that address was already
    subscribed to.
    """

    @mock.patch("api.newsletter_views.subscribe_with_union")
    @mock.patch("api.newsletter_views.get_cached_newsletter_list")
    def test_response_lists_only_this_requests_selections(
        self, mock_get_list, mock_subscribe, client
    ):
        mock_get_list.return_value = [
            {"stringid": "sefaria_news", "id": "1"},
            {"stringid": "educator_resources", "id": "2"},
            {"stringid": "parashah_series", "id": "4"},
        ]
        # The contact was already on educator_resources and parashah_series.
        mock_subscribe.return_value = {
            "contact": {"id": "28529", "email": "test@example.com"},
            "all_subscriptions": [
                "educator_resources",
                "parashah_series",
                "sefaria_news",
            ],
        }

        response = client.post(
            "/api/newsletter/subscribe",
            json.dumps(valid_subscribe_body(newsletters={"sefaria_news": True})),
            content_type="application/json",
        )

        data = assert_success(response, 200)
        assert data["subscribedNewsletters"] == ["sefaria_news"]
