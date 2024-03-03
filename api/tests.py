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
