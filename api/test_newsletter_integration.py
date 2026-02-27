"""
Integration test for newsletter_service.get_newsletter_list()

This test verifies the complete data flow from AC API responses through
the merge logic to the final newsletter object structure.
"""

import pytest
from unittest import mock
from api import newsletter_service


class TestGetNewsletterListIntegration:
    """Integration test for get_newsletter_list() with realistic AC API responses"""

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_complete_integration_with_realistic_ac_responses(self, mock_request):
        """
        Integration test: Verify get_newsletter_list() works end-to-end
        with realistic ActiveCampaign API response structures.

        This test simulates production conditions:
        1. AC API returns lists with id, stringid, name fields
        2. AC API returns personalization variables with tag, name, content fields
        3. Variables have simplified JSON content (only icon and language)
        4. Function correctly merges data and returns expected structure
        """

        # Mock ActiveCampaign API responses with realistic structure
        def ac_api_side_effect(endpoint):
            if endpoint == 'lists?limit=100':
                # Realistic AC lists endpoint response
                return {
                    'lists': [
                        {
                            'id': '1',
                            'stringid': 'sefaria_news',
                            'name': 'Sefaria News',  # AC's default name (not used)
                            'cdate': '2024-01-15 10:00:00',
                            'subscriber_count': '5234'
                        },
                        {
                            'id': '2',
                            'stringid': 'educator_resources',
                            'name': 'Educator Resources',
                            'cdate': '2024-02-20 14:30:00',
                            'subscriber_count': '1823'
                        },
                        {
                            'id': '3',
                            'stringid': 'text_updates',
                            'name': 'Text Updates',
                            'cdate': '2024-03-10 09:15:00',
                            'subscriber_count': '8901'
                        },
                        {
                            'id': '99',
                            'stringid': 'no_metadata_list',
                            'name': 'No Metadata',
                            'cdate': '2024-04-01 12:00:00',
                            'subscriber_count': '100'
                        }
                    ]
                }
            elif endpoint == 'personalizations?limit=100':
                # Realistic AC personalizations endpoint response
                # Note: Tag is lowercase (AC normalizes it)
                # Note: Only list 1, 2, 3 have metadata (list 99 does not)
                return {
                    'personalizations': [
                        {
                            'id': '101',
                            'tag': 'list_1_meta',
                            'name': 'Sefaria News & Resources',  # Used for displayName
                            'content': '{"icon": "news-and-resources.svg", "language": "english"}',
                            'date': '2024-01-15 10:05:00'
                        },
                        {
                            'id': '102',
                            'tag': 'list_2_meta',
                            'name': 'Educator Resources',  # Used for displayName
                            'content': '{"icon": "educator-resources.svg", "language": "english"}',
                            'date': '2024-02-20 14:35:00'
                        },
                        {
                            'id': '103',
                            'tag': 'list_3_meta',
                            'name': 'Text Updates & Insights',  # Used for displayName
                            'content': '{"icon": "new-text-release-updates.svg", "language": "english"}',
                            'date': '2024-03-10 09:20:00'
                        },
                        {
                            'id': '999',
                            'tag': 'other_variable',
                            'name': 'Some Other Variable',
                            'content': '{"unrelated": "data"}',
                            'date': '2024-05-01 08:00:00'
                        }
                    ]
                }

        mock_request.side_effect = ac_api_side_effect

        # Call the function
        newsletters = newsletter_service.get_newsletter_list()

        # Verify correct number returned (only lists with metadata)
        assert len(newsletters) == 3, f"Expected 3 newsletters, got {len(newsletters)}"

        # Verify Newsletter 1 structure and data sources
        newsletter_1 = next(n for n in newsletters if n['id'] == '1')
        assert newsletter_1['id'] == '1', "ID should come from AC list object"
        assert newsletter_1['stringid'] == 'sefaria_news', "stringid should come from AC list object"
        assert newsletter_1['displayName'] == 'Sefaria News & Resources', "displayName should come from variable's name field"
        assert newsletter_1['icon'] == 'news-and-resources.svg', "icon should come from variable's JSON content"
        assert newsletter_1['language'] == 'english', "language should come from variable's JSON content"

        # Verify Newsletter 2 structure and data sources
        newsletter_2 = next(n for n in newsletters if n['id'] == '2')
        assert newsletter_2['id'] == '2'
        assert newsletter_2['stringid'] == 'educator_resources', "stringid should be from AC list, not JSON"
        assert newsletter_2['displayName'] == 'Educator Resources', "displayName should be from variable name"
        assert newsletter_2['icon'] == 'educator-resources.svg'
        assert newsletter_2['language'] == 'english'

        # Verify Newsletter 3 structure and data sources
        newsletter_3 = next(n for n in newsletters if n['id'] == '3')
        assert newsletter_3['id'] == '3'
        assert newsletter_3['stringid'] == 'text_updates', "stringid should be from AC list, not JSON"
        assert newsletter_3['displayName'] == 'Text Updates & Insights', "displayName should be from variable name"
        assert newsletter_3['icon'] == 'new-text-release-updates.svg'
        assert newsletter_3['language'] == 'english'

        # Verify list without metadata is excluded
        newsletter_ids = [n['id'] for n in newsletters]
        assert '99' not in newsletter_ids, "Lists without metadata should be excluded"

        # Verify all newsletters have required fields
        for newsletter in newsletters:
            assert 'id' in newsletter
            assert 'stringid' in newsletter
            assert 'displayName' in newsletter
            assert 'icon' in newsletter
            assert 'language' in newsletter
            assert len(newsletter) == 5, f"Newsletter should have exactly 5 fields, got {len(newsletter)}"

        # Verify API was called correctly
        assert mock_request.call_count == 2
        mock_request.assert_any_call('lists?limit=100')
        mock_request.assert_any_call('personalizations?limit=100')

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_integration_variable_without_name_field(self, mock_request):
        """
        Test edge case: Variable missing 'name' field
        displayName should fallback to empty string
        """
        def ac_api_side_effect(endpoint):
            if endpoint == 'lists?limit=100':
                return {
                    'lists': [
                        {'id': '1', 'stringid': 'test_list', 'name': 'Test List'}
                    ]
                }
            elif endpoint == 'personalizations?limit=100':
                return {
                    'personalizations': [
                        {
                            'id': '101',
                            'tag': 'list_1_meta',
                            # Missing 'name' field
                            'content': '{"icon": "news-and-resources.svg", "language": "english"}'
                        }
                    ]
                }

        mock_request.side_effect = ac_api_side_effect

        newsletters = newsletter_service.get_newsletter_list()

        assert len(newsletters) == 1
        assert newsletters[0]['displayName'] == '', "Missing name should default to empty string"
        assert newsletters[0]['stringid'] == 'test_list', "stringid should still come from AC list"

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_integration_list_without_stringid_field(self, mock_request):
        """
        Test edge case: AC list missing 'stringid' field
        stringid should fallback to empty string
        """
        def ac_api_side_effect(endpoint):
            if endpoint == 'lists?limit=100':
                return {
                    'lists': [
                        {
                            'id': '1',
                            # Missing 'stringid' field
                            'name': 'Test List'
                        }
                    ]
                }
            elif endpoint == 'personalizations?limit=100':
                return {
                    'personalizations': [
                        {
                            'id': '101',
                            'tag': 'list_1_meta',
                            'name': 'Test Newsletter',
                            'content': '{"icon": "news-and-resources.svg", "language": "english"}'
                        }
                    ]
                }

        mock_request.side_effect = ac_api_side_effect

        newsletters = newsletter_service.get_newsletter_list()

        assert len(newsletters) == 1
        assert newsletters[0]['stringid'] == '', "Missing stringid should default to empty string"
        assert newsletters[0]['displayName'] == 'Test Newsletter', "displayName should still come from variable name"

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_integration_json_content_missing_fields(self, mock_request):
        """
        Test: Variable JSON content missing optional fields
        icon and language should have proper defaults
        """
        def ac_api_side_effect(endpoint):
            if endpoint == 'lists?limit=100':
                return {
                    'lists': [
                        {'id': '1', 'stringid': 'test_list', 'name': 'Test'}
                    ]
                }
            elif endpoint == 'personalizations?limit=100':
                return {
                    'personalizations': [
                        {
                            'id': '101',
                            'tag': 'list_1_meta',
                            'name': 'Test Newsletter',
                            'content': '{}'  # Empty JSON - no icon or language
                        }
                    ]
                }

        mock_request.side_effect = ac_api_side_effect

        newsletters = newsletter_service.get_newsletter_list()

        assert len(newsletters) == 1
        assert newsletters[0]['icon'] == 'news-and-resources.svg', "Missing icon should default to news-and-resources.svg"
        assert newsletters[0]['language'] == 'english', "Missing language should default to 'english'"

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_integration_tag_case_normalization(self, mock_request):
        """
        Verify: ActiveCampaign normalizes tags to lowercase
        Function should work with lowercase tags
        """
        def ac_api_side_effect(endpoint):
            if endpoint == 'lists?limit=100':
                return {
                    'lists': [
                        {'id': '42', 'stringid': 'advanced_list', 'name': 'Advanced'}
                    ]
                }
            elif endpoint == 'personalizations?limit=100':
                return {
                    'personalizations': [
                        {
                            'id': '201',
                            'tag': 'list_42_meta',  # lowercase (AC normalizes)
                            'name': 'Advanced Topics',
                            'content': '{"icon": "technology-updates.svg", "language": "english"}'
                        }
                    ]
                }

        mock_request.side_effect = ac_api_side_effect

        newsletters = newsletter_service.get_newsletter_list()

        assert len(newsletters) == 1
        assert newsletters[0]['id'] == '42'
        assert newsletters[0]['stringid'] == 'advanced_list'
        assert newsletters[0]['displayName'] == 'Advanced Topics'
        assert newsletters[0]['icon'] == 'technology-updates.svg'


class TestUpdateUserPreferencesIntegration:
    """Integration tests for update_user_preferences_impl with opt-out logic"""

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('api.newsletter_service.update_list_memberships')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service.get_all_ac_list_ids')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    def test_opt_out_end_to_end(self, mock_find, mock_get_all_ids,
                                 mock_get_memberships, mock_update, mock_update_flag):
        """
        Integration: Opt-out flow unsubscribes from all lists (managed + unmanaged)
        and sets wants_marketing_emails=False
        """
        mock_find.return_value = {'id': '100', 'email': 'user@example.com'}
        mock_get_all_ids.return_value = ['1', '2', '3', '99']
        mock_get_memberships.return_value = ['1', '3', '99']
        mock_update.return_value = None

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]

        result = newsletter_service.update_user_preferences_impl(
            'user@example.com', 'John', 'Doe',
            ['sefaria_news'],
            newsletter_list,
            marketing_opt_out=True
        )

        # All active lists removed
        call_args = mock_update.call_args
        removed = set(call_args[0][2])
        assert removed == {'1', '3', '99'}

        # Result is empty subscriptions
        assert result['subscribed_newsletters'] == []

        # wants_marketing_emails set to False
        mock_update_flag.assert_called_once_with('user@example.com', False)

    @mock.patch('api.newsletter_service._update_wants_marketing_emails')
    @mock.patch('api.newsletter_service.update_list_memberships')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service.find_or_create_contact')
    def test_re_opt_in_after_opt_out(self, mock_find, mock_get_memberships,
                                      mock_update, mock_update_flag):
        """
        Integration: Re-opting in after opt-out subscribes to selected managed lists
        and sets wants_marketing_emails=True
        """
        mock_find.return_value = {'id': '100', 'email': 'user@example.com'}
        # User has no active subscriptions (opted out previously)
        mock_get_memberships.return_value = []
        mock_update.return_value = None

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]

        result = newsletter_service.update_user_preferences_impl(
            'user@example.com', 'John', 'Doe',
            ['sefaria_news', 'text_updates'],
            newsletter_list,
            marketing_opt_out=False
        )

        # Both lists added
        call_args = mock_update.call_args
        added = set(call_args[0][1])
        assert added == {'1', '3'}

        assert sorted(result['subscribed_newsletters']) == ['sefaria_news', 'text_updates']

        # wants_marketing_emails set to True
        mock_update_flag.assert_called_once_with('user@example.com', True)


class TestFetchUserSubscriptionsIntegration:
    """Integration tests for fetch_user_subscriptions_impl with wants_marketing_emails"""

    @mock.patch('api.newsletter_service.UserProfile')
    @mock.patch('api.newsletter_service.get_contact_list_memberships')
    @mock.patch('api.newsletter_service._make_ac_request')
    def test_stale_opt_out_scenario(self, mock_request, mock_get_memberships, mock_profile_class):
        """
        Integration: Stale opt-out scenario - user has wants_marketing_emails=False in MongoDB
        but has active managed subscriptions in AC (re-subscribed via another channel).
        The function returns both values; frontend handles the detection logic.
        """
        mock_request.return_value = {
            'contacts': [{'id': '100', 'email': 'user@example.com'}]
        }
        # User has active managed subscriptions in AC
        mock_get_memberships.return_value = ['1', '3']

        # MongoDB says user opted out
        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.wants_marketing_emails = False
        mock_profile_class.return_value = mock_profile

        mock_user = mock.MagicMock()
        mock_user.is_authenticated = True

        newsletter_list = [
            {'stringid': 'sefaria_news', 'id': '1'},
            {'stringid': 'text_updates', 'id': '3'},
        ]

        result = newsletter_service.fetch_user_subscriptions_impl(
            'user@example.com', newsletter_list, user=mock_user
        )

        # Backend returns both values as-is; frontend will override the toggle
        assert result['wants_marketing_emails'] is False
        assert len(result['subscribed_newsletters']) == 2
        assert 'sefaria_news' in result['subscribed_newsletters']
        assert 'text_updates' in result['subscribed_newsletters']
