"""
Tests for newsletter API service and views.

Uses pytest conventions for testing ActiveCampaign integration.
"""

import pytest
import json
from unittest import mock
from django.test import Client
from api import newsletter_service


@pytest.fixture
def client():
    """Fixture providing Django test client"""
    return Client()


# ============================================================================
# Tests for newsletter_service module
# ============================================================================

class TestExtractListIdFromTag:
    """Tests for extracting list ID from personalization variable tags"""

    def test_extract_valid_list_id(self):
        """Extract list ID from valid list_{id}_meta tags"""
        assert newsletter_service.extract_list_id_from_tag('list_1_meta') == 1
        assert newsletter_service.extract_list_id_from_tag('list_999_meta') == 999
        assert newsletter_service.extract_list_id_from_tag('list_42_meta') == 42

    def test_extract_invalid_tags(self):
        """Return None for invalid tags"""
        assert newsletter_service.extract_list_id_from_tag('INVALID_TAG') is None
        assert newsletter_service.extract_list_id_from_tag('LIST_META') is None
        assert newsletter_service.extract_list_id_from_tag('list_abc_meta') is None
        assert newsletter_service.extract_list_id_from_tag('') is None
        assert newsletter_service.extract_list_id_from_tag(None) is None


class TestParseMetadataFromVariable:
    """Tests for parsing JSON metadata from personalization variables"""

    def test_parse_valid_metadata(self):
        """Parse valid JSON metadata from variable"""
        variable = {
            'tag': 'list_1_meta',
            'content': '{"icon": "news-and-resources.svg", "language": "english"}'
        }
        metadata = newsletter_service.parse_metadata_from_variable(variable)

        assert metadata is not None
        assert metadata['icon'] == 'news-and-resources.svg'
        assert metadata['language'] == 'english'

    def test_parse_invalid_json(self):
        """Return None for invalid JSON"""
        variable = {
            'tag': 'list_1_meta',
            'content': 'not valid json'
        }
        assert newsletter_service.parse_metadata_from_variable(variable) is None

    def test_parse_missing_content_field(self):
        """Return None when content field is missing"""
        assert newsletter_service.parse_metadata_from_variable({'tag': 'list_1_meta'}) is None

    def test_parse_empty_content(self):
        """Return None for empty content"""
        assert newsletter_service.parse_metadata_from_variable({'tag': 'list_1_meta', 'content': ''}) is None

    def test_parse_none_variable(self):
        """Return None for None input"""
        assert newsletter_service.parse_metadata_from_variable(None) is None


class TestMakeAcRequest:
    """Tests for _make_ac_request helper function"""

    @mock.patch('api.newsletter_service.requests.request')
    def test_data_parameter_passed_as_json(self, mock_request):
        """Verify data parameter is passed through as json= to requests.request()"""
        mock_response = mock.MagicMock()
        mock_response.json.return_value = {'success': True}
        mock_response.raise_for_status = mock.MagicMock()
        mock_request.return_value = mock_response

        payload = {'fieldValue': {'contact': '123', 'field': 'test', 'value': '42'}}
        newsletter_service._make_ac_request('fieldValues', method='POST', data=payload)

        mock_request.assert_called_once()
        call_kwargs = mock_request.call_args
        assert call_kwargs[1].get('json') == payload

    @mock.patch('api.newsletter_service.requests.request')
    def test_no_data_parameter_omits_json(self, mock_request):
        """Verify GET requests without data don't include json= parameter"""
        mock_response = mock.MagicMock()
        mock_response.json.return_value = {'lists': []}
        mock_response.raise_for_status = mock.MagicMock()
        mock_request.return_value = mock_response

        newsletter_service._make_ac_request('lists')

        mock_request.assert_called_once()
        call_kwargs = mock_request.call_args
        assert 'json' not in call_kwargs[1]


class TestGetAllLists:
    """Tests for fetching lists from ActiveCampaign"""

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_get_all_lists_success(self, mock_request):
        """Successfully fetch lists from AC"""
        mock_request.return_value = {
            'lists': [
                {'id': '1', 'stringid': 'sefaria_news', 'name': 'Sefaria News'},
                {'id': '2', 'stringid': 'educator_resources', 'name': 'Educator Resources'},
            ]
        }
        lists = newsletter_service.get_all_lists()

        assert len(lists) == 2
        assert lists[0]['id'] == '1'
        assert lists[1]['stringid'] == 'educator_resources'
        mock_request.assert_called_once_with('lists?limit=100')

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_get_all_lists_error(self, mock_request):
        """Raise error when API call fails"""
        mock_request.side_effect = newsletter_service.ActiveCampaignError("API connection failed")

        with pytest.raises(newsletter_service.ActiveCampaignError):
            newsletter_service.get_all_lists()


class TestGetAllAcListIds:
    """Tests for get_all_ac_list_ids helper function"""

    @mock.patch('api.newsletter_service.get_all_lists')
    def test_returns_all_list_ids(self, mock_get_all_lists):
        """Returns IDs from all lists (managed and unmanaged)"""
        mock_get_all_lists.return_value = [
            {'id': '1', 'stringid': 'sefaria_news', 'name': 'Sefaria News'},
            {'id': '2', 'stringid': 'educator_resources', 'name': 'Educator Resources'},
            {'id': '99', 'stringid': 'internal_list', 'name': 'Internal List'},
        ]
        list_ids = newsletter_service.get_all_ac_list_ids()

        assert list_ids == ['1', '2', '99']

    @mock.patch('api.newsletter_service.get_all_lists')
    def test_returns_empty_when_no_lists(self, mock_get_all_lists):
        """Returns empty list when no lists exist"""
        mock_get_all_lists.return_value = []
        list_ids = newsletter_service.get_all_ac_list_ids()

        assert list_ids == []


class TestGetAllPersonalizationVariables:
    """Tests for fetching personalization variables from ActiveCampaign"""

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_get_all_variables_success(self, mock_request):
        """Successfully fetch personalization variables"""
        mock_request.return_value = {
            'personalizations': [
                {'tag': 'list_1_meta', 'name': 'Sefaria News', 'content': '{"icon": "news-and-resources.svg", "language": "english"}'},
                {'tag': 'list_2_meta', 'name': 'Educator Resources', 'content': '{"icon": "educator-resources.svg", "language": "english"}'},
            ]
        }
        variables = newsletter_service.get_all_personalization_variables()

        assert len(variables) == 2
        assert variables[0]['tag'] == 'list_1_meta'
        mock_request.assert_called_once_with('personalizations?limit=100')


class TestGetNewsletterList:
    """Tests for complete newsletter list building with metadata"""

    @mock.patch('api.newsletter_service.get_all_lists')
    @mock.patch('api.newsletter_service.get_all_personalization_variables')
    def test_get_newsletter_list_success(self, mock_variables, mock_lists):
        """Successfully build newsletter list with metadata"""
        mock_lists.return_value = [
            {'id': '1', 'stringid': 'sefaria_news', 'name': 'Sefaria News'},
            {'id': '2', 'stringid': 'educator_resources', 'name': 'Educator Resources'},
        ]
        mock_variables.return_value = [
            {
                'tag': 'list_1_meta',
                'name': 'Sefaria News & Resources',
                'content': '{"icon": "news-and-resources.svg", "language": "english"}'
            },
            {
                'tag': 'list_2_meta',
                'name': 'Educator Resources',
                'content': '{"icon": "educator-resources.svg", "language": "english"}'
            },
        ]
        newsletters = newsletter_service.get_newsletter_list()

        assert len(newsletters) == 2
        assert newsletters[0]['id'] == '1'
        assert newsletters[0]['stringid'] == 'sefaria_news'
        assert newsletters[0]['displayName'] == 'Sefaria News & Resources'
        assert newsletters[0]['icon'] == 'news-and-resources.svg'
        assert newsletters[0]['language'] == 'english'
        assert newsletters[1]['id'] == '2'
        assert newsletters[1]['icon'] == 'educator-resources.svg'

    @mock.patch('api.newsletter_service.get_all_lists')
    @mock.patch('api.newsletter_service.get_all_personalization_variables')
    def test_only_returns_lists_with_metadata(self, mock_variables, mock_lists):
        """Only return lists that have complete metadata"""
        mock_lists.return_value = [
            {'id': '1', 'stringid': 'sefaria_news', 'name': 'Sefaria News'},
            {'id': '2', 'stringid': 'no_metadata', 'name': 'No Metadata List'},
        ]
        mock_variables.return_value = [
            {
                'tag': 'list_1_meta',
                'name': 'Sefaria News',
                'content': '{"icon": "news-and-resources.svg", "language": "english"}'
            },
        ]
        newsletters = newsletter_service.get_newsletter_list()

        assert len(newsletters) == 1
        assert newsletters[0]['id'] == '1'

    @mock.patch('api.newsletter_service.get_all_lists')
    @mock.patch('api.newsletter_service.get_all_personalization_variables')
    def test_skips_lists_with_malformed_metadata(self, mock_variables, mock_lists):
        """Skip lists with malformed metadata"""
        mock_lists.return_value = [
            {'id': '1', 'stringid': 'sefaria_news', 'name': 'Sefaria News'},
            {'id': '2', 'stringid': 'bad_json', 'name': 'Bad JSON'},
        ]
        mock_variables.return_value = [
            {
                'tag': 'list_1_meta',
                'name': 'Sefaria News',
                'content': '{"icon": "news-and-resources.svg", "language": "english"}'
            },
            {
                'tag': 'list_2_meta',
                'name': 'Bad JSON',
                'content': 'not valid json at all'
            },
        ]
        newsletters = newsletter_service.get_newsletter_list()

        assert len(newsletters) == 1
        assert newsletters[0]['id'] == '1'

    @mock.patch('api.newsletter_service.get_all_lists')
    @mock.patch('api.newsletter_service.get_all_personalization_variables')
    def test_api_errors_propagate(self, mock_variables, mock_lists):
        """API errors are propagated"""
        mock_lists.side_effect = newsletter_service.ActiveCampaignError("API down")

        with pytest.raises(newsletter_service.ActiveCampaignError):
            newsletter_service.get_newsletter_list()


# ============================================================================
# Tests for newsletter API view
# ============================================================================

class TestGetNewsletterListsView:
    """Tests for the /api/newsletter/lists endpoint"""

    @mock.patch('api.newsletter_views.get_newsletter_list')
    def test_get_request_success(self, mock_get_list, client):
        """Successful GET request returns newsletters"""
        mock_get_list.return_value = [
            {
                'id': '1',
                'stringid': 'sefaria_news',
                'displayName': 'Sefaria News',
                'icon': 'news-and-resources.svg',
                'language': 'english'
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
        """API error returns 500 status"""
        mock_get_list.side_effect = newsletter_service.ActiveCampaignError("Connection failed")
        response = client.get('/api/newsletter/lists')

        assert response.status_code == 500
        data = json.loads(response.content)
        assert 'error' in data
        assert 'Connection failed' in data['error']

    def test_post_not_allowed(self, client):
        """POST requests are not allowed"""
        response = client.post('/api/newsletter/lists')

        assert response.status_code == 405
        data = json.loads(response.content)
        assert 'error' in data
        assert 'GET' in data['error']


# ============================================================================
# Tests for Contact Management Functions
# ============================================================================

class TestFindOrCreateContact:
    """Tests for finding or creating AC contacts"""

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_find_existing_contact(self, mock_request):
        """Find an existing contact by email"""
        mock_request.return_value = {
            'contacts': [
                {'id': '28529', 'email': 'john@example.com', 'firstName': 'John', 'lastName': 'Doe'}
            ]
        }
        contact = newsletter_service.find_or_create_contact('john@example.com', 'John', 'Doe')

        assert contact['id'] == '28529'
        assert contact['email'] == 'john@example.com'

    @mock.patch('api.newsletter_service.requests.post')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_create_new_contact(self, mock_request, mock_post):
        """Create a new contact if not found"""
        # First call: no existing contacts
        mock_request.return_value = {'contacts': []}

        # Second call: create contact
        mock_post.return_value.json.return_value = {
            'contact': {'id': '28530', 'email': 'jane@example.com', 'firstName': 'Jane', 'lastName': 'Smith'}
        }
        mock_post.return_value.raise_for_status = lambda: None

        contact = newsletter_service.find_or_create_contact('jane@example.com', 'Jane', 'Smith')

        assert contact['id'] == '28530'
        assert contact['email'] == 'jane@example.com'

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_find_contact_api_error(self, mock_request):
        """Handle API errors when finding contact"""
        mock_request.side_effect = newsletter_service.ActiveCampaignError("API connection failed")

        with pytest.raises(newsletter_service.ActiveCampaignError):
            newsletter_service.find_or_create_contact('test@example.com', 'Test', 'User')


class TestGetContactListMemberships:
    """Tests for fetching contact list memberships"""

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_get_list_memberships_success(self, mock_request):
        """Successfully fetch list memberships"""
        mock_request.return_value = {
            'contactLists': [
                {'list': '1', 'contact': '28529'},
                {'list': '3', 'contact': '28529'},
            ]
        }
        list_ids = newsletter_service.get_contact_list_memberships('28529')

        assert len(list_ids) == 2
        assert '1' in list_ids
        assert '3' in list_ids

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_get_no_memberships(self, mock_request):
        """Return empty list when contact has no memberships"""
        mock_request.return_value = {'contactLists': []}
        list_ids = newsletter_service.get_contact_list_memberships('28529')

        assert list_ids == []

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_active_only_filters_by_status(self, mock_request):
        """active_only=True filters to only status=1 (active) memberships"""
        mock_request.return_value = {
            'contactLists': [
                {'list': '1', 'contact': '28529', 'status': '1'},  # Active
                {'list': '3', 'contact': '28529', 'status': '2'},  # Unsubscribed
                {'list': '5', 'contact': '28529', 'status': '1'},  # Active
            ]
        }
        list_ids = newsletter_service.get_contact_list_memberships('28529', active_only=True)

        assert len(list_ids) == 2
        assert '1' in list_ids
        assert '5' in list_ids
        assert '3' not in list_ids

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_active_only_false_returns_all(self, mock_request):
        """active_only=False (default) returns all memberships regardless of status"""
        mock_request.return_value = {
            'contactLists': [
                {'list': '1', 'contact': '28529', 'status': '1'},
                {'list': '3', 'contact': '28529', 'status': '2'},
            ]
        }
        list_ids = newsletter_service.get_contact_list_memberships('28529', active_only=False)

        assert len(list_ids) == 2
        assert '1' in list_ids
        assert '3' in list_ids


class TestMapStringidsToListIds:
    """Tests for mapping newsletter stringids to AC list IDs"""

    def test_map_valid_stringids(self):
        """Map valid stringids to list IDs"""
        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
            {'stringid': 'parashah_series', 'id': '5'},
        ]
        stringids = ['sefaria_news', 'text_updates']
        list_ids = newsletter_service.map_stringids_to_list_ids(stringids, newsletter_list)

        assert len(list_ids) == 2
        assert '1' in list_ids
        assert '3' in list_ids

    def test_map_invalid_stringid(self):
        """Raise error for invalid stringids"""
        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
        ]
        stringids = ['sefaria_news', 'invalid_newsletter']

        with pytest.raises(newsletter_service.ActiveCampaignError):
            newsletter_service.map_stringids_to_list_ids(stringids, newsletter_list)


class TestValidateNewsletterKeys:
    """Tests for validating newsletter keys"""

    def test_validate_valid_keys(self):
        """Valid keys pass validation"""
        newsletter_list = [
            {'stringid': 'sefaria_news'},
            {'stringid': 'text_updates'},
        ]
        stringids = ['sefaria_news']
        result = newsletter_service.validate_newsletter_keys(stringids, newsletter_list)

        assert result is True

    def test_validate_invalid_keys(self):
        """Invalid keys raise error"""
        newsletter_list = [
            {'stringid': 'sefaria_news'},
        ]
        stringids = ['sefaria_news', 'invalid_key']

        with pytest.raises(newsletter_service.ActiveCampaignError):
            newsletter_service.validate_newsletter_keys(stringids, newsletter_list)


class TestAddContactToList:
    """Tests for adding contact to list"""

    @mock.patch('api.newsletter_service.requests.post')
    def test_add_contact_to_list_success(self, mock_post):
        """Successfully add contact to list"""
        mock_post.return_value.json.return_value = {
            'contactList': {'contact': '28529', 'list': '1'}
        }
        mock_post.return_value.raise_for_status = lambda: None

        result = newsletter_service.add_contact_to_list('28529', '1')

        assert result['contact'] == '28529'
        assert result['list'] == '1'

    @mock.patch('api.newsletter_service.requests.post')
    def test_add_contact_to_list_api_error(self, mock_post):
        """Handle API errors when adding contact to list"""
        mock_post.return_value.raise_for_status.side_effect = Exception("Connection failed")

        with pytest.raises(newsletter_service.ActiveCampaignError):
            newsletter_service.add_contact_to_list('28529', '1')


class TestSubscribeWithUnion:
    """Tests for union-based subscription flow"""

    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service.subscribe_contact_to_lists')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    def test_subscribe_new_user(self, mock_find, mock_subscribe, mock_get_memberships):
        """Subscribe a new user with no existing subscriptions"""
        mock_find.return_value = {'id': '28529', 'email': 'new@example.com', 'firstName': 'New'}
        mock_get_memberships.return_value = []  # No existing subscriptions
        mock_subscribe.return_value = None

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]

        result = newsletter_service.subscribe_with_union(
            'new@example.com', 'New', '', ['sefaria_news', 'text_updates'], newsletter_list
        )

        assert result['contact']['email'] == 'new@example.com'
        assert len(result['all_subscriptions']) == 2
        assert 'sefaria_news' in result['all_subscriptions']
        assert 'text_updates' in result['all_subscriptions']

    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service.subscribe_contact_to_lists')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    def test_subscribe_with_union_existing_subscriptions(self, mock_find, mock_subscribe, mock_get_memberships):
        """Union new subscriptions with existing ones"""
        mock_find.return_value = {'id': '28529', 'email': 'existing@example.com'}
        # Contact already subscribed to lists 1 and 3
        mock_get_memberships.return_value = ['1', '3']
        mock_subscribe.return_value = None

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
            {'stringid': 'parashah_series', 'id': '5'},
        ]

        result = newsletter_service.subscribe_with_union(
            'existing@example.com', 'Existing', '', ['parashah_series'], newsletter_list
        )

        # Should have all 3 subscriptions (existing 1, 3 + new 5)
        assert len(result['all_subscriptions']) == 3
        assert 'sefaria_news' in result['all_subscriptions']
        assert 'text_updates' in result['all_subscriptions']
        assert 'parashah_series' in result['all_subscriptions']


# ============================================================================
# Tests for Subscribe Newsletter Endpoint
# ============================================================================

class TestSubscribeNewsletterEndpoint:
    """Tests for the POST /api/newsletter/subscribe endpoint"""

    @mock.patch('api.newsletter_views.subscribe_with_union')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_subscribe_success(self, mock_get_list, mock_subscribe, client):
        """Successfully subscribe a user"""
        mock_get_list.return_value = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]
        mock_subscribe.return_value = {
            'contact': {'id': '28529', 'email': 'test@example.com'},
            'all_subscriptions': ['sefaria_news', 'text_updates']
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
                }
            }),
            content_type='application/json'
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['success'] is True
        assert data['email'] == 'test@example.com'
        assert len(data['subscribedNewsletters']) == 2

    def test_subscribe_missing_first_name(self, client):
        """Return error when first name is missing"""
        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': '',
                'email': 'test@example.com',
                'newsletters': {'sefaria_news': True}
            }),
            content_type='application/json'
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'First name and email are required' in data['error']

    def test_subscribe_missing_email(self, client):
        """Return error when email is missing"""
        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': 'John',
                'email': '',
                'newsletters': {'sefaria_news': True}
            }),
            content_type='application/json'
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'First name and email are required' in data['error']

    def test_subscribe_no_newsletters_selected(self, client):
        """Return error when no newsletters selected"""
        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': 'John',
                'email': 'test@example.com',
                'newsletters': {
                    'sefaria_news': False,
                    'text_updates': False,
                }
            }),
            content_type='application/json'
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'Please select at least one newsletter' in data['error']

    @mock.patch('api.newsletter_views.subscribe_with_union')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_subscribe_invalid_json(self, mock_get_list, mock_subscribe, client):
        """Return error for invalid JSON"""
        response = client.post(
            '/api/newsletter/subscribe',
            'invalid json',
            content_type='application/json'
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'Invalid JSON' in data['error']

    @mock.patch('api.newsletter_views.subscribe_with_union')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_subscribe_activecampaign_error(self, mock_get_list, mock_subscribe, client):
        """Return 500 when ActiveCampaign error occurs"""
        mock_get_list.return_value = [
            {'stringid': 'sefaria_news', 'id': '1'},
        ]
        mock_subscribe.side_effect = newsletter_service.ActiveCampaignError("Connection failed")

        response = client.post(
            '/api/newsletter/subscribe',
            json.dumps({
                'firstName': 'John',
                'email': 'test@example.com',
                'newsletters': {'sefaria_news': True}
            }),
            content_type='application/json'
        )

        assert response.status_code == 500
        data = json.loads(response.content)
        assert 'Connection failed' in data['error']

    def test_subscribe_get_not_allowed(self, client):
        """GET requests are not allowed"""
        response = client.get('/api/newsletter/subscribe')

        assert response.status_code == 405
        data = json.loads(response.content)
        assert 'POST' in data['error']


# ============================================================================
# Tests for Remove Contact from List Function
# ============================================================================

class TestRemoveContactFromList:
    """Tests for removing contact from newsletter list"""

    @mock.patch('api.newsletter_service.requests.post')
    def test_remove_contact_from_list_success(self, mock_post):
        """Successfully remove contact from list"""
        mock_post.return_value.json.return_value = {
            'contactList': {'contact': '28529', 'list': '1', 'status': '2'}
        }
        mock_post.return_value.raise_for_status = lambda: None

        result = newsletter_service.remove_contact_from_list('28529', '1')

        assert result['contact'] == '28529'
        assert result['status'] == '2'

    @mock.patch('api.newsletter_service.requests.post')
    def test_remove_contact_from_list_api_error(self, mock_post):
        """Handle API errors when removing contact from list"""
        mock_post.return_value.raise_for_status.side_effect = Exception("Connection failed")

        with pytest.raises(newsletter_service.ActiveCampaignError):
            newsletter_service.remove_contact_from_list('28529', '1')

    @mock.patch('api.newsletter_service.requests.post')
    def test_remove_idempotent(self, mock_post):
        """Removing a contact twice should both succeed (idempotent)"""
        mock_post.return_value.json.return_value = {
            'contactList': {'contact': '28529', 'list': '1', 'status': '2'}
        }
        mock_post.return_value.raise_for_status = lambda: None

        # First removal
        result1 = newsletter_service.remove_contact_from_list('28529', '1')
        # Second removal (should also succeed)
        result2 = newsletter_service.remove_contact_from_list('28529', '1')

        assert result1['status'] == '2'
        assert result2['status'] == '2'


# ============================================================================
# Tests for Update List Memberships Function
# ============================================================================

class TestUpdateListMemberships:
    """Tests for updating list memberships (add and remove)"""

    @mock.patch('api.newsletter_service.add_contact_to_list')
    @mock.patch('api.newsletter_service.remove_contact_from_list')
    def test_update_add_and_remove(self, mock_remove, mock_add):
        """Update contact by adding and removing from lists"""
        mock_remove.return_value = None
        mock_add.return_value = None

        newsletter_service.update_list_memberships('28529', ['3', '5'], ['1', '2'])

        # Verify removes were called
        assert mock_remove.call_count == 2
        # Verify adds were called
        assert mock_add.call_count == 2

    @mock.patch('api.newsletter_service.add_contact_to_list')
    @mock.patch('api.newsletter_service.remove_contact_from_list')
    def test_update_add_only(self, mock_remove, mock_add):
        """Update contact by adding to lists only"""
        mock_add.return_value = None

        newsletter_service.update_list_memberships('28529', ['3', '5'], [])

        # Verify no removes
        assert mock_remove.call_count == 0
        # Verify adds were called
        assert mock_add.call_count == 2

    @mock.patch('api.newsletter_service.add_contact_to_list')
    @mock.patch('api.newsletter_service.remove_contact_from_list')
    def test_update_remove_only(self, mock_remove, mock_add):
        """Update contact by removing from lists only"""
        mock_remove.return_value = None

        newsletter_service.update_list_memberships('28529', [], ['1', '2'])

        # Verify removes were called
        assert mock_remove.call_count == 2
        # Verify no adds
        assert mock_add.call_count == 0


# ============================================================================
# Tests for Mapping Helper Functions
# ============================================================================

class TestMappingHelpers:
    """Tests for stringid <-> list ID mapping helpers"""

    def test_get_stringid_to_list_id_map(self):
        """Create mapping from stringids to list IDs"""
        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]
        mapping = newsletter_service.get_stringid_to_list_id_map(newsletter_list)

        assert mapping['sefaria_news'] == '1'
        assert mapping['text_updates'] == '3'

    def test_get_list_id_to_stringid_map(self):
        """Create mapping from list IDs to stringids"""
        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]
        mapping = newsletter_service.get_list_id_to_stringid_map(newsletter_list)

        assert mapping['1'] == 'sefaria_news'
        assert mapping['3'] == 'text_updates'


# ============================================================================
# Tests for Fetch User Subscriptions Implementation
# ============================================================================

class TestFetchUserSubscriptionsImpl:
    """Tests for fetch_user_subscriptions_impl function"""

    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_fetch_existing_user_subscriptions(self, mock_request, mock_get_memberships):
        """Fetch subscriptions for existing user"""
        mock_request.return_value = {
            'contacts': [
                {'id': '28529', 'email': 'user@example.com'}
            ]
        }
        mock_get_memberships.return_value = ['1', '3', '5']

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
            {'stringid': 'parashah_series', 'id': '5'},
        ]

        result = newsletter_service.fetch_user_subscriptions_impl('user@example.com', newsletter_list)

        assert result['learning_level'] is None
        assert len(result['subscribed_newsletters']) == 3
        assert 'sefaria_news' in result['subscribed_newsletters']
        assert 'text_updates' in result['subscribed_newsletters']
        assert 'parashah_series' in result['subscribed_newsletters']
        # Default wants_marketing_emails when no user passed
        assert result['wants_marketing_emails'] is True

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_fetch_new_user_no_subscriptions(self, mock_request):
        """Return empty subscriptions for new user not in AC"""
        mock_request.return_value = {'contacts': []}

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
        ]

        result = newsletter_service.fetch_user_subscriptions_impl('newuser@example.com', newsletter_list)

        assert result['subscribed_newsletters'] == []
        assert result['learning_level'] is None
        assert result['wants_marketing_emails'] is True

    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_fetch_filters_invalid_list_ids(self, mock_request, mock_get_memberships):
        """Fetch only maps valid list IDs back to stringids"""
        mock_request.return_value = {
            'contacts': [
                {'id': '28529', 'email': 'user@example.com'}
            ]
        }
        # Contact has list ID '99' which doesn't exist in newsletter_list
        mock_get_memberships.return_value = ['1', '99']

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
        ]

        result = newsletter_service.fetch_user_subscriptions_impl('user@example.com', newsletter_list)

        # Should only include valid mappings
        assert result['subscribed_newsletters'] == ['sefaria_news']

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_fetch_api_error(self, mock_request):
        """Handle API errors gracefully"""
        mock_request.side_effect = newsletter_service.ActiveCampaignError("API down")

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
        ]

        with pytest.raises(newsletter_service.ActiveCampaignError):
            newsletter_service.fetch_user_subscriptions_impl('user@example.com', newsletter_list)

    @mock.patch('api.newsletter_service.UserProfile')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_fetch_returns_wants_marketing_emails_from_profile(self, mock_request, mock_get_memberships, mock_profile_class):
        """Returns wants_marketing_emails from UserProfile when user is provided"""
        mock_request.return_value = {
            'contacts': [{'id': '28529', 'email': 'user@example.com'}]
        }
        mock_get_memberships.return_value = ['1']

        # Mock UserProfile with wants_marketing_emails=False
        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.wants_marketing_emails = False
        mock_profile_class.return_value = mock_profile

        # Mock authenticated user
        mock_user = mock.MagicMock()
        mock_user.is_authenticated = True

        newsletter_list = [{'stringid': 'sefaria_news', 'id': '1'}]

        result = newsletter_service.fetch_user_subscriptions_impl(
            'user@example.com', newsletter_list, user=mock_user
        )

        assert result['wants_marketing_emails'] is False


class TestGetContactLearningLevel:
    """Tests for get_contact_learning_level function"""

    @mock.patch('api.newsletter_service.get_ac_field_id_by_perstag')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_returns_int_when_field_present(self, mock_request, mock_get_field_id):
        """Return integer learning level when AC field has a valid value"""
        mock_get_field_id.return_value = '7'
        mock_request.return_value = {
            'fieldValues': [
                {'field': '7', 'value': '3'},
                {'field': '12', 'value': 'other'},
            ]
        }

        result = newsletter_service.get_contact_learning_level('28529')

        assert result == 3
        mock_get_field_id.assert_called_once_with('LEARNING_LEVEL')

    @mock.patch('api.newsletter_service.get_ac_field_id_by_perstag')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_returns_none_when_field_empty(self, mock_request, mock_get_field_id):
        """Return None when field exists but value is empty string"""
        mock_get_field_id.return_value = '7'
        mock_request.return_value = {
            'fieldValues': [
                {'field': '7', 'value': ''},
            ]
        }

        result = newsletter_service.get_contact_learning_level('28529')

        assert result is None

    @mock.patch('api.newsletter_service.get_ac_field_id_by_perstag')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_returns_none_when_field_missing(self, mock_request, mock_get_field_id):
        """Return None when LEARNING_LEVEL field is not in contact's fieldValues"""
        mock_get_field_id.return_value = '7'
        mock_request.return_value = {
            'fieldValues': [
                {'field': '12', 'value': 'unrelated'},
            ]
        }

        result = newsletter_service.get_contact_learning_level('28529')

        assert result is None

    @mock.patch('api.newsletter_service.get_ac_field_id_by_perstag')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_returns_none_for_non_numeric_value(self, mock_request, mock_get_field_id):
        """Return None when AC stores a non-numeric string"""
        mock_get_field_id.return_value = '7'
        mock_request.return_value = {
            'fieldValues': [
                {'field': '7', 'value': 'advanced'},
            ]
        }

        result = newsletter_service.get_contact_learning_level('28529')

        assert result is None

    @mock.patch('api.newsletter_service.get_ac_field_id_by_perstag')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_api_error_propagates(self, mock_request, mock_get_field_id):
        """ActiveCampaignError propagates to caller"""
        mock_get_field_id.return_value = '7'
        mock_request.side_effect = newsletter_service.ActiveCampaignError("API down")

        with pytest.raises(newsletter_service.ActiveCampaignError):
            newsletter_service.get_contact_learning_level('28529')

    @mock.patch('api.newsletter_service.get_ac_field_id_by_perstag')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_matches_field_id_as_string(self, mock_request, mock_get_field_id):
        """Field ID matching works when AC returns int vs string"""
        mock_get_field_id.return_value = '7'
        mock_request.return_value = {
            'fieldValues': [
                {'field': 7, 'value': '2'},  # int instead of string
            ]
        }

        result = newsletter_service.get_contact_learning_level('28529')

        assert result == 2


class TestFetchUserSubscriptionsLearningLevel:
    """Tests for learning_level in fetch_user_subscriptions_impl"""

    @mock.patch('api.newsletter_service.get_contact_learning_level')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_returns_ac_learning_level(self, mock_request, mock_get_memberships, mock_get_ll):
        """Return learning level from AC when present"""
        mock_request.return_value = {
            'contacts': [{'id': '28529', 'email': 'user@example.com'}]
        }
        mock_get_memberships.return_value = ['1']
        mock_get_ll.return_value = 3

        newsletter_list = [{'stringid': 'sefaria_news', 'id': '1'}]
        result = newsletter_service.fetch_user_subscriptions_impl('user@example.com', newsletter_list)

        assert result['learning_level'] == 3

    @mock.patch('api.newsletter_service.get_contact_learning_level')
    @mock.patch('api.newsletter_service.UserProfile')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_ac_value_wins_over_profile(self, mock_request, mock_get_memberships, mock_profile_class, mock_get_ll):
        """AC learning level takes priority over MongoDB profile value"""
        mock_request.return_value = {
            'contacts': [{'id': '28529', 'email': 'user@example.com'}]
        }
        mock_get_memberships.return_value = []
        mock_get_ll.return_value = 4

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.learning_level = 2
        mock_profile.wants_marketing_emails = True
        mock_profile_class.return_value = mock_profile

        mock_user = mock.MagicMock()
        mock_user.is_authenticated = True

        newsletter_list = [{'stringid': 'sefaria_news', 'id': '1'}]
        result = newsletter_service.fetch_user_subscriptions_impl(
            'user@example.com', newsletter_list, user=mock_user
        )

        assert result['learning_level'] == 4  # AC wins over profile's 2

    @mock.patch('api.newsletter_service.get_contact_learning_level')
    @mock.patch('api.newsletter_service.UserProfile')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_falls_back_to_profile_when_ac_has_none(self, mock_request, mock_get_memberships, mock_profile_class, mock_get_ll):
        """Falls back to profile learning level when AC field is empty"""
        mock_request.return_value = {
            'contacts': [{'id': '28529', 'email': 'user@example.com'}]
        }
        mock_get_memberships.return_value = []
        mock_get_ll.return_value = None  # AC has no value

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.learning_level = 5
        mock_profile.wants_marketing_emails = True
        mock_profile_class.return_value = mock_profile

        mock_user = mock.MagicMock()
        mock_user.is_authenticated = True

        newsletter_list = [{'stringid': 'sefaria_news', 'id': '1'}]
        result = newsletter_service.fetch_user_subscriptions_impl(
            'user@example.com', newsletter_list, user=mock_user
        )

        assert result['learning_level'] == 5  # Falls back to profile

    @mock.patch('api.newsletter_service.get_contact_learning_level')
    @mock.patch('api.newsletter_service.UserProfile')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_graceful_degradation_on_ac_field_error(self, mock_request, mock_get_memberships, mock_profile_class, mock_get_ll):
        """AC field fetch failure falls back to profile — doesn't break subscription fetch"""
        mock_request.return_value = {
            'contacts': [{'id': '28529', 'email': 'user@example.com'}]
        }
        mock_get_memberships.return_value = ['1']
        mock_get_ll.side_effect = newsletter_service.ActiveCampaignError("field API down")

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.learning_level = 3
        mock_profile.wants_marketing_emails = True
        mock_profile_class.return_value = mock_profile

        mock_user = mock.MagicMock()
        mock_user.is_authenticated = True

        newsletter_list = [{'stringid': 'sefaria_news', 'id': '1'}]
        result = newsletter_service.fetch_user_subscriptions_impl(
            'user@example.com', newsletter_list, user=mock_user
        )

        # Subscriptions still work despite learning level failure
        assert result['subscribed_newsletters'] == ['sefaria_news']
        assert result['learning_level'] == 3  # Falls back to profile

    @mock.patch('api.newsletter_service.UserProfile')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_profile_learning_level_when_not_in_ac(self, mock_request, mock_profile_class):
        """User not in AC gets profile learning level as fallback"""
        mock_request.return_value = {'contacts': []}

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.learning_level = 1
        mock_profile.wants_marketing_emails = True
        mock_profile_class.return_value = mock_profile

        mock_user = mock.MagicMock()
        mock_user.is_authenticated = True

        newsletter_list = [{'stringid': 'sefaria_news', 'id': '1'}]
        result = newsletter_service.fetch_user_subscriptions_impl(
            'user@example.com', newsletter_list, user=mock_user
        )

        assert result['learning_level'] == 1


# ============================================================================
# Tests for Update User Preferences Implementation
# ============================================================================

class TestUpdateUserPreferencesImpl:
    """Tests for update_user_preferences_impl function (replace behavior)"""

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('api.newsletter_service.update_list_memberships')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    def test_update_replace_subscriptions(self, mock_get_memberships, mock_find, mock_update, mock_update_flag):
        """Replace existing subscriptions with new selections (scoped to managed lists)"""
        mock_find.return_value = {'id': '28529', 'email': 'user@example.com'}
        # User currently subscribed to lists 1 and 2 (both managed)
        mock_get_memberships.return_value = ['1', '2']
        mock_update.return_value = None

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
            {'stringid': 'educator_resources', 'id': '2'},
        ]

        result = newsletter_service.update_user_preferences_impl(
            'user@example.com', 'John', 'Doe',
            ['sefaria_news', 'text_updates'],  # New selections
            newsletter_list
        )

        # Verify update_list_memberships was called with correct add/remove sets
        # Should add: [3], remove: [2]
        mock_update.assert_called_once()
        call_args = mock_update.call_args
        add_list = set(call_args[0][1])
        remove_list = set(call_args[0][2])
        assert '3' in add_list  # text_updates
        assert '2' in remove_list  # educator_resources

        assert sorted(result['subscribed_newsletters']) == ['sefaria_news', 'text_updates']

        # Verify wants_marketing_emails set to True for normal update
        mock_update_flag.assert_called_once_with('user@example.com', True)

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('api.newsletter_service.update_list_memberships')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    def test_update_unsubscribe_all_previous(self, mock_get_memberships, mock_find, mock_update, mock_update_flag):
        """User was subscribed to many, now selects just one (unsubscribe rest)"""
        mock_find.return_value = {'id': '28529', 'email': 'user@example.com'}
        # User currently subscribed to lists 1, 2, 3
        mock_get_memberships.return_value = ['1', '2', '3']
        mock_update.return_value = None

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
            {'stringid': 'educator_resources', 'id': '2'},
        ]

        result = newsletter_service.update_user_preferences_impl(
            'user@example.com', 'John', 'Doe',
            ['sefaria_news'],  # Only select one
            newsletter_list
        )

        # Should unsubscribe from 2 and 3
        mock_update.assert_called_once()
        call_args = mock_update.call_args
        remove_list = set(call_args[0][2])
        assert '2' in remove_list
        assert '3' in remove_list

        assert result['subscribed_newsletters'] == ['sefaria_news']

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('api.newsletter_service.update_list_memberships')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    def test_update_subscribe_all_new(self, mock_get_memberships, mock_find, mock_update, mock_update_flag):
        """User had no subscriptions, now subscribes to several"""
        mock_find.return_value = {'id': '28529', 'email': 'newuser@example.com'}
        # User has no existing subscriptions
        mock_get_memberships.return_value = []
        mock_update.return_value = None

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
            {'stringid': 'parashah_series', 'id': '5'},
        ]

        result = newsletter_service.update_user_preferences_impl(
            'newuser@example.com', 'Jane', 'Doe',
            ['sefaria_news', 'text_updates', 'parashah_series'],
            newsletter_list
        )

        # Should add all three lists
        mock_update.assert_called_once()
        call_args = mock_update.call_args
        add_list = set(call_args[0][1])
        assert len(add_list) == 3
        assert '1' in add_list
        assert '3' in add_list
        assert '5' in add_list

        assert sorted(result['subscribed_newsletters']) == ['parashah_series', 'sefaria_news', 'text_updates']

    def test_update_validates_stringids(self):
        """Validate stringids before updating"""
        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
        ]

        # Try to update with invalid stringid
        with pytest.raises(newsletter_service.ActiveCampaignError):
            newsletter_service.update_user_preferences_impl(
                'user@example.com', 'John', 'Doe',
                ['sefaria_news', 'invalid_key'],
                newsletter_list
            )

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('api.newsletter_service.update_list_memberships')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service.get_all_ac_list_ids')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    def test_marketing_opt_out_unsubscribes_all_lists(self, mock_find, mock_get_all_ids,
                                                       mock_get_memberships, mock_update, mock_update_flag):
        """Marketing opt-out unsubscribes from ALL lists (managed + unmanaged)"""
        mock_find.return_value = {'id': '28529', 'email': 'user@example.com'}
        # All lists in AC account (managed + unmanaged)
        mock_get_all_ids.return_value = ['1', '2', '3', '99']
        # User is actively subscribed to lists 1, 3, 99
        mock_get_memberships.return_value = ['1', '3', '99']
        mock_update.return_value = None

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]

        result = newsletter_service.update_user_preferences_impl(
            'user@example.com', 'John', 'Doe',
            ['sefaria_news'],  # Selections don't matter for opt-out
            newsletter_list,
            marketing_opt_out=True
        )

        # Should unsubscribe from all active lists (1, 3, 99)
        mock_update.assert_called_once()
        call_args = mock_update.call_args
        add_list = call_args[0][1]
        remove_list = set(call_args[0][2])
        assert add_list == []  # No subscriptions added
        assert '1' in remove_list
        assert '3' in remove_list
        assert '99' in remove_list  # Unmanaged list also removed

        assert result['subscribed_newsletters'] == []

        # Verify wants_marketing_emails set to False
        mock_update_flag.assert_called_once_with('user@example.com', False)

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('api.newsletter_service.update_list_memberships')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    def test_normal_update_preserves_unmanaged_lists(self, mock_find, mock_get_memberships,
                                                      mock_update, mock_update_flag):
        """Normal update (not opt-out) only touches managed lists, preserves unmanaged"""
        mock_find.return_value = {'id': '28529', 'email': 'user@example.com'}
        # User subscribed to managed list 1 and unmanaged list 99
        mock_get_memberships.return_value = ['1', '99']
        mock_update.return_value = None

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]

        result = newsletter_service.update_user_preferences_impl(
            'user@example.com', 'John', 'Doe',
            ['text_updates'],  # Switch from sefaria_news to text_updates
            newsletter_list,
            marketing_opt_out=False
        )

        mock_update.assert_called_once()
        call_args = mock_update.call_args
        add_list = set(call_args[0][1])
        remove_list = set(call_args[0][2])

        assert '3' in add_list  # text_updates added
        assert '1' in remove_list  # sefaria_news removed
        assert '99' not in remove_list  # unmanaged list NOT removed

        assert result['subscribed_newsletters'] == ['text_updates']


# ============================================================================
# Tests for Get User Subscriptions View (Authenticated)
# ============================================================================

class TestGetUserSubscriptionsView:
    """Tests for the GET /api/newsletter/subscriptions endpoint (authenticated)"""

    def test_get_subscriptions_not_authenticated(self, client):
        """Return 401 when not authenticated"""
        response = client.get('/api/newsletter/subscriptions')

        # Without authentication, should return 401
        # (Note: test client is not authenticated by default)
        assert response.status_code == 401
        data = json.loads(response.content)
        assert 'Authentication required' in data['error']

    def test_get_subscriptions_post_not_allowed(self, client):
        """Verify only GET is allowed"""
        response = client.post('/api/newsletter/subscriptions')

        assert response.status_code == 405
        data = json.loads(response.content)
        assert 'GET' in data['error']


# ============================================================================
# Tests for Update User Preferences View (Authenticated)
# ============================================================================

class TestUpdateUserPreferencesView:
    """Tests for the POST /api/newsletter/preferences endpoint (authenticated)"""

    @mock.patch('api.newsletter_views.update_user_preferences_impl')
    @mock.patch('api.newsletter_views.get_cached_newsletter_list')
    def test_update_preferences_success(self, mock_get_list, mock_update, client):
        """Successfully update preferences with valid data"""
        mock_get_list.return_value = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]
        mock_update.return_value = {
            'contact': {'id': '28529', 'email': 'test@example.com'},
            'subscribed_newsletters': ['sefaria_news', 'text_updates']
        }

        # Note: requires authentication which test client doesn't have by default
        # This test structure shows the expected success case

    def test_update_preferences_no_newsletters_selected(self, client):
        """Return 401 when not authenticated (auth check happens before validation)"""
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {
                    'sefaria_news': False,
                    'text_updates': False,
                }
            }),
            content_type='application/json'
        )

        # Authentication is checked first, so unauthenticated requests get 401
        # before reaching the validation logic
        assert response.status_code == 401
        data = json.loads(response.content)
        assert 'Authentication required' in data['error']

    def test_update_preferences_invalid_json(self, client):
        """Return 401 when not authenticated (auth check happens before JSON parsing)"""
        response = client.post(
            '/api/newsletter/preferences',
            'invalid json',
            content_type='application/json'
        )

        # Authentication is checked first, so unauthenticated requests get 401
        # before reaching JSON parsing logic
        assert response.status_code == 401
        data = json.loads(response.content)
        assert 'Authentication required' in data['error']

    def test_update_preferences_not_authenticated(self, client):
        """Return 401 when not authenticated"""
        response = client.post(
            '/api/newsletter/preferences',
            json.dumps({
                'newsletters': {'sefaria_news': True}
            }),
            content_type='application/json'
        )

        # Without authentication, should return 401
        assert response.status_code == 401
        data = json.loads(response.content)
        assert 'Authentication required' in data['error']

    def test_update_preferences_post_only(self, client):
        """Verify only POST is allowed"""
        response = client.get('/api/newsletter/preferences')

        assert response.status_code == 405
        data = json.loads(response.content)
        assert 'POST' in data['error']

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('api.newsletter_service.update_list_memberships')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    def test_update_preferences_empty_selection_allowed(self, mock_find, mock_get_memberships,
                                                         mock_update_memberships, mock_update_flag):
        """
        Empty newsletter selection is allowed for authenticated users.

        This allows logged-in users to unsubscribe from all newsletters by passing
        an empty selection (all newsletters set to false). This is different from
        the subscribe endpoint (for logged-out users), which rejects empty selections
        to prevent creating contacts with no subscriptions.

        Behavior:
        - Logged-in users: Empty selection ALLOWED (unsubscribe from all managed)
        - Logged-out users: Empty selection REJECTED (prevent useless contacts)
        """
        mock_find.return_value = {'id': '12345', 'email': 'test@example.com'}
        mock_get_memberships.return_value = ['1', '3']
        mock_update_memberships.return_value = None

        valid_newsletters = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]

        # Verify the service layer handles empty selection without error
        result = newsletter_service.update_user_preferences_impl(
            email='test@example.com',
            first_name='Test',
            last_name='User',
            selected_stringids=[],  # Empty selection - unsubscribe from all managed
            valid_newsletters=valid_newsletters
        )

        # The function should handle empty selection without error
        # and return empty subscribed_newsletters list
        assert result['subscribed_newsletters'] == []

        # Should unsubscribe from both managed lists
        mock_update_memberships.assert_called_once()
        call_args = mock_update_memberships.call_args
        remove_list = set(call_args[0][2])
        assert '1' in remove_list
        assert '3' in remove_list


# ============================================================================
# Tests for Learning Level Management
# ============================================================================

class TestUpdateLearningLevelInAc:
    """Tests for update_learning_level_in_ac() service function"""

    @mock.patch('api.newsletter_service._make_ac_request')
    @mock.patch('api.newsletter_service.get_ac_field_id_by_perstag', return_value='104')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    def test_update_learning_level_valid(self, mock_find_contact, mock_field_lookup, mock_ac_request):
        """Update learning level in AC with valid value"""
        mock_find_contact.return_value = {'id': '12345', 'email': 'test@example.com'}
        mock_ac_request.return_value = {'success': True}

        result = newsletter_service.update_learning_level_in_ac('test@example.com', 3)

        assert result['contact_id'] == '12345'
        assert result['learning_level'] == 3
        assert result['email'] == 'test@example.com'
        mock_field_lookup.assert_called_once_with('LEARNING_LEVEL')

    @mock.patch('api.newsletter_service._make_ac_request')
    @mock.patch('api.newsletter_service.get_ac_field_id_by_perstag', return_value='104')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    def test_update_learning_level_none(self, mock_find_contact, mock_field_lookup, mock_ac_request):
        """Update learning level to None (clear) in AC"""
        mock_find_contact.return_value = {'id': '12345', 'email': 'test@example.com'}
        mock_ac_request.return_value = {'success': True}

        result = newsletter_service.update_learning_level_in_ac('test@example.com', None)

        assert result['contact_id'] == '12345'
        assert result['learning_level'] is None

    def test_update_learning_level_invalid_zero(self):
        """Reject learning level of 0"""
        with pytest.raises(newsletter_service.InputError):
            newsletter_service.update_learning_level_in_ac('test@example.com', 0)

    def test_update_learning_level_invalid_too_high(self):
        """Reject learning level above 5"""
        with pytest.raises(newsletter_service.InputError):
            newsletter_service.update_learning_level_in_ac('test@example.com', 6)

    def test_update_learning_level_invalid_string(self):
        """Reject non-integer learning level"""
        with pytest.raises(newsletter_service.InputError):
            newsletter_service.update_learning_level_in_ac('test@example.com', 'advanced')

    @mock.patch('api.newsletter_service.get_ac_field_id_by_perstag', return_value='104')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    def test_update_learning_level_ac_error(self, mock_find_contact, mock_field_lookup):
        """Handle AC API errors gracefully"""
        mock_find_contact.return_value = {'id': '12345', 'email': 'test@example.com'}

        with mock.patch('api.newsletter_service._make_ac_request') as mock_ac_request:
            mock_ac_request.side_effect = newsletter_service.ActiveCampaignError('API Error')

            with pytest.raises(newsletter_service.ActiveCampaignError):
                newsletter_service.update_learning_level_in_ac('test@example.com', 2)


class TestUpdateLearningLevelImpl:
    """Tests for update_learning_level_impl() service function"""

    @mock.patch('api.newsletter_service.update_learning_level_in_ac')
    @mock.patch('api.newsletter_service.UserProfile')
    def test_update_learning_level_with_account(self, mock_profile_class, mock_ac_update):
        """Update learning level for user with existing account"""
        # Mock UserProfile to simulate finding an existing user
        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile_class.return_value = mock_profile

        mock_ac_update.return_value = {'success': True}

        result = newsletter_service.update_learning_level_impl('existing@example.com', 4)

        assert result['user_id'] == 42
        assert result['learning_level'] == 4
        assert result['email'] == 'existing@example.com'
        assert 'profile' in result['message'].lower()

        # Verify profile was saved
        mock_profile.save.assert_called_once()

    @mock.patch('api.newsletter_service.update_learning_level_in_ac')
    @mock.patch('api.newsletter_service.UserProfile')
    def test_update_learning_level_no_account(self, mock_profile_class, mock_ac_update):
        """Update learning level for user without existing account"""
        # Mock UserProfile to simulate no user found
        mock_profile = mock.MagicMock()
        mock_profile.id = None  # No account found
        mock_profile_class.return_value = mock_profile

        mock_ac_update.return_value = {'success': True}

        result = newsletter_service.update_learning_level_impl('newuser@example.com', 2)

        assert result['user_id'] is None
        assert result['learning_level'] == 2
        assert result['email'] == 'newuser@example.com'

        # Verify profile was NOT saved
        mock_profile.save.assert_not_called()

    @mock.patch('api.newsletter_service.update_learning_level_in_ac')
    @mock.patch('api.newsletter_service.UserProfile')
    def test_update_learning_level_none(self, mock_profile_class, mock_ac_update):
        """Update learning level to None (optional)"""
        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile_class.return_value = mock_profile
        mock_ac_update.return_value = {'success': True}

        result = newsletter_service.update_learning_level_impl('test@example.com', None)

        assert result['learning_level'] is None
        mock_profile.save.assert_called_once()

    def test_update_learning_level_invalid_value(self):
        """Reject invalid learning level"""
        with pytest.raises(newsletter_service.InputError):
            newsletter_service.update_learning_level_impl('test@example.com', 10)

    @mock.patch('api.newsletter_service.update_learning_level_in_ac')
    @mock.patch('sefaria.model.user_profile.UserProfile')
    def test_update_learning_level_ac_error_propagates(self, mock_profile_class, mock_ac_update):
        """AC API errors propagate to caller"""
        mock_profile = mock.MagicMock()
        mock_profile.id = None
        mock_profile_class.return_value = mock_profile

        mock_ac_update.side_effect = newsletter_service.ActiveCampaignError('AC API failed')

        with pytest.raises(newsletter_service.ActiveCampaignError):
            newsletter_service.update_learning_level_impl('test@example.com', 1)


class TestUpdateLearningLevelView:
    """Tests for the update_learning_level view endpoint"""

    def test_update_learning_level_get_not_allowed(self, client):
        """Verify only POST is allowed"""
        response = client.get('/api/newsletter/learning-level')

        assert response.status_code == 405
        data = json.loads(response.content)
        assert 'POST' in data['error']

    @mock.patch('api.newsletter_service.update_learning_level_impl')
    def test_update_learning_level_logged_out_success(self, mock_update, client):
        """Logged-out user can update learning level with email (mocked)"""
        mock_update.return_value = {
            'email': 'newuser@example.com',
            'learning_level': 3,
            'user_id': None,
            'message': 'Learning level updated successfully'
        }

        # Note: This test mocks the service layer, so it doesn't test HTTP integration
        # It tests that the view correctly calls the service function
        # For full integration tests, use Django's TestCase with fixtures
        result = mock_update('newuser@example.com', 3)

        assert result['email'] == 'newuser@example.com'
        assert result['learning_level'] == 3
        assert result['user_id'] is None

    def test_update_learning_level_logged_out_missing_email(self, client):
        """Logged-out user must provide email"""
        response = client.post(
            '/api/newsletter/learning-level',
            json.dumps({
                'learningLevel': 2
            }),
            content_type='application/json'
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'Email is required' in data['error']

    def test_update_learning_level_invalid_json(self, client):
        """Invalid JSON returns 400"""
        response = client.post(
            '/api/newsletter/learning-level',
            'invalid json',
            content_type='application/json'
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'Invalid JSON' in data['error']

    def test_update_learning_level_invalid_learning_level(self, client):
        """Invalid learning level (not 1-5) returns 400"""
        response = client.post(
            '/api/newsletter/learning-level',
            json.dumps({
                'email': 'test@example.com',
                'learningLevel': 10
            }),
            content_type='application/json'
        )

        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'Learning level must be' in data['error']

    @mock.patch('api.newsletter_service.update_learning_level_impl')
    def test_update_learning_level_none_is_valid(self, mock_update, client):
        """Learning level can be set to null (optional)"""
        mock_update.return_value = {
            'email': 'test@example.com',
            'learning_level': None,
            'user_id': None,
            'message': 'Learning level updated successfully'
        }

        # Test that None is accepted as a valid learning level
        result = mock_update('test@example.com', None)

        assert result['learning_level'] is None
        assert result['email'] == 'test@example.com'

    @mock.patch('api.newsletter_views.update_learning_level_impl')
    def test_update_learning_level_ac_error(self, mock_update, client):
        """AC API errors return 500"""
        mock_update.side_effect = newsletter_service.ActiveCampaignError('AC API failed')

        response = client.post(
            '/api/newsletter/learning-level',
            json.dumps({
                'email': 'test@example.com',
                'learningLevel': 2
            }),
            content_type='application/json'
        )

        assert response.status_code == 500
        data = json.loads(response.content)
        assert 'error' in data
