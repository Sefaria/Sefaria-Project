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
            'icon': 'news-and-resources.svg',
            'language': 'english'
        },
        {
            'id': '3',
            'stringid': 'text_updates',
            'displayName': 'New Text Updates',
            'icon': 'new-text-release-updates.svg',
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

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_marketing_opt_out_threaded_to_service(self, mock_get_list, mock_update,
                                                    client, test_user, mock_newsletters):
        """Test: marketingOptOut flag is passed through to service layer"""
        # Login
        client.login(email='testuser@sefaria.org', password='testpass123')

        # Setup mocks
        mock_get_list.return_value = mock_newsletters
        mock_update.return_value = {
            'contact': {'id': '12345', 'email': 'testuser@sefaria.org'},
            'subscribed_newsletters': []
        }

        # Execute with marketingOptOut=True
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {'sefaria_news': True},
                'marketingOptOut': True
            }),
            content_type='application/json'
        )

        # Verify
        assert response.status_code == 200

        # Verify marketing_opt_out was passed to service
        mock_update.assert_called_once()
        call_kwargs = mock_update.call_args[1]
        assert call_kwargs['marketing_opt_out'] == True


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
            'learning_level': None,
            'wants_marketing_emails': True,
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
        assert data['wantsMarketingEmails'] == True
        assert data['learningLevel'] is None

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_subscription_response_includes_learning_level(self, mock_get_list, mock_fetch,
                                                            client, test_user, mock_newsletters):
        """Test: learningLevel is included in GET response when set"""
        # Login
        client.login(email='testuser@sefaria.org', password='testpass123')

        # Setup mocks - user has learning level set
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            'subscribed_newsletters': ['sefaria_news'],
            'learning_level': 3,
            'wants_marketing_emails': True,
        }

        # Execute
        response = client.get('/api/newsletter/subscriptions')

        # Verify
        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['learningLevel'] == 3

    @mock.patch('api.newsletter_views.fetch_user_subscriptions_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_subscription_response_includes_wants_marketing_false(self, mock_get_list, mock_fetch,
                                                                    client, test_user, mock_newsletters):
        """Test: wantsMarketingEmails=false is included in GET response"""
        # Login
        client.login(email='testuser@sefaria.org', password='testpass123')

        # Setup mocks - user opted out
        mock_get_list.return_value = mock_newsletters
        mock_fetch.return_value = {
            'subscribed_newsletters': [],
            'learning_level': None,
            'wants_marketing_emails': False,
        }

        # Execute
        response = client.get('/api/newsletter/subscriptions')

        # Verify
        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['wantsMarketingEmails'] == False
        assert data['subscribedNewsletters'] == []


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


# ============================================================================
# Tier 2.5: View-through-Service Integration Tests
#
# These tests mock ONLY the network boundary and MongoDB — the full service
# logic (data mapping, set diffs, managed-list scoping) runs for real.
#
# Mock targets:
#   - _make_ac_request:              AC API calls via requests.request
#   - requests.post:                 Direct AC mutations (add/remove list membership)
#   - _update_wants_marketing_emails: MongoDB UserProfile writes
#   - get_cached_newsletter_list:    Django cache (returns controlled newsletter list)
#   - UserProfile (fetch path only): MongoDB read for wants_marketing_emails
# ============================================================================

class _MockHttpResponse:
    """Minimal mock for requests.Response used by direct requests.post calls."""
    def __init__(self, json_data, status_code=200):
        self._json_data = json_data
        self.status_code = status_code
        self.text = json.dumps(json_data)

    def json(self):
        return self._json_data

    def raise_for_status(self):
        pass


# Shared newsletter fixture for tier 2.5 tests
_TIER25_NEWSLETTERS = [
    {'stringid': 'sefaria_news', 'id': '1', 'displayName': 'Sefaria News',
     'icon': 'news.svg', 'language': 'english'},
    {'stringid': 'text_updates', 'id': '3', 'displayName': 'Text Updates',
     'icon': 'text.svg', 'language': 'english'},
]


def _ac_side_effect(contact_memberships, all_lists=None):
    """
    Build a _make_ac_request side_effect returning realistic AC responses.

    Args:
        contact_memberships: list of {'list': id, 'status': '1'|'2'} dicts
        all_lists: list of {'id': ..., 'stringid': ..., 'name': ...} dicts
                   (only needed for opt-out path that calls get_all_ac_list_ids)
    """
    def side_effect(endpoint, method='GET', data=None):
        if 'contacts?filters' in endpoint:
            return {'contacts': [{'id': '100', 'email': 'testuser@sefaria.org'}]}
        elif 'contactLists' in endpoint:
            return {'contactLists': contact_memberships}
        elif endpoint.startswith('lists'):
            return {'lists': all_lists or []}
        return {}
    return side_effect


def _extract_list_mutations(mock_post):
    """
    Parse requests.post call log into added/removed list ID sets.

    Returns:
        (set, set): (lists_added, lists_removed) based on the contactList payloads
    """
    added = set()
    removed = set()
    for call in mock_post.call_args_list:
        payload = call[1].get('json', {})
        cl = payload.get('contactList', {})
        list_id = cl.get('list')
        if list_id is None:
            continue
        if cl.get('status') == 2:
            removed.add(list_id)
        else:
            added.add(list_id)
    return added, removed


@pytest.mark.django_db
class TestViewThroughServiceNormalUpdate:
    """
    Tier 2.5: POST /api/newsletter/preferences (normal update, marketing_opt_out=False)
    Full service logic runs — verifies managed-list scoping end-to-end.
    """

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('requests.post')
    @mock.patch('api.newsletter_service._make_ac_request')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_diff_scoped_to_managed_lists(self, mock_get_list, mock_ac_request,
                                          mock_post, mock_update_flag,
                                          client, test_user):
        """
        User has managed lists 1, 3 and unmanaged list 99 (all active).
        Selecting only list 1 should remove list 3, leave list 99 untouched.
        """
        client.login(email='testuser@sefaria.org', password='testpass123')
        mock_get_list.return_value = _TIER25_NEWSLETTERS
        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {'list': '1', 'status': '1'},
                {'list': '3', 'status': '1'},
                {'list': '99', 'status': '1'},
            ]
        )
        mock_post.return_value = _MockHttpResponse({'contactList': {}})

        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({'newsletters': {'sefaria_news': True, 'text_updates': False}}),
            content_type='application/json'
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['success'] is True
        assert data['subscribedNewsletters'] == ['sefaria_news']

        added, removed = _extract_list_mutations(mock_post)
        assert '3' in removed, "Managed list 3 should be unsubscribed"
        assert '99' not in removed, "Unmanaged list 99 must NOT be touched"
        assert '1' not in added, "List 1 already active — no re-subscribe needed"

        mock_update_flag.assert_called_once_with('testuser@sefaria.org', True)

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('requests.post')
    @mock.patch('api.newsletter_service._make_ac_request')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_adding_new_managed_list(self, mock_get_list, mock_ac_request,
                                     mock_post, mock_update_flag,
                                     client, test_user):
        """
        User has only list 1. Selecting both list 1 and 3 should add list 3.
        """
        client.login(email='testuser@sefaria.org', password='testpass123')
        mock_get_list.return_value = _TIER25_NEWSLETTERS
        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {'list': '1', 'status': '1'},
            ]
        )
        mock_post.return_value = _MockHttpResponse({'contactList': {}})

        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({'newsletters': {'sefaria_news': True, 'text_updates': True}}),
            content_type='application/json'
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert sorted(data['subscribedNewsletters']) == ['sefaria_news', 'text_updates']

        added, removed = _extract_list_mutations(mock_post)
        assert '3' in added, "List 3 should be newly subscribed"
        assert len(removed) == 0, "No lists should be removed"


@pytest.mark.django_db
class TestViewThroughServiceOptOut:
    """
    Tier 2.5: POST /api/newsletter/preferences (marketing_opt_out=True)
    Full service logic runs — verifies ALL lists (managed + unmanaged) are removed.
    """

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('requests.post')
    @mock.patch('api.newsletter_service._make_ac_request')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_opt_out_removes_all_active_lists(self, mock_get_list, mock_ac_request,
                                               mock_post, mock_update_flag,
                                               client, test_user):
        """
        Opt-out: user has managed lists 1, 3 and unmanaged list 99.
        ALL active lists should be unsubscribed, wants_marketing_emails set to False.
        """
        client.login(email='testuser@sefaria.org', password='testpass123')
        mock_get_list.return_value = _TIER25_NEWSLETTERS
        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {'list': '1', 'status': '1'},
                {'list': '3', 'status': '1'},
                {'list': '99', 'status': '1'},
            ],
            all_lists=[
                {'id': '1', 'stringid': 'sefaria_news', 'name': 'Sefaria News'},
                {'id': '3', 'stringid': 'text_updates', 'name': 'Text Updates'},
                {'id': '99', 'stringid': 'internal_list', 'name': 'Internal'},
            ]
        )
        mock_post.return_value = _MockHttpResponse({'contactList': {}})

        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {'sefaria_news': True},
                'marketingOptOut': True
            }),
            content_type='application/json'
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['success'] is True
        assert data['subscribedNewsletters'] == []
        assert data['marketingOptOut'] is True

        added, removed = _extract_list_mutations(mock_post)
        assert removed == {'1', '3', '99'}, "All active lists must be removed on opt-out"
        assert len(added) == 0, "No lists should be added during opt-out"

        mock_update_flag.assert_called_once_with('testuser@sefaria.org', False)

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('requests.post')
    @mock.patch('api.newsletter_service._make_ac_request')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_opt_out_skips_already_unsubscribed_lists(self, mock_get_list, mock_ac_request,
                                                       mock_post, mock_update_flag,
                                                       client, test_user):
        """
        Opt-out: list 3 already unsubscribed (status=2). Should only remove list 1.
        active_only=True filtering in service prevents wasted API calls.
        """
        client.login(email='testuser@sefaria.org', password='testpass123')
        mock_get_list.return_value = _TIER25_NEWSLETTERS
        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {'list': '1', 'status': '1'},
                {'list': '3', 'status': '2'},  # already unsubscribed
            ],
            all_lists=[
                {'id': '1', 'stringid': 'sefaria_news', 'name': 'Sefaria News'},
                {'id': '3', 'stringid': 'text_updates', 'name': 'Text Updates'},
            ]
        )
        mock_post.return_value = _MockHttpResponse({'contactList': {}})

        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({'newsletters': {}, 'marketingOptOut': True}),
            content_type='application/json'
        )

        assert response.status_code == 200

        added, removed = _extract_list_mutations(mock_post)
        assert removed == {'1'}, "Only active list 1 should be removed"
        assert '3' not in removed, "Already-unsubscribed list 3 should be skipped"


@pytest.mark.django_db
class TestViewThroughServiceFetchSubscriptions:
    """
    Tier 2.5: GET /api/newsletter/subscriptions
    Full service logic runs — verifies list-ID-to-stringid mapping and
    wants_marketing_emails propagation from MongoDB through to HTTP response.
    """

    @mock.patch('api.newsletter_service.UserProfile')
    @mock.patch('api.newsletter_service._make_ac_request')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_maps_list_ids_to_stringids(self, mock_get_list, mock_ac_request,
                                        mock_profile_class, client, test_user):
        """
        Service maps AC list IDs back to stringids using the newsletter list.
        Only managed lists with matching IDs appear in the response.
        """
        client.login(email='testuser@sefaria.org', password='testpass123')
        mock_get_list.return_value = _TIER25_NEWSLETTERS

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.wants_marketing_emails = True
        mock_profile.learning_level = None
        mock_profile_class.return_value = mock_profile

        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {'list': '1', 'status': '1'},
                {'list': '3', 'status': '1'},
                {'list': '99', 'status': '1'},  # unmanaged — no stringid mapping
            ]
        )

        response = client.get('/api/newsletter/subscriptions')

        assert response.status_code == 200
        data = json.loads(response.content)
        assert sorted(data['subscribedNewsletters']) == ['sefaria_news', 'text_updates']
        # List 99 has no stringid mapping → excluded from response
        assert data['wantsMarketingEmails'] is True

    @mock.patch('api.newsletter_service.UserProfile')
    @mock.patch('api.newsletter_service._make_ac_request')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_wants_marketing_emails_false_propagates(self, mock_get_list, mock_ac_request,
                                                      mock_profile_class, client, test_user):
        """
        UserProfile.wants_marketing_emails=False in MongoDB propagates
        through service → view → HTTP response.
        """
        client.login(email='testuser@sefaria.org', password='testpass123')
        mock_get_list.return_value = _TIER25_NEWSLETTERS

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.wants_marketing_emails = False
        mock_profile.learning_level = None
        mock_profile_class.return_value = mock_profile

        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {'list': '1', 'status': '1'},
            ]
        )

        response = client.get('/api/newsletter/subscriptions')

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['wantsMarketingEmails'] is False
        assert data['subscribedNewsletters'] == ['sefaria_news']

    @mock.patch('api.newsletter_service.get_contact_learning_level')
    @mock.patch('api.newsletter_service.UserProfile')
    @mock.patch('api.newsletter_service._make_ac_request')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_learning_level_propagates_from_ac(self, mock_get_list, mock_ac_request,
                                                mock_profile_class, mock_get_ll,
                                                client, test_user):
        """
        Learning level from AC propagates through service → view → HTTP response.
        """
        client.login(email='testuser@sefaria.org', password='testpass123')
        mock_get_list.return_value = _TIER25_NEWSLETTERS

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.wants_marketing_emails = True
        mock_profile.learning_level = None
        mock_profile_class.return_value = mock_profile

        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {'list': '1', 'status': '1'},
            ]
        )
        mock_get_ll.return_value = 4

        response = client.get('/api/newsletter/subscriptions')

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['learningLevel'] == 4
        assert data['subscribedNewsletters'] == ['sefaria_news']
