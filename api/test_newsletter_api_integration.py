"""
Newsletter API Integration Tests

Django Test Client integration tests for all newsletter API endpoints.
Tests authentication, request parsing, validation, and response formatting using
real HTTP requests (but mocked ActiveCampaign API calls).

These tests complement the unit tests in test_newsletter.py by testing the full
HTTP request/response cycle including Django middleware, authentication, and view logic.
"""

import pytest
import json
from unittest import mock
from django.test import Client
from django.contrib.auth.models import User
from sefaria.system.exceptions import InputError
from api.newsletter_service import ActiveCampaignError


@pytest.fixture
def client():
    """Fixture providing Django test client"""
    return Client()


@pytest.fixture
def mock_newsletters():
    """Fixture providing mock newsletter data"""
    return [
        {
            'id': '1',
            'stringid': 'sefaria_news',
            'displayName': 'Sefaria News & Resources',
            'emoji': '📚',
            'language': 'english'
        },
        {
            'id': '3',
            'stringid': 'text_updates',
            'displayName': 'New Text Updates',
            'emoji': '📖',
            'language': 'english'
        },
        {
            'id': '5',
            'stringid': 'parashah_series',
            'displayName': 'Weekly Parashah Study Series',
            'emoji': '✡️',
            'language': 'english'
        },
        {
            'id': '7',
            'stringid': 'educator_resources',
            'displayName': 'Educator Resources',
            'emoji': '🎓',
            'language': 'english'
        },
    ]


# Helper functions
def create_test_user(email='testuser@sefaria.org', password='testpass123',
                    first_name='Test', last_name='User'):
    """
    Helper to create and return a test user.

    Args:
        email: User's email address (also used as username)
        password: User's password
        first_name: User's first name
        last_name: User's last name

    Returns:
        User: Created Django user instance
    """
    user = User.objects.create_user(
        username=email,
        email=email,
        password=password
    )
    user.first_name = first_name
    user.last_name = last_name
    user.save()
    return user


# ============================================================================
# Update User Preferences Integration Tests (Authenticated, REPLACE behavior)
# ============================================================================

@pytest.mark.django_db
class TestUpdateUserPreferencesIntegration:
    """
    Integration tests for POST /api/newsletter/preferences (authenticated users).

    This endpoint uses REPLACE behavior: the selected newsletters become the user's
    complete subscription list. Unselected newsletters are unsubscribed.

    Key scenarios tested:
    - Authentication required (401 for unauthenticated)
    - Empty selection allowed (unsubscribe from all)
    - Replace behavior (removes old, adds new)
    - Partial overlaps (add some, remove some, keep some)
    - Invalid newsletter stringids
    - AC API errors
    - Invalid JSON
    - Response format validation
    - Method restrictions (POST only)
    """

    def test_unauthenticated_request_returns_401(self, client):
        """Test: Unauthenticated request returns 401 Unauthorized"""
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': True,
                    'text_updates': True
                }
            }),
            content_type='application/json'
        )

        assert response.status_code == 401
        data = json.loads(response.content)
        assert 'authentication required' in data['error'].lower()

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_authenticated_user_can_update_preferences(self, mock_get_list, mock_update, client, mock_newsletters):
        """Test: Authenticated user can successfully update preferences"""
        # Setup
        user = create_test_user()
        client.login(email='testuser@sefaria.org', password='testpass123')

        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = ['sefaria_news', 'parashah_series']

        # Execute
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': True,
                    'text_updates': False,
                    'parashah_series': True,
                    'educator_resources': False
                }
            }),
            content_type='application/json'
        )

        # Verify
        self.assert_success_response(response, 200)
        data = self.parse_json_response(response)

        self.assertTrue(data['success'])
        self.assertEqual(data['email'], 'testuser@sefaria.org')
        self.assertIn('sefaria_news', data['subscribedNewsletters'])
        self.assertIn('parashah_series', data['subscribedNewsletters'])
        self.assertEqual(len(data['subscribedNewsletters']), 2)

        # Verify service layer was called correctly
        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        self.assertEqual(call_args[0], 'testuser@sefaria.org')  # email
        self.assertEqual(call_args[1], 'Test')  # first_name
        self.assertEqual(call_args[2], 'User')  # last_name
        self.assertIn('sefaria_news', call_args[3])  # selected_stringids
        self.assertIn('parashah_series', call_args[3])

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_empty_selection_allowed_unsubscribes_from_all(self, mock_get_list, mock_update):
        """Test: Empty selection is allowed for authenticated users (unsubscribe from all)"""
        # Setup
        user = create_test_user()
        client.login()

        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = []  # No subscriptions after update

        # Execute - all newsletters set to false (empty selection)
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': False,
                    'text_updates': False,
                    'parashah_series': False,
                    'educator_resources': False
                }
            }),
            content_type='application/json'
        )

        # Verify
        self.assert_success_response(response, 200)
        data = self.parse_json_response(response)

        self.assertTrue(data['success'])
        self.assertEqual(data['subscribedNewsletters'], [])

        # Verify service layer was called with empty selection
        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        self.assertEqual(call_args[3], [])  # selected_stringids should be empty list

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_replace_behavior_removes_old_adds_new(self, mock_get_list, mock_update):
        """Test: Replace behavior correctly removes old subscriptions and adds new ones"""
        # Setup
        user = create_test_user()
        client.login()

        mock_get_list.return_value = mock_newsletters
        # Simulate replace: user had sefaria_news + text_updates, now has parashah_series + educator_resources
        mock_update.return_value = ['parashah_series', 'educator_resources']

        # Execute
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': False,
                    'text_updates': False,
                    'parashah_series': True,
                    'educator_resources': True
                }
            }),
            content_type='application/json'
        )

        # Verify
        self.assert_success_response(response, 200)
        data = self.parse_json_response(response)

        self.assertTrue(data['success'])
        self.assertNotIn('sefaria_news', data['subscribedNewsletters'])
        self.assertNotIn('text_updates', data['subscribedNewsletters'])
        self.assertIn('parashah_series', data['subscribedNewsletters'])
        self.assertIn('educator_resources', data['subscribedNewsletters'])

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_partial_overlap_add_remove_keep(self, mock_get_list, mock_update):
        """Test: Handles partial overlap (add some, remove some, keep some)"""
        # Setup
        user = create_test_user()
        client.login()

        mock_get_list.return_value = mock_newsletters
        # Simulate: user keeps sefaria_news, removes text_updates, adds parashah_series
        mock_update.return_value = ['sefaria_news', 'parashah_series']

        # Execute
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': True,  # keep
                    'text_updates': False,  # remove
                    'parashah_series': True,  # add
                    'educator_resources': False
                }
            }),
            content_type='application/json'
        )

        # Verify
        self.assert_success_response(response, 200)
        data = self.parse_json_response(response)

        self.assertIn('sefaria_news', data['subscribedNewsletters'])
        self.assertNotIn('text_updates', data['subscribedNewsletters'])
        self.assertIn('parashah_series', data['subscribedNewsletters'])

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_invalid_stringid_returns_500(self, mock_get_list, mock_update):
        """Test: Invalid newsletter stringid raises error from service layer"""
        # Setup
        user = create_test_user()
        client.login()

        mock_get_list.return_value = mock_newsletters
        mock_update.side_effect = ActiveCampaignError("Invalid newsletter IDs: invalid_newsletter_123")

        # Execute
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'invalid_newsletter_123': True
                }
            }),
            content_type='application/json'
        )

        # Verify
        self.assert_error_response(response, 500)
        data = self.parse_json_response(response)
        self.assertIn('error', data)

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_ac_api_error_returns_500(self, mock_get_list, mock_update):
        """Test: ActiveCampaign API error returns 500"""
        # Setup
        user = create_test_user()
        client.login()

        mock_get_list.return_value = mock_newsletters
        mock_update.side_effect = ActiveCampaignError("Failed to connect to ActiveCampaign API")

        # Execute
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': True
                }
            }),
            content_type='application/json'
        )

        # Verify
        self.assert_error_response(response, 500, 'ActiveCampaign')

    def test_invalid_json_returns_400(self):
        """Test: Invalid JSON in request body returns 400"""
        # Setup
        user = create_test_user()
        client.login()

        # Execute - send malformed JSON
        response = client.post(
            '/api/newsletter/preferences',
            'this is not valid json',
            content_type='application/json'
        )

        # Verify
        self.assert_error_response(response, 400)

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_response_format_is_correct(self, mock_get_list, mock_update):
        """Test: Response has correct format with all required fields"""
        # Setup
        user = create_test_user()
        client.login()

        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = ['sefaria_news']

        # Execute
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': True
                }
            }),
            content_type='application/json'
        )

        # Verify
        self.assert_success_response(response, 200)
        data = self.parse_json_response(response)

        # Check all required fields
        self.assertIn('success', data)
        self.assertIn('message', data)
        self.assertIn('email', data)
        self.assertIn('subscribedNewsletters', data)

        # Check types
        self.assertIsInstance(data['success'], bool)
        self.assertIsInstance(data['message'], str)
        self.assertIsInstance(data['email'], str)
        self.assertIsInstance(data['subscribedNewsletters'], list)

    def test_get_method_not_allowed(self):
        """Test: GET request returns 405 Method Not Allowed"""
        user = create_test_user()
        client.login()

        response = client.get('/api/newsletter/preferences')

        self.assert_error_response(response, 405, 'Only POST method is supported')

    def test_put_method_not_allowed(self):
        """Test: PUT request returns 405 Method Not Allowed"""
        user = create_test_user()
        client.login()

        response = client.put('/api/newsletter/preferences')

        self.assert_error_response(response, 405)

    def test_delete_method_not_allowed(self):
        """Test: DELETE request returns 405 Method Not Allowed"""
        user = create_test_user()
        client.login()

        response = client.delete('/api/newsletter/preferences')

        self.assert_error_response(response, 405)

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_user_without_first_name_uses_default(self, mock_get_list, mock_update):
        """Test: User without first_name gets default value 'User'"""
        # Setup - create user without first_name
        user = create_test_user(first_name='', last_name='')
        client.login()

        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = ['sefaria_news']

        # Execute
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': True
                }
            }),
            content_type='application/json'
        )

        # Verify
        self.assert_success_response(response, 200)

        # Verify service layer was called with default first_name = 'User'
        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        self.assertEqual(call_args[1], 'User')  # first_name should be 'User'
        self.assertEqual(call_args[2], '')  # last_name should be empty string


# ============================================================================
# Get User Subscriptions Integration Tests (Authenticated, GET)
# ============================================================================

class GetUserSubscriptionsIntegrationTest(NewsletterAPIIntegrationTestCase):
    """
    Integration tests for GET /api/newsletter/subscriptions (authenticated users).

    This endpoint retrieves the current newsletter subscriptions for an authenticated user.

    Key scenarios tested:
    - Authentication required (401 for unauthenticated)
    - User with subscriptions
    - User with no subscriptions
    - User not in ActiveCampaign
    - AC API errors
    - Response format validation
    - Method restrictions (GET only)
    """

    def test_unauthenticated_request_returns_401(self):
        """Test: Unauthenticated request returns 401 Unauthorized"""
        response = client.get('/api/newsletter/subscriptions')

        self.assert_error_response(response, 401, 'Authentication required')

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_authenticated_user_with_subscriptions(self, mock_get_list, mock_fetch):
        """Test: Authenticated user with subscriptions returns correct list"""
        # Setup
        user = create_test_user()
        client.login()

        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = ['sefaria_news', 'parashah_series']

        # Execute
        response = client.get('/api/newsletter/subscriptions')

        # Verify
        self.assert_success_response(response, 200)
        data = self.parse_json_response(response)

        self.assertTrue(data['success'])
        self.assertEqual(data['email'], 'testuser@sefaria.org')
        self.assertIn('sefaria_news', data['subscribedNewsletters'])
        self.assertIn('parashah_series', data['subscribedNewsletters'])
        self.assertEqual(len(data['subscribedNewsletters']), 2)

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_authenticated_user_with_no_subscriptions(self, mock_get_list, mock_fetch):
        """Test: Authenticated user with no subscriptions returns empty array"""
        # Setup
        user = create_test_user()
        client.login()

        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = []

        # Execute
        response = client.get('/api/newsletter/subscriptions')

        # Verify
        self.assert_success_response(response, 200)
        data = self.parse_json_response(response)

        self.assertTrue(data['success'])
        self.assertEqual(data['subscribedNewsletters'], [])

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_user_not_in_ac_returns_empty_array(self, mock_get_list, mock_fetch):
        """Test: User not in ActiveCampaign returns empty array (not error)"""
        # Setup
        user = create_test_user()
        client.login()

        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = []  # User doesn't exist in AC

        # Execute
        response = client.get('/api/newsletter/subscriptions')

        # Verify
        self.assert_success_response(response, 200)
        data = self.parse_json_response(response)

        self.assertTrue(data['success'])
        self.assertEqual(data['subscribedNewsletters'], [])

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_ac_api_error_returns_500(self, mock_get_list, mock_fetch):
        """Test: ActiveCampaign API error returns 500"""
        # Setup
        user = create_test_user()
        client.login()

        mock_get_list.return_value = mock_newsletters
        mock_fetch.side_effect = ActiveCampaignError("Failed to connect to ActiveCampaign API")

        # Execute
        response = client.get('/api/newsletter/subscriptions')

        # Verify
        self.assert_error_response(response, 500, 'ActiveCampaign')

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_response_format_is_correct(self, mock_get_list, mock_fetch):
        """Test: Response has correct format with all required fields"""
        # Setup
        user = create_test_user()
        client.login()

        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = ['sefaria_news']

        # Execute
        response = client.get('/api/newsletter/subscriptions')

        # Verify
        self.assert_success_response(response, 200)
        data = self.parse_json_response(response)

        # Check all required fields
        self.assertIn('success', data)
        self.assertIn('email', data)
        self.assertIn('subscribedNewsletters', data)

        # Check types
        self.assertIsInstance(data['success'], bool)
        self.assertIsInstance(data['email'], str)
        self.assertIsInstance(data['subscribedNewsletters'], list)

    def test_post_method_not_allowed(self):
        """Test: POST request returns 405 Method Not Allowed"""
        user = create_test_user()
        client.login()

        response = client.post('/api/newsletter/subscriptions')

        self.assert_error_response(response, 405)
