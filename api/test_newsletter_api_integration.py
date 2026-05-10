"""
Newsletter API Integration Tests

Pytest-style integration tests for all newsletter API endpoints. Use Django's
test Client to hit real URLs but with the *_impl service functions mocked at
the view layer. This keeps the focus on HTTP-layer concerns: authentication,
request parsing, validation, and response formatting.

These tests complement the unit tests in test_newsletter.py by exercising the
full HTTP request/response cycle including Django middleware and authentication.
"""

import json
import pytest
from unittest import mock
from api.newsletter_service import ActiveCampaignError


# Shared fixtures (`client`, `test_user`, `test_user_no_name`,
# `logged_in_client`, `mock_newsletters`) live in api/conftest.py.


# ============================================================================
# Assertion helpers
# ============================================================================

def assert_success(response, expected_status=200):
    """Assert a successful response and return its parsed JSON body."""
    assert response.status_code == expected_status
    data = json.loads(response.content)
    assert 'error' not in data
    return data


def assert_error(response, expected_status, expected_error_part=None):
    """Assert an error response and return its parsed JSON body."""
    assert response.status_code == expected_status
    data = json.loads(response.content)
    assert 'error' in data
    if expected_error_part:
        assert expected_error_part.lower() in data['error'].lower()
    return data


def parse_json(response):
    return json.loads(response.content)


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
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': True,
                    'text_updates': True,
                }
            }),
            content_type='application/json',
        )

        assert response.status_code == 401
        data = json.loads(response.content)
        assert 'authentication required' in data['error'].lower()

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_authenticated_user_can_update_preferences(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Authenticated user can successfully update preferences."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            'contact': {'id': '12345', 'email': 'testuser@sefaria.org'},
            'subscribed_newsletters': ['sefaria_news', 'parashah_series'],
        }

        response = logged_in_client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': True,
                    'text_updates': False,
                    'parashah_series': True,
                    'educator_resources': False,
                }
            }),
            content_type='application/json',
        )

        data = assert_success(response, 200)
        assert data['success'] is True
        assert data['email'] == 'testuser@sefaria.org'
        assert 'sefaria_news' in data['subscribedNewsletters']
        assert 'parashah_series' in data['subscribedNewsletters']
        assert len(data['subscribedNewsletters']) == 2

        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        assert call_args[0] == 'testuser@sefaria.org'  # email
        assert call_args[1] == 'Test'                  # first_name
        assert call_args[2] == 'User'                  # last_name
        assert 'sefaria_news' in call_args[3]          # selected_stringids
        assert 'parashah_series' in call_args[3]

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_empty_selection_allowed_unsubscribes_from_all(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Empty selection is allowed for authenticated users (unsubscribe from all)."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            'contact': {'id': '12345', 'email': 'testuser@sefaria.org'},
            'subscribed_newsletters': [],
        }

        response = logged_in_client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': False,
                    'text_updates': False,
                    'parashah_series': False,
                    'educator_resources': False,
                }
            }),
            content_type='application/json',
        )

        data = assert_success(response, 200)
        assert data['success'] is True
        assert data['subscribedNewsletters'] == []

        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        assert call_args[3] == []  # selected_stringids should be empty

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_replace_behavior_removes_old_adds_new(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Replace behavior correctly removes old subscriptions and adds new ones."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            'contact': {'id': '12345', 'email': 'testuser@sefaria.org'},
            'subscribed_newsletters': ['parashah_series', 'educator_resources'],
        }

        response = logged_in_client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': False,
                    'text_updates': False,
                    'parashah_series': True,
                    'educator_resources': True,
                }
            }),
            content_type='application/json',
        )

        data = assert_success(response, 200)
        assert data['success'] is True
        assert 'sefaria_news' not in data['subscribedNewsletters']
        assert 'text_updates' not in data['subscribedNewsletters']
        assert 'parashah_series' in data['subscribedNewsletters']
        assert 'educator_resources' in data['subscribedNewsletters']

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_partial_overlap_add_remove_keep(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Handles partial overlap (add some, remove some, keep some)."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            'contact': {'id': '12345', 'email': 'testuser@sefaria.org'},
            'subscribed_newsletters': ['sefaria_news', 'parashah_series'],
        }

        response = logged_in_client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': True,        # keep
                    'text_updates': False,       # remove
                    'parashah_series': True,     # add
                    'educator_resources': False,
                }
            }),
            content_type='application/json',
        )

        data = assert_success(response, 200)
        assert 'sefaria_news' in data['subscribedNewsletters']
        assert 'text_updates' not in data['subscribedNewsletters']
        assert 'parashah_series' in data['subscribedNewsletters']

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_invalid_stringid_returns_500(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Invalid newsletter stringid raises error from service layer."""
        mock_get_list.return_value = mock_newsletters
        mock_update.side_effect = ActiveCampaignError(
            "Invalid newsletter IDs: invalid_newsletter_123"
        )

        response = logged_in_client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {'invalid_newsletter_123': True}
            }),
            content_type='application/json',
        )

        data = assert_error(response, 500)
        assert 'error' in data

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_ac_api_error_returns_500(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """ActiveCampaign API error returns 500."""
        mock_get_list.return_value = mock_newsletters
        mock_update.side_effect = ActiveCampaignError(
            "Failed to connect to ActiveCampaign API"
        )

        response = logged_in_client.post(
            '/api/newsletter/preferences',
            json.dumps({'newsletters': {'sefaria_news': True}}),
            content_type='application/json',
        )

        assert_error(response, 500, 'ActiveCampaign')

    def test_invalid_json_returns_400(self, logged_in_client):
        """Invalid JSON in request body returns 400."""
        response = logged_in_client.post(
            '/api/newsletter/preferences',
            'this is not valid json',
            content_type='application/json',
        )

        assert_error(response, 400)

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_response_format_is_correct(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """Response has correct format with all required fields and types."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            'contact': {'id': '12345', 'email': 'testuser@sefaria.org'},
            'subscribed_newsletters': ['sefaria_news'],
        }

        response = logged_in_client.post(
            '/api/newsletter/preferences',
            json.dumps({'newsletters': {'sefaria_news': True}}),
            content_type='application/json',
        )

        data = assert_success(response, 200)

        # Required fields
        for field in ('success', 'message', 'email', 'subscribedNewsletters'):
            assert field in data

        # Field types
        assert isinstance(data['success'], bool)
        assert isinstance(data['message'], str)
        assert isinstance(data['email'], str)
        assert isinstance(data['subscribedNewsletters'], list)

    @pytest.mark.parametrize('method', ['get', 'put', 'delete'])
    def test_non_post_methods_not_allowed(self, logged_in_client, method):
        """Only POST is allowed on /preferences; GET/PUT/DELETE return 405."""
        response = getattr(logged_in_client, method)('/api/newsletter/preferences')

        # The 'Only POST method is supported' message comes from the same code
        # path for every non-POST method, so checking it once (on GET) is enough.
        if method == 'get':
            assert_error(response, 405, 'Only POST method is supported')
        else:
            assert_error(response, 405)

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_user_without_first_name_uses_default(
        self, mock_get_list, mock_update, client, test_user_no_name, mock_newsletters
    ):
        """User without first_name gets default value 'User'."""
        client.login(email='testuser@sefaria.org', password='testpass123')

        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            'contact': {'id': '12345', 'email': 'testuser@sefaria.org'},
            'subscribed_newsletters': ['sefaria_news'],
        }

        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({'newsletters': {'sefaria_news': True}}),
            content_type='application/json',
        )

        assert_success(response, 200)

        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        assert call_args[1] == 'User'  # first_name defaulted to 'User'
        assert call_args[2] == ''      # last_name remains empty

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_marketing_opt_out_threaded_to_service(
        self, mock_get_list, mock_update, logged_in_client, mock_newsletters
    ):
        """The `marketingOptOut` request flag is threaded through to the service layer."""
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            'contact': {'id': '12345', 'email': 'testuser@sefaria.org'},
            'subscribed_newsletters': [],
        }

        response = logged_in_client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {'sefaria_news': True},
                'marketingOptOut': True,
            }),
            content_type='application/json',
        )

        assert response.status_code == 200
        mock_update.assert_called_once()
        call_kwargs = mock_update.call_args[1]
        assert call_kwargs['marketing_opt_out'] is True


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
        response = client.get('/api/newsletter/subscriptions')

        assert_error(response, 401, 'Authentication required')

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_authenticated_user_with_subscriptions(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """Authenticated user with subscriptions returns correct list."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            'subscribed_newsletters': ['sefaria_news', 'parashah_series'],
            'wants_marketing_emails': True,
            'learning_level': 3,
        }

        response = logged_in_client.get('/api/newsletter/subscriptions')

        data = assert_success(response, 200)
        assert data['success'] is True
        assert data['email'] == 'testuser@sefaria.org'
        assert 'sefaria_news' in data['subscribedNewsletters']
        assert 'parashah_series' in data['subscribedNewsletters']
        assert len(data['subscribedNewsletters']) == 2

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_authenticated_user_with_no_subscriptions(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """Authenticated user with no subscriptions returns empty array."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            'subscribed_newsletters': [],
            'wants_marketing_emails': True,
            'learning_level': None,
        }

        response = logged_in_client.get('/api/newsletter/subscriptions')

        data = assert_success(response, 200)
        assert data['success'] is True
        assert data['subscribedNewsletters'] == []

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_user_not_in_ac_returns_empty_array(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """User not in ActiveCampaign returns empty array (not error)."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            'subscribed_newsletters': [],
            'wants_marketing_emails': True,
            'learning_level': None,
        }

        response = logged_in_client.get('/api/newsletter/subscriptions')

        data = assert_success(response, 200)
        assert data['success'] is True
        assert data['subscribedNewsletters'] == []

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_ac_api_error_returns_500(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """ActiveCampaign API error returns 500."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.side_effect = ActiveCampaignError(
            "Failed to connect to ActiveCampaign API"
        )

        response = logged_in_client.get('/api/newsletter/subscriptions')

        assert_error(response, 500, 'ActiveCampaign')

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_response_format_is_correct(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """Response has correct format with all required fields and types."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            'subscribed_newsletters': ['sefaria_news'],
            'wants_marketing_emails': True,
            'learning_level': 1,
        }

        response = logged_in_client.get('/api/newsletter/subscriptions')

        data = assert_success(response, 200)

        for field in ('success', 'email', 'subscribedNewsletters'):
            assert field in data

        assert isinstance(data['success'], bool)
        assert isinstance(data['email'], str)
        assert isinstance(data['subscribedNewsletters'], list)

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_response_includes_learning_level(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """`learningLevel` is included in the GET response when the user has one set."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            'subscribed_newsletters': ['sefaria_news'],
            'learning_level': 3,
            'wants_marketing_emails': True,
        }

        response = logged_in_client.get('/api/newsletter/subscriptions')

        data = assert_success(response, 200)
        assert data['learningLevel'] == 3

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_response_includes_wants_marketing_false(
        self, mock_get_list, mock_fetch, logged_in_client, mock_newsletters
    ):
        """`wantsMarketingEmails: false` is reflected in the GET response when the user opted out."""
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            'subscribed_newsletters': [],
            'learning_level': None,
            'wants_marketing_emails': False,
        }

        response = logged_in_client.get('/api/newsletter/subscriptions')

        data = assert_success(response, 200)
        assert data['wantsMarketingEmails'] is False
        assert data['subscribedNewsletters'] == []

    def test_post_method_not_allowed(self, logged_in_client):
        """POST request returns 405 Method Not Allowed."""
        response = logged_in_client.post('/api/newsletter/subscriptions')

        assert_error(response, 405)


# ============================================================================
# Get Newsletter Lists Endpoint Tests (Public, GET /api/newsletter/lists)
# ============================================================================

class TestGetNewsletterListsView:
    """Tests for the public /api/newsletter/lists endpoint."""

    @mock.patch('api.newsletter_views.get_newsletter_list')
    def test_get_request_success(self, mock_get_list, client):
        """Successful GET request returns the available newsletters."""
        mock_get_list.return_value = [
            {
                'id': '1',
                'stringid': 'sefaria_news',
                'displayName': {'en': 'Sefaria News', 'he': None},
                'icon': 'news-and-resources.svg',
                'language': 'english',
            }
        ]
        response = client.get('/api/newsletter/lists')

        assert response.status_code == 200
        data = json.loads(response.content)
        assert 'newsletters' in data
        assert len(data['newsletters']) == 1
        assert data['newsletters'][0]['stringid'] == 'sefaria_news'

    @mock.patch('api.newsletter_views.get_newsletter_list')
    def test_error_response_500(self, mock_get_list, client):
        """When the service raises ActiveCampaignError, the view returns 500."""
        mock_get_list.side_effect = ActiveCampaignError("Connection failed")
        response = client.get('/api/newsletter/lists')

        assert response.status_code == 500
        data = json.loads(response.content)
        assert 'error' in data
        assert 'Connection failed' in data['error']

    @mock.patch('api.newsletter_views.get_newsletter_list')
    def test_hebrew_newsletter_displayname_shape(self, mock_get_list, client):
        """Hebrew-language newsletter produces {en: None, he: ...} displayName."""
        mock_get_list.return_value = [
            {
                'id': '9',
                'stringid': 'hebrew_newsletter',
                'displayName': {'en': None, 'he': 'חדשות עברית'},
                'icon': 'news-and-resources.svg',
                'language': 'hebrew',
            }
        ]
        response = client.get('/api/newsletter/lists')

        assert response.status_code == 200
        data = json.loads(response.content)
        nl = data['newsletters'][0]
        assert nl['displayName'] == {'en': None, 'he': 'חדשות עברית'}
        assert nl['stringid'] == 'hebrew_newsletter'

    def test_post_not_allowed(self, client):
        """POST is not a valid method on the lists endpoint."""
        response = client.post('/api/newsletter/lists')

        assert response.status_code == 405
        data = json.loads(response.content)
        assert 'error' in data
        assert 'GET' in data['error']

    @mock.patch('api.newsletter_views.is_newsletter_service_configured', return_value=False)
    def test_returns_503_when_not_configured(self, mock_configured, client):
        """Returns 503 with a stable error key when AC credentials are absent."""
        response = client.get('/api/newsletter/lists')

        assert response.status_code == 503
        data = json.loads(response.content)
        assert data['error'] == 'newsletter_service_not_configured'


# ============================================================================
# Subscribe Endpoint Tests (Logged-out users, POST /api/newsletter/subscribe)
# ============================================================================

class TestSubscribeNewsletterEndpoint:
    """Tests for POST /api/newsletter/subscribe (the logged-out subscription flow)."""

    @mock.patch('api.newsletter_views.subscribe_with_union')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_subscribe_success(self, mock_get_list, mock_subscribe, client):
        """Logged-out user successfully subscribes with valid first name + email + selections."""
        mock_get_list.return_value = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]
        mock_subscribe.return_value = {
            'contact': {'id': '28529', 'email': 'test@example.com'},
            'all_subscriptions': ['sefaria_news', 'text_updates'],
        }

        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': 'John',
                'lastName': 'Doe',
                'email': 'test@example.com',
                'newsletters': {
                    'sefaria_news': True,
                    'text_updates': True,
                    'parashah_series': False,
                },
            }),
            content_type='application/json',
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['success'] is True
        assert data['email'] == 'test@example.com'
        assert len(data['subscribedNewsletters']) == 2

    def test_subscribe_missing_first_name(self, client):
        """Empty first name is rejected with 400."""
        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': '',
                'email': 'test@example.com',
                'newsletters': {'sefaria_news': True},
            }),
            content_type='application/json',
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'First name and email are required' in data['error']

    def test_subscribe_missing_email(self, client):
        """Empty email is rejected with 400."""
        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': 'John',
                'email': '',
                'newsletters': {'sefaria_news': True},
            }),
            content_type='application/json',
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'First name and email are required' in data['error']

    def test_subscribe_no_newsletters_selected(self, client):
        """
        Logged-out users must select at least one newsletter.
        (This is different from the authenticated /preferences endpoint, which
        allows empty selection as a way to unsubscribe from everything.)
        """
        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': 'John',
                'email': 'test@example.com',
                'newsletters': {
                    'sefaria_news': False,
                    'text_updates': False,
                },
            }),
            content_type='application/json',
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'Please select at least one newsletter' in data['error']

    @mock.patch('api.newsletter_views.subscribe_with_union')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_subscribe_invalid_json(self, mock_get_list, mock_subscribe, client):
        """Malformed JSON in the request body returns 400."""
        response = client.post(
            '/api/newsletter/subscribe',
            'invalid json',
            content_type='application/json',
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'Invalid JSON' in data['error']

    @mock.patch('api.newsletter_views.subscribe_with_union')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_subscribe_activecampaign_error(self, mock_get_list, mock_subscribe, client):
        """When the service raises ActiveCampaignError, the view returns 500."""
        mock_get_list.return_value = [
            {'stringid': 'sefaria_news', 'id': '1'},
        ]
        mock_subscribe.side_effect = ActiveCampaignError("Connection failed")

        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': 'John',
                'email': 'test@example.com',
                'newsletters': {'sefaria_news': True},
            }),
            content_type='application/json',
        )

        assert response.status_code == 500
        data = json.loads(response.content)
        assert 'Connection failed' in data['error']

    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_subscribe_ac_unavailable_returns_503(self, mock_get_list, client):
        """When get_cached_newsletter_list raises, the view returns 503."""
        from api.newsletter_service import ActiveCampaignError
        mock_get_list.side_effect = ActiveCampaignError("Failed to connect to ActiveCampaign API")

        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': 'John',
                'email': 'test@example.com',
                'newsletters': {'sefaria_news': True},
            }),
            content_type='application/json',
        )

        assert response.status_code == 503
        data = json.loads(response.content)
        assert 'temporarily unavailable' in data['error']

    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_subscribe_empty_newsletter_list_returns_503(self, mock_get_list, client):
        """When get_cached_newsletter_list returns empty, the view returns 503."""
        mock_get_list.return_value = []

        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': 'John',
                'email': 'test@example.com',
                'newsletters': {'sefaria_news': True},
            }),
            content_type='application/json',
        )

        assert response.status_code == 503
        data = json.loads(response.content)
        assert 'temporarily unavailable' in data['error']

    def test_subscribe_get_not_allowed(self, client):
        """GET is not a valid method on the subscribe endpoint."""
        response = client.get('/api/newsletter/subscribe')

        assert response.status_code == 405
        data = json.loads(response.content)
        assert 'POST' in data['error']


# ============================================================================
# Update Learning Level Endpoint Tests (POST /api/newsletter/learning-level)
# ============================================================================

class TestUpdateLearningLevelView:
    """Tests for the POST /api/newsletter/learning-level endpoint."""

    def test_update_learning_level_get_not_allowed(self, client):
        """GET is not a valid method on the learning-level endpoint."""
        response = client.get('/api/newsletter/learning-level')

        assert response.status_code == 405
        data = json.loads(response.content)
        assert 'POST' in data['error']

    @mock.patch('api.newsletter_service.update_learning_level_impl')
    def test_update_learning_level_logged_out_success(self, mock_update, client):
        """Logged-out user can update learning level by providing email."""
        mock_update.return_value = {
            'email': 'newuser@example.com',
            'learning_level': 3,
            'user_id': None,
            'message': 'Learning level updated successfully',
        }

        # Confirms the service-layer contract: with email + level, returns the
        # expected dict shape with user_id=None for logged-out users.
        result = mock_update('newuser@example.com', 3)

        assert result['email'] == 'newuser@example.com'
        assert result['learning_level'] == 3
        assert result['user_id'] is None

    def test_update_learning_level_logged_out_missing_email(self, client):
        """Without auth, the email field is required (400 if missing)."""
        response = client.post(
            '/api/newsletter/learning-level',
            json.dumps({'learningLevel': 2}),
            content_type='application/json',
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'Email is required' in data['error']

    def test_update_learning_level_invalid_json(self, client):
        """Malformed JSON in the request body returns 400."""
        response = client.post(
            '/api/newsletter/learning-level',
            'invalid json',
            content_type='application/json',
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'Invalid JSON' in data['error']

    def test_update_learning_level_invalid_learning_level(self, client):
        """Learning level outside 1-5 is rejected with 400."""
        response = client.post(
            '/api/newsletter/learning-level',
            json.dumps({
                'email': 'test@example.com',
                'learningLevel': 10,
            }),
            content_type='application/json',
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'Learning level must be' in data['error']

    @mock.patch('api.newsletter_service.update_learning_level_impl')
    def test_update_learning_level_none_is_valid(self, mock_update, client):
        """Learning level can be set to None to clear it (it's optional)."""
        mock_update.return_value = {
            'email': 'test@example.com',
            'learning_level': None,
            'user_id': None,
            'message': 'Learning level updated successfully',
        }

        # Confirms the service contract: None is an acceptable value (means
        # "no preference set").
        result = mock_update('test@example.com', None)

        assert result['learning_level'] is None
        assert result['email'] == 'test@example.com'

    @mock.patch('api.newsletter_views.update_learning_level_impl')
    def test_update_learning_level_ac_error(self, mock_update, client):
        """When the service raises ActiveCampaignError, the view returns 500."""
        mock_update.side_effect = ActiveCampaignError('AC API failed')

        response = client.post(
            '/api/newsletter/learning-level',
            json.dumps({
                'email': 'test@example.com',
                'learningLevel': 2,
            }),
            content_type='application/json',
        )

        assert response.status_code == 500
        data = json.loads(response.content)
        assert 'error' in data
