from django.test.client import Client
import django
django.setup()
from reader.tests import SefariaTestCase
import json
from api.api_warnings import APIWarningCode


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


class APIRefTests(SefariaTestCase):

    def test_not_ref(self):
        response = c.get('/api/ref/Not Ref')
        data = json.loads(response.content)
        self.assertFalse(data['is_ref'])

    def test_book_level_jagged_array(self):
        """Penei Moshe on Jerusalem Talmud Shabbat - book-level JaggedArrayNode depth 4"""
        response = c.get('/api/ref/Penei Moshe on Jerusalem Talmud Shabbat')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['node_type'], 'JaggedArrayNode')
        self.assertEqual(data['index_title'], 'Penei Moshe on Jerusalem Talmud Shabbat')
        self.assertEqual(data['depth'], 4)
        self.assertEqual(data['address_types'], ['Perek', 'Halakhah', 'Integer', 'Integer'])
        self.assertEqual(data['section_names'], ['Chapter', 'Halakhah', 'Segment', 'Comment'])
        self.assertEqual(data['start_indexes'], [])
        self.assertEqual(data['end_indexes'], [])
        self.assertIsNone(data['navigation_refs']['parent_ref'])
        self.assertEqual(data['navigation_refs']['first_available_section_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 1:1:1')
        self.assertEqual(data['navigation_refs']['first_subref'], 'Penei Moshe on Jerusalem Talmud Shabbat 1')
        self.assertEqual(data['navigation_refs']['last_subref'], 'Penei Moshe on Jerusalem Talmud Shabbat 24')
        self.assertNotIn('prev_section_ref', data['navigation_refs'])
        self.assertNotIn('next_section_ref', data['navigation_refs'])
        self.assertNotIn('prev_segment_ref', data['navigation_refs'])
        self.assertNotIn('next_segment_ref', data['navigation_refs'])

    def test_one_level_below_book(self):
        """Penei Moshe on Jerusalem Talmud Shabbat 2 - one level below book"""
        response = c.get('/api/ref/Penei Moshe on Jerusalem Talmud Shabbat 2')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['start_indexes'], [2])
        self.assertEqual(data['start_labels'], ['2'])
        self.assertEqual(data['end_indexes'], [2])
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat')
        self.assertEqual(data['navigation_refs']['first_available_section_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 2:1:1')
        self.assertEqual(data['navigation_refs']['first_subref'], 'Penei Moshe on Jerusalem Talmud Shabbat 2:1')
        self.assertEqual(data['navigation_refs']['last_subref'], 'Penei Moshe on Jerusalem Talmud Shabbat 2:7')
        self.assertNotIn('prev_section_ref', data['navigation_refs'])
        self.assertNotIn('next_section_ref', data['navigation_refs'])
        self.assertNotIn('prev_segment_ref', data['navigation_refs'])
        self.assertNotIn('next_segment_ref', data['navigation_refs'])

    def test_two_levels_below_book(self):
        """Penei Moshe on Jerusalem Talmud Shabbat 3:2 - two levels below book"""
        response = c.get('/api/ref/Penei Moshe on Jerusalem Talmud Shabbat 3:2')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['start_indexes'], [3, 2])
        self.assertEqual(data['start_labels'], ['3', '2'])
        self.assertEqual(data['end_indexes'], [3, 2])
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 3')
        self.assertEqual(data['navigation_refs']['first_subref'], 'Penei Moshe on Jerusalem Talmud Shabbat 3:2:1')
        self.assertEqual(data['navigation_refs']['last_subref'], 'Penei Moshe on Jerusalem Talmud Shabbat 3:2:3')
        self.assertNotIn('prev_section_ref', data['navigation_refs'])
        self.assertNotIn('next_section_ref', data['navigation_refs'])
        self.assertNotIn('prev_segment_ref', data['navigation_refs'])
        self.assertNotIn('next_segment_ref', data['navigation_refs'])

    def test_section_level(self):
        """Penei Moshe on Jerusalem Talmud Shabbat 2:3:2 - section-level with prev/next"""
        response = c.get('/api/ref/Penei Moshe on Jerusalem Talmud Shabbat 2:3:2')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['start_indexes'], [2, 3, 2])
        self.assertEqual(data['end_indexes'], [2, 3, 2])
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 2:3')
        self.assertEqual(data['navigation_refs']['prev_section_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 2:3:1')
        self.assertEqual(data['navigation_refs']['next_section_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 2:3:3')
        self.assertEqual(data['navigation_refs']['first_subref'], 'Penei Moshe on Jerusalem Talmud Shabbat 2:3:2:1')
        self.assertEqual(data['navigation_refs']['last_subref'], 'Penei Moshe on Jerusalem Talmud Shabbat 2:3:2:7')
        self.assertNotIn('prev_segment_ref', data['navigation_refs'])
        self.assertNotIn('next_segment_ref', data['navigation_refs'])

    def test_section_level_with_cross_node_navigation(self):
        """Penei Moshe on Jerusalem Talmud Shabbat 2:3:1 - section-level crossing into prev chapter"""
        response = c.get('/api/ref/Penei Moshe on Jerusalem Talmud Shabbat 2:3:1')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['navigation_refs']['prev_section_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 2:2:6')
        self.assertEqual(data['navigation_refs']['next_section_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 2:3:2')
        self.assertNotIn('prev_segment_ref', data['navigation_refs'])
        self.assertNotIn('next_segment_ref', data['navigation_refs'])

    def test_segment_level_first(self):
        """Penei Moshe on Jerusalem Talmud Shabbat 3:2:1:1 - first segment in section"""
        response = c.get('/api/ref/Penei Moshe on Jerusalem Talmud Shabbat 3:2:1:1')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['start_indexes'], [3, 2, 1, 1])
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 3:2:1')
        self.assertEqual(data['navigation_refs']['prev_segment_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 3:1:14:2')
        self.assertEqual(data['navigation_refs']['next_segment_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 3:2:1:2')
        self.assertNotIn('first_subref', data['navigation_refs'])
        self.assertNotIn('prev_section_ref', data['navigation_refs'])
        self.assertNotIn('next_section_ref', data['navigation_refs'])

    def test_segment_level_last_in_section(self):
        """Penei Moshe on Jerusalem Talmud Shabbat 3:2:1:2 - last segment in section"""
        response = c.get('/api/ref/Penei Moshe on Jerusalem Talmud Shabbat 3:2:1:2')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['navigation_refs']['prev_segment_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 3:2:1:1')
        self.assertEqual(data['navigation_refs']['next_segment_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 3:2:2:1')
        self.assertNotIn('prev_section_ref', data['navigation_refs'])
        self.assertNotIn('next_section_ref', data['navigation_refs'])

    def test_range_halakhah_level(self):
        """Penei Moshe on Jerusalem Talmud Shabbat 3:2-4:1 - range at halakhah level"""
        response = c.get('/api/ref/Penei Moshe on Jerusalem Talmud Shabbat 3:2-4:1')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['start_indexes'], [3, 2])
        self.assertEqual(data['start_labels'], ['3', '2'])
        self.assertEqual(data['end_indexes'], [4, 1])
        self.assertEqual(data['end_labels'], ['4', '1'])
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 3-4')
        self.assertNotIn('first_subref', data['navigation_refs'])
        self.assertNotIn('prev_section_ref', data['navigation_refs'])
        self.assertNotIn('next_section_ref', data['navigation_refs'])
        self.assertNotIn('prev_segment_ref', data['navigation_refs'])
        self.assertNotIn('next_segment_ref', data['navigation_refs'])

    def test_range_section_level(self):
        """Penei Moshe on Jerusalem Talmud Shabbat 3:2:1-4:1:1 - range at section level"""
        response = c.get('/api/ref/Penei Moshe on Jerusalem Talmud Shabbat 3:2:1-4:1:1')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['start_indexes'], [3, 2, 1])
        self.assertEqual(data['end_indexes'], [4, 1, 1])
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 3:2-4:1')
        self.assertEqual(data['navigation_refs']['prev_section_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 3:1:14')
        self.assertEqual(data['navigation_refs']['next_section_ref'], 'Penei Moshe on Jerusalem Talmud Shabbat 4:1:2')
        self.assertNotIn('prev_segment_ref', data['navigation_refs'])
        self.assertNotIn('next_segment_ref', data['navigation_refs'])

    def test_talmud_section(self):
        """Berakhot 22a - Talmud section-level ref"""
        response = c.get('/api/ref/Berakhot 22a')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['index_title'], 'Berakhot')
        self.assertEqual(data['node_type'], 'JaggedArrayNode')
        self.assertEqual(data['depth'], 2)
        self.assertEqual(data['address_types'], ['Talmud', 'Integer'])
        self.assertEqual(data['section_names'], ['Daf', 'Line'])
        self.assertEqual(data['start_indexes'], [43])
        self.assertEqual(data['start_labels'], ['22a'])
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Berakhot')
        self.assertEqual(data['navigation_refs']['prev_section_ref'], 'Berakhot 21b')
        self.assertEqual(data['navigation_refs']['next_section_ref'], 'Berakhot 22b')
        self.assertEqual(data['navigation_refs']['first_subref'], 'Berakhot 22a:1')
        self.assertEqual(data['navigation_refs']['last_subref'], 'Berakhot 22a:25')

    def test_schema_node(self):
        """Siddur Ashkenaz, Weekday, Shacharit - SchemaNode"""
        response = c.get('/api/ref/Siddur Ashkenaz, Weekday, Shacharit')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['node_type'], 'SchemaNode')
        self.assertEqual(data['index_title'], 'Siddur Ashkenaz')
        self.assertEqual(data['lineage_titles_top_down'], ['Siddur Ashkenaz', 'Weekday', 'Shacharit'])
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Siddur Ashkenaz, Weekday')
        self.assertIn('Preparatory Prayers', data['children'])
        self.assertIn('Amidah', data['children'])

    def test_deep_complex_segment(self):
        """Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Modeh Ani 2 - deep segment"""
        response = c.get('/api/ref/Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Modeh Ani 2')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['node_type'], 'JaggedArrayNode')
        self.assertEqual(data['depth'], 1)
        self.assertEqual(data['lineage_titles_top_down'], ['Siddur Ashkenaz', 'Weekday', 'Shacharit', 'Preparatory Prayers', 'Modeh Ani'])
        self.assertEqual(data['start_indexes'], [2])
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Modeh Ani')
        self.assertEqual(data['navigation_refs']['prev_segment_ref'], 'Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Modeh Ani 1')
        self.assertEqual(data['navigation_refs']['next_segment_ref'], 'Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Netilat Yadayim 1')

    def test_schema_node_with_default_child(self):
        """Ramban on Genesis - SchemaNode with default child JaggedArrayNode"""
        response = c.get('/api/ref/Ramban on Genesis')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['node_type'], 'SchemaNode')
        self.assertIn('Introduction', data['children'])
        self.assertIn('default_child_node', data)
        self.assertEqual(data['default_child_node']['node_type'], 'JaggedArrayNode')
        self.assertEqual(data['default_child_node']['depth'], 3)
        self.assertEqual(data['default_child_node']['node_index'], 2)

    def test_jagged_array_under_default_child(self):
        """Ramban on Genesis 1 - JaggedArrayNode under default child"""
        response = c.get('/api/ref/Ramban on Genesis 1')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['node_type'], 'JaggedArrayNode')
        self.assertEqual(data['depth'], 3)
        self.assertEqual(data['lineage_titles_top_down'], ['Ramban on Genesis', 'default'])
        self.assertEqual(data['start_indexes'], [1])
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Ramban on Genesis')

    def test_dictionary_node(self):
        """BDB - SchemaNode with default DictionaryNode child"""
        response = c.get('/api/ref/BDB')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['node_type'], 'SchemaNode')
        self.assertIsNone(data['navigation_refs']['parent_ref'])
        self.assertIn('default_child_node', data)
        self.assertEqual(data['default_child_node']['node_type'], 'DictionaryNode')

    def test_dictionary_entry_node(self):
        """BDB, א - DictionaryEntryNode"""
        response = c.get('/api/ref/BDB, א')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['node_type'], 'DictionaryEntryNode')
        self.assertEqual(data['index_title'], 'BDB')
        self.assertEqual(data['lexicon_name'], 'BDB Dictionary')
        self.assertEqual(data['headword'], 'א')
        self.assertEqual(data['lineage_titles_top_down'], ['BDB', 'א'])
        self.assertIsNone(data['navigation_refs']['prev_section_ref'])
        self.assertIsNotNone(data['navigation_refs']['next_section_ref'])

    def test_dictionary_entry_segment(self):
        """BDB, א 1 - DictionaryEntryNode segment-level"""
        response = c.get('/api/ref/BDB, אָב 1')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['node_type'], 'DictionaryEntryNode')
        self.assertEqual(data['start_indexes'], [1])
        self.assertEqual(data['navigation_refs']['parent_ref'], 'BDB, אָב')
        self.assertIsNotNone(data['navigation_refs']['prev_segment_ref'])
        self.assertIsNotNone(data['navigation_refs']['next_segment_ref'])
        self.assertNotIn('prev_section_ref', data['navigation_refs'])
        self.assertNotIn('next_section_ref', data['navigation_refs'])

    def test_sheet_node(self):
        """Sheet 1 - SheetNode"""
        response = c.get('/api/ref/Sheet 1')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['node_type'], 'SheetNode')
        self.assertEqual(data['sheet_id'], 1)
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Sheet')
        self.assertEqual(data['navigation_refs']['first_subref'], 'Sheet 1:1')

    def test_sheet_segment(self):
        """Sheet 1:1 - SheetNode segment-level"""
        response = c.get('/api/ref/Sheet 1:1')
        data = json.loads(response.content)
        self.assertTrue(data['is_ref'])
        self.assertEqual(data['node_type'], 'SheetNode')
        self.assertEqual(data['sheet_id'], 1)
        self.assertEqual(data['navigation_refs']['parent_ref'], 'Sheet 1')
