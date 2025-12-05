"""
Newsletter API Integration Tests - Minimal Working Version

Tests authentication and core functionality for newsletter API endpoints.
"""

import pytest
import json
from unittest import mock
from django.test import Client
from django.contrib.auth.models import User
from api.newsletter_service import ActiveCampaignError


@pytest.fixture
def client():
    """Fixture providing Django test client"""
    return Client()


@pytest.fixture
def mock_newsletters():
    """Fixture providing mock newsletter data - matches actual API structure"""
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
    ]


@pytest.fixture
def test_user():
    """Fixture providing a test user"""
    user = User.objects.create_user(
        username='testuser@sefaria.org',
        email='testuser@sefaria.org',
        password='testpass123'
    )
    user.first_name = 'Test'
    user.last_name = 'User'
    user.save()
    return user


# ============================================================================
# Update User Preferences Tests (Authenticated)
# ============================================================================

@pytest.mark.django_db
class TestUpdateUserPreferences:
    """Tests for POST /api/newsletter/preferences"""

    def test_unauthenticated_returns_401(self, client):
        """Test: Unauthenticated request returns 401"""
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({'newsletters': {'sefaria_news': True}}),
            content_type='application/json'
        )

        assert response.status_code == 401
        data = json.loads(response.content)
        assert 'authentication required' in data['error'].lower()

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_authenticated_user_can_update(self, mock_get_list, mock_update,
                                          client, test_user, mock_newsletters):
        """Test: Authenticated user can update preferences"""
        # Login
        client.login(email='testuser@sefaria.org', password='testpass123')

        # Setup mocks
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            'contact': {'id': '12345', 'email': 'testuser@sefaria.org'},
            'subscribed_newsletters': ['sefaria_news']
        }

        # Execute
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': True,
                    'text_updates': False
                }
            }),
            content_type='application/json'
        )

        # Verify
        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['success'] == True
        assert 'sefaria_news' in data['subscribedNewsletters']

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_empty_selection_allowed(self, mock_get_list, mock_update,
                                     client, test_user, mock_newsletters):
        """Test: Empty selection unsubscribes from all (NEW BEHAVIOR)"""
        # Login
        client.login(email='testuser@sefaria.org', password='testpass123')

        # Setup mocks
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            'contact': {'id': '12345', 'email': 'testuser@sefaria.org'},
            'subscribed_newsletters': []  # No subscriptions
        }

        # Execute - all newsletters set to false
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': False,
                    'text_updates': False
                }
            }),
            content_type='application/json'
        )

        # Verify
        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['success'] == True
        assert data['subscribedNewsletters'] == []

        # Verify service was called with empty list
        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        assert call_args[3] == []  # selected_stringids should be empty


# ============================================================================
# Get User Subscriptions Tests (Authenticated)
# ============================================================================

@pytest.mark.django_db
class TestGetUserSubscriptions:
    """Tests for GET /api/newsletter/subscriptions"""

    def test_unauthenticated_returns_401(self, client):
        """Test: Unauthenticated request returns 401"""
        response = client.get('/api/newsletter/subscriptions')

        assert response.status_code == 401
        data = json.loads(response.content)
        assert 'authentication required' in data['error'].lower()

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_authenticated_user_with_subscriptions(self, mock_get_list, mock_fetch,
                                                   client, test_user, mock_newsletters):
        """Test: Authenticated user with subscriptions returns list"""
        # Login
        client.login(email='testuser@sefaria.org', password='testpass123')

        # Setup mocks
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            'subscribed_newsletters': ['sefaria_news', 'text_updates'],
            'learning_level': None
        }

        # Execute
        response = client.get('/api/newsletter/subscriptions')

        # Verify
        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['success'] == True
        assert len(data['subscribedNewsletters']) == 2
        assert 'sefaria_news' in data['subscribedNewsletters']
        assert 'text_updates' in data['subscribedNewsletters']


# ============================================================================
# Subscribe Newsletter Tests (Logged-Out, UNION behavior)
# ============================================================================

@pytest.mark.django_db
class TestSubscribeNewsletter:
    """Tests for POST /api/newsletter/subscribe (logged-out users)"""

    @mock.patch('api.newsletter_views.subscribe_with_union')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_logged_out_user_can_subscribe(self, mock_get_list, mock_subscribe,
                                           client, mock_newsletters):
        """Test: Logged-out user can subscribe to newsletters"""
        # Setup mocks
        mock_get_list.return_value = mock_newsletters
        mock_subscribe.return_value = {
            'contact': {'id': '12345', 'email': 'newuser@example.com'},
            'all_subscriptions': ['sefaria_news']
        }

        # Execute
        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': 'New',
                'lastName': 'User',
                'email': 'newuser@example.com',
                'newsletters': {
                    'sefaria_news': True,
                    'text_updates': False
                }
            }),
            content_type='application/json'
        )

        # Verify
        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['success'] == True
        assert 'sefaria_news' in data['subscribedNewsletters']

    def test_empty_selection_rejected_for_logged_out(self, client):
        """Test: Empty selection is REJECTED for logged-out users"""
        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': 'Test',
                'lastName': 'User',
                'email': 'test@example.com',
                'newsletters': {
                    'sefaria_news': False,
                    'text_updates': False
                }
            }),
            content_type='application/json'
        )

        # Verify
        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'select at least one' in data['error'].lower()


# ============================================================================
# Get Newsletter Lists Tests (Public endpoint)
# ============================================================================

@pytest.mark.django_db
class TestGetNewsletterLists:
    """Tests for GET /api/newsletter/lists (public endpoint)"""

    def test_get_lists_success(self, client):
        """Test: GET returns newsletter list"""
        response = client.get('/api/newsletter/lists')

        assert response.status_code == 200
        data = json.loads(response.content)
        assert 'newsletters' in data
        assert len(data['newsletters']) > 0  # Just check we get some newsletters
        # Verify structure of first newsletter
        if len(data['newsletters']) > 0:
            newsletter = data['newsletters'][0]
            assert 'stringid' in newsletter
            assert 'displayName' in newsletter

    def test_post_method_not_allowed(self, client):
        """Test: POST to lists endpoint returns 405"""
        response = client.post('/api/newsletter/lists')

        assert response.status_code == 405
