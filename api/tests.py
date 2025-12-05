from django.test.client import Client
import django
django.setup()
from reader.tests import SefariaTestCase
import json
from api.api_warnings import APIWarningCode
from unittest import mock
from api import newsletter_service


c = Client()


class APITextsTests(SefariaTestCase):

    def test_api_get_text_default(self):
        response = c.get('/api/v3/texts/Genesis.1')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["versions"]) == 1)
        self.assertTrue(data["versions"][0]['actualLanguage'] == 'he')
        self.assertEqual(data["book"], "Genesis")
        self.assertEqual(data["categories"], ["Tanakh", "Torah"])
        self.assertEqual(data["sections"], ['1'])
        self.assertEqual(data["toSections"], ['1'])

    def test_api_get_text_source_all(self):
        response = c.get('/api/v3/texts/Shabbat.22a?version=source|all')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["versions"]) > 1)
        self.assertTrue(all(v['actualLanguage'] == 'he' for v in data["versions"]))
        self.assertEqual(data["book"], "Shabbat")
        self.assertEqual(data["categories"], ["Talmud", "Bavli", "Seder Moed"])
        self.assertEqual(data["sections"], ["22a"])
        self.assertEqual(data["toSections"], ["22a"])

    def test_api_get_text_source(self):
        response = c.get('/api/v3/texts/Shabbat.22a?version=source')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data["versions"][0]['versionTitle'], "William Davidson Edition - Vocalized Aramaic")

    def test_api_get_text_translation_all(self):
        response = c.get('/api/v3/texts/Shabbat.22a?version=translation|all')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["versions"]) > 1)
        self.assertTrue(any(v['actualLanguage'] == 'en' for v in data["versions"]))
        self.assertEqual(data["book"], "Shabbat")
        self.assertEqual(data["categories"], ["Talmud", "Bavli", "Seder Moed"])
        self.assertEqual(data["sections"], ["22a"])
        self.assertEqual(data["toSections"], ["22a"])

    def test_api_get_text_translation(self):
        response = c.get('/api/v3/texts/Shabbat.22a?version=translation')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data["versions"][0]['versionTitle'], "William Davidson Edition - English")

    def test_api_get_text_lang_all(self):
        response = c.get('/api/v3/texts/Rashi_on_Genesis.2.3?version=english|all')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["versions"]) > 1)
        self.assertTrue(all(v['actualLanguage'] == 'en' for v in data["versions"]))
        self.assertEqual(data["book"], "Rashi on Genesis")
        self.assertEqual(data["collectiveTitle"], "Rashi")
        self.assertEqual(data["categories"], ["Tanakh", "Rishonim on Tanakh", "Rashi", "Torah"])
        self.assertEqual(data["sections"], ['2', '3'])
        self.assertEqual(data["toSections"], ['2', '3'])

    def test_api_get_text_specific(self):
        response = c.get('/api/v3/texts/Tosafot_on_Sukkah.2a.4.1?version=hebrew|Vilna_Edition')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data["versions"][0]['actualLanguage'], 'he')
        self.assertEqual(data["versions"][0]['versionTitle'], 'Vilna Edition')
        self.assertEqual(data["book"], "Tosafot on Sukkah")
        self.assertEqual(data["collectiveTitle"], "Tosafot")
        self.assertEqual(data["categories"], ["Talmud", "Bavli", "Rishonim on Talmud", "Tosafot", "Seder Moed"])
        self.assertEqual(data["sections"], ["2a", '4', '1'])
        self.assertEqual(data["toSections"], ["2a", '4', '1'])

    def test_api_get_text_primary_all(self):
        response = c.get('/api/v3/texts/Genesis.1?version=primary|all')
        data = json.loads(response.content)
        self.assertTrue(len(data["versions"]) > 3)
        self.assertTrue(all(v['actualLanguage'] == 'he' for v in data["versions"]))

    def test_api_get_text_primary(self):
        response = c.get('/api/v3/texts/Shabbat.22a?version=primary')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data["versions"][0]['versionTitle'], "William Davidson Edition - Vocalized Aramaic")

    def test_api_get_text_two_params(self):
        response = c.get('/api/v3/texts/Genesis.1?version=hebrew|Tanach with Nikkud&version=english|all')
        data = json.loads(response.content)
        self.assertTrue(len(data["versions"]) > 7)
        self.assertEqual(data["versions"][0]['actualLanguage'], 'he')
        self.assertTrue(all(v['actualLanguage'] == 'en' for v in data["versions"][1:]))

    def test_api_get_text_range(self):
        response = c.get('/api/v3/texts/Job.5.2-4')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["sections"], ['5', '2'])
        self.assertEqual(data["toSections"], ['5', '4'])

    def text_api_virtual_node(self):
        response = c.get('/api/v3/texts/BDB, א')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data['versions']), 1)
        self.assertEqual(data['versions'][0]['text'], ['<big><span dir="rtl">א</span></big>  <em>Āleph</em>, first letter; in post Biblical Hebrew = numeral 1 (and so in margin of printed MT); א̈= 1000; no evidence of this usage in OT times.'])

    def test_api_get_text_bad_text(self):
        response = c.get('/api/v3/texts/Life_of_Pi.13.13')
        self.assertEqual(404, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Could not find title in reference: Life of Pi.13.13")

    def test_api_get_text_out_of_bound(self):
        response = c.get('/api/v3/texts/Genesis.999')
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Genesis ends at Chapter 50.")

    def test_api_get_text_too_many_hyphens(self):
        response = c.get('/api/v3/texts/Genesis.9-4-5')
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Couldn't understand ref 'Genesis.9-4-5' (too many -'s).")

    def test_api_get_text_bad_sections(self):
        response = c.get('/api/v3/texts/Job.6-X')
        self.assertEqual(404, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Couldn't understand text sections: 'Job.6-X'.")

    def test_api_get_text_empty_ref(self):
        response = c.get("/api/v3/texts/Berakhot.1a")
        self.assertEqual(404, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "We have no text for Berakhot 1a.")

    def test_api_get_text_no_source(self):
        response = c.get("/api/v3/texts/The_Book_of_Maccabees_I.1?version=english|Brenton's_Septuagint&version=source")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data['warnings'][0]['source']['warning_code'], APIWarningCode.APINoSourceText.value)
        self.assertEqual(data['warnings'][0]['source']['message'], 'We do not have the source text for The Book of Maccabees I 1')

    def test_api_get_text_no_translation(self):
        response = c.get("/api/v3/texts/Shuvi_Shuvi_HaShulamit?version=translation")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data["versions"]), 0)
        self.assertEqual(data['warnings'][0]['translation']['warning_code'], APIWarningCode.APINoTranslationText.value)
        self.assertEqual(data['warnings'][0]['translation']['message'], 'We do not have a translation for Shuvi Shuvi HaShulamit')

    def test_api_get_text_no_language(self):
        response = c.get("/api/v3/texts/The_Book_of_Maccabees_I.1?version=english|Brenton's_Septuagint&version=sgrg|all")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data['warnings'][0]['sgrg|all']['warning_code'], APIWarningCode.APINoLanguageVersion.value)
        self.assertEqual(data['warnings'][0]['sgrg|all']['message'],
                         "We do not have the language you asked for The Book of Maccabees I 1. Available languages are ['english', 'hebrew']")

    def test_api_get_text_no_version(self):
        response = c.get("/api/v3/texts/The_Book_of_Maccabees_I.1?version=english|Brenton's_Septuagint&version=hebrew|Kishkoosh")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data['warnings'][0]['hebrew|Kishkoosh']['warning_code'], APIWarningCode.APINoVersion.value)
        self.assertEqual(data['warnings'][0]['hebrew|Kishkoosh']['message'],
                         'We do not have version named Kishkoosh with language hebrew for The Book of Maccabees I 1')

    def test_fill_in_missing_segments(self):
        vtitle = "Maimonides' Mishneh Torah, edited by Philip Birnbaum, New York, 1967"
        response = c.get(f"/api/v3/texts/Mishneh_Torah,_Sabbath_1?version=english|{vtitle}&fill_in_missing_segments=1")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data['versions'][0]['text']) > 2)
        self.assertTrue(data['versions'][0].get('sources'))
        self.assertEqual(data['versions'][0]['sources'][0], vtitle)
        self.assertNotEqual(data['versions'][0]['sources'][2], vtitle)

    def test_without_fill_in_missing_segments(self):
        vtitle = "Maimonides' Mishneh Torah, edited by Philip Birnbaum, New York, 1967"
        response = c.get(f"/api/v3/texts/Mishneh_Torah,_Sabbath_1?version=english|{vtitle}")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data['versions'][0]['text']), 2)
        self.assertFalse(data['versions'][0].get('sources'))

    def test_wrap_all_entities(self):
        vtitle = "The Contemporary Torah, Jewish Publication Society, 2006"
        response = c.get(f"/api/v3/texts/Genesis%2010?version=english|{vtitle}&return_format=wrap_all_entities")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue('<a class ="refLink"' in data['versions'][0]['text'][3])
        self.assertTrue('<a href="/topics' in data['versions'][0]['text'][8])

    def test_text_only(self):
        response = c.get(f"/api/v3/texts/Shulchan_Arukh%2C_Orach_Chayim.1:1?return_format=text_only")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertFalse('<' in data['versions'][0]['text'])

    def test_strip_only_footnotes(self):
        vtitle = "The Contemporary Torah, Jewish Publication Society, 2006"
        response = c.get(f"/api/v3/texts/Genesis%201:1?version=english|{vtitle}&return_format=strip_only_footnotes")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertFalse('<i class="footnote">' in data['versions'][0]['text'])


    def test_error_return_format(self):
        response = c.get(f"/api/v3/texts/Shulchan_Arukh%2C_Orach_Chayim.1:1?return_format=not_valid")
        self.assertEqual(400, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data['error'], "return_format should be one of those formats: ['default', 'wrap_all_entities', 'text_only', 'strip_only_footnotes'].")


class NewsletterServiceTests(SefariaTestCase):
    """
    Tests for newsletter service layer integration with ActiveCampaign.
    """

    def test_extract_list_id_from_tag_valid(self):
        """Test extracting list ID from valid LIST_{id}_META tags"""
        self.assertEqual(newsletter_service.extract_list_id_from_tag('LIST_1_META'), 1)
        self.assertEqual(newsletter_service.extract_list_id_from_tag('LIST_999_META'), 999)
        self.assertEqual(newsletter_service.extract_list_id_from_tag('LIST_42_META'), 42)

    def test_extract_list_id_from_tag_invalid(self):
        """Test extracting list ID from invalid tags"""
        self.assertIsNone(newsletter_service.extract_list_id_from_tag('INVALID_TAG'))
        self.assertIsNone(newsletter_service.extract_list_id_from_tag('LIST_META'))
        self.assertIsNone(newsletter_service.extract_list_id_from_tag('LIST_abc_META'))
        self.assertIsNone(newsletter_service.extract_list_id_from_tag(''))
        self.assertIsNone(newsletter_service.extract_list_id_from_tag(None))

    def test_parse_metadata_from_variable_valid(self):
        """Test parsing valid JSON metadata from personalization variable"""
        variable = {
            'tag': 'LIST_1_META',
            'content': '{"stringid": "sefaria_news", "displayName": "Sefaria News", "emoji": "📚", "language": "english"}'
        }
        metadata = newsletter_service.parse_metadata_from_variable(variable)
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata['stringid'], 'sefaria_news')
        self.assertEqual(metadata['displayName'], 'Sefaria News')
        self.assertEqual(metadata['emoji'], '📚')
        self.assertEqual(metadata['language'], 'english')

    def test_parse_metadata_from_variable_invalid_json(self):
        """Test parsing invalid JSON returns None"""
        variable = {
            'tag': 'LIST_1_META',
            'content': 'not valid json'
        }
        metadata = newsletter_service.parse_metadata_from_variable(variable)
        self.assertIsNone(metadata)

    def test_parse_metadata_from_variable_missing_content(self):
        """Test parsing variable without content field"""
        metadata = newsletter_service.parse_metadata_from_variable({'tag': 'LIST_1_META'})
        self.assertIsNone(metadata)

    def test_parse_metadata_from_variable_empty_content(self):
        """Test parsing variable with empty content"""
        metadata = newsletter_service.parse_metadata_from_variable({'tag': 'LIST_1_META', 'content': ''})
        self.assertIsNone(metadata)

    def test_parse_metadata_from_variable_none(self):
        """Test parsing None variable"""
        metadata = newsletter_service.parse_metadata_from_variable(None)
        self.assertIsNone(metadata)

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_get_all_lists_success(self, mock_request):
        """Test successfully fetching all lists from ActiveCampaign"""
        mock_request.return_value = {
            'lists': [
                {'id': '1', 'stringid': 'sefaria_news', 'name': 'Sefaria News'},
                {'id': '2', 'stringid': 'educator_resources', 'name': 'Educator Resources'},
            ]
        }
        lists = newsletter_service.get_all_lists()
        self.assertEqual(len(lists), 2)
        self.assertEqual(lists[0]['id'], '1')
        self.assertEqual(lists[1]['stringid'], 'educator_resources')
        mock_request.assert_called_once_with('lists')

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_get_all_lists_error(self, mock_request):
        """Test error handling when fetching lists fails"""
        mock_request.side_effect = newsletter_service.ActiveCampaignError("API connection failed")
        with self.assertRaises(newsletter_service.ActiveCampaignError):
            newsletter_service.get_all_lists()

    @mock.patch('api.newsletter_service._make_ac_request')
    def test_get_all_personalization_variables_success(self, mock_request):
        """Test successfully fetching personalization variables"""
        mock_request.return_value = {
            'personalizations': [
                {'tag': 'LIST_1_META', 'content': '{"stringid": "sefaria_news"}'},
                {'tag': 'LIST_2_META', 'content': '{"stringid": "educator_resources"}'},
            ]
        }
        variables = newsletter_service.get_all_personalization_variables()
        self.assertEqual(len(variables), 2)
        self.assertEqual(variables[0]['tag'], 'LIST_1_META')
        mock_request.assert_called_once_with('personalizations')

    @mock.patch('api.newsletter_service.get_all_lists')
    @mock.patch('api.newsletter_service.get_all_personalization_variables')
    def test_get_newsletter_list_success(self, mock_variables, mock_lists):
        """Test successfully building newsletter list with metadata"""
        mock_lists.return_value = [
            {'id': '1', 'stringid': 'sefaria_news', 'name': 'Sefaria News'},
            {'id': '2', 'stringid': 'educator_resources', 'name': 'Educator Resources'},
        ]
        mock_variables.return_value = [
            {
                'tag': 'LIST_1_META',
                'content': '{"stringid": "sefaria_news", "displayName": "Sefaria News & Resources", "emoji": "📚", "language": "english"}'
            },
            {
                'tag': 'LIST_2_META',
                'content': '{"stringid": "educator_resources", "displayName": "Educator Resources", "emoji": "🎓", "language": "english"}'
            },
        ]
        newsletters = newsletter_service.get_newsletter_list()

        self.assertEqual(len(newsletters), 2)

        # Check first newsletter
        self.assertEqual(newsletters[0]['id'], '1')
        self.assertEqual(newsletters[0]['stringid'], 'sefaria_news')
        self.assertEqual(newsletters[0]['displayName'], 'Sefaria News & Resources')
        self.assertEqual(newsletters[0]['emoji'], '📚')
        self.assertEqual(newsletters[0]['language'], 'english')
        self.assertEqual(newsletters[0]['acListId'], '1')

        # Check second newsletter
        self.assertEqual(newsletters[1]['id'], '2')
        self.assertEqual(newsletters[1]['emoji'], '🎓')

    @mock.patch('api.newsletter_service.get_all_lists')
    @mock.patch('api.newsletter_service.get_all_personalization_variables')
    def test_get_newsletter_list_only_returns_lists_with_metadata(self, mock_variables, mock_lists):
        """Test that only lists with metadata are returned"""
        mock_lists.return_value = [
            {'id': '1', 'stringid': 'sefaria_news', 'name': 'Sefaria News'},
            {'id': '2', 'stringid': 'no_metadata', 'name': 'No Metadata List'},
        ]
        mock_variables.return_value = [
            {
                'tag': 'LIST_1_META',
                'content': '{"stringid": "sefaria_news", "displayName": "Sefaria News", "emoji": "📚", "language": "english"}'
            },
        ]
        newsletters = newsletter_service.get_newsletter_list()

        # Only the list with metadata should be returned
        self.assertEqual(len(newsletters), 1)
        self.assertEqual(newsletters[0]['id'], '1')

    @mock.patch('api.newsletter_service.get_all_lists')
    @mock.patch('api.newsletter_service.get_all_personalization_variables')
    def test_get_newsletter_list_handles_malformed_metadata(self, mock_variables, mock_lists):
        """Test that lists with malformed metadata are skipped"""
        mock_lists.return_value = [
            {'id': '1', 'stringid': 'sefaria_news', 'name': 'Sefaria News'},
            {'id': '2', 'stringid': 'bad_json', 'name': 'Bad JSON'},
        ]
        mock_variables.return_value = [
            {
                'tag': 'LIST_1_META',
                'content': '{"stringid": "sefaria_news", "displayName": "Sefaria News", "emoji": "📚"}'
            },
            {
                'tag': 'LIST_2_META',
                'content': 'not valid json at all'
            },
        ]
        newsletters = newsletter_service.get_newsletter_list()

        # Only the valid one should be returned
        self.assertEqual(len(newsletters), 1)
        self.assertEqual(newsletters[0]['id'], '1')

    @mock.patch('api.newsletter_service.get_all_lists')
    @mock.patch('api.newsletter_service.get_all_personalization_variables')
    def test_get_newsletter_list_error_propagates(self, mock_variables, mock_lists):
        """Test that API errors are propagated"""
        mock_lists.side_effect = newsletter_service.ActiveCampaignError("API down")

        with self.assertRaises(newsletter_service.ActiveCampaignError):
            newsletter_service.get_newsletter_list()


class NewsletterViewTests(SefariaTestCase):
    """
    Tests for newsletter API views.
    """

    @mock.patch('api.newsletter_views.get_newsletter_list')
    def test_get_newsletter_lists_success(self, mock_get_list):
        """Test successful GET request to newsletter lists endpoint"""
        mock_get_list.return_value = [
            {
                'id': '1',
                'stringid': 'sefaria_news',
                'displayName': 'Sefaria News',
                'emoji': '📚',
                'language': 'english',
                'acListId': '1'
            }
        ]
        response = c.get('/api/newsletter/lists')

        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertIn('newsletters', data)
        self.assertEqual(len(data['newsletters']), 1)
        self.assertEqual(data['newsletters'][0]['stringid'], 'sefaria_news')

    @mock.patch('api.newsletter_views.get_newsletter_list')
    def test_get_newsletter_lists_error(self, mock_get_list):
        """Test error handling when ActiveCampaign API fails"""
        mock_get_list.side_effect = newsletter_service.ActiveCampaignError("Connection failed")
        response = c.get('/api/newsletter/lists')

        self.assertEqual(500, response.status_code)
        data = json.loads(response.content)
        self.assertIn('error', data)
        self.assertIn('Connection failed', data['error'])

    def test_get_newsletter_lists_post_not_allowed(self):
        """Test that POST requests are not allowed"""
        response = c.post('/api/newsletter/lists')

        self.assertEqual(405, response.status_code)
        data = json.loads(response.content)
        self.assertIn('error', data)
        self.assertIn('GET', data['error'])
