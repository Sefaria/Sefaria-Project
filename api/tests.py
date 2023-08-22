from django.test.client import Client
import django
django.setup()
from reader.tests import SefariaTestCase
import json
from api.helper import split_query_param_and_add_defaults
from api.api_errors import APIWarningCode


def test_split_at_pipe_with_default():
    for string, list_length, default, expected in [
        ('he|foo bar', 2, [], ['he', 'foo bar']),
        ('he|foo bar', 2, ['baz'], ['he', 'foo bar']),
        ('he', 2, ['baz'], ['he', 'baz']),
        ('he|foo bar|baz', 3, [], ['he', 'foo bar', 'baz']),
        ('he|foo bar|baz', 3, ['blue'], ['he', 'foo bar', 'baz']),
        ('he|foo bar', 3, ['baz'], ['he', 'foo bar', 'baz']),
        ('he', 3, ['foo', 'baz'], ['he', 'foo', 'baz']),
    ]:
        assert expected == split_query_param_and_add_defaults(string, list_length, default)


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

    def test_api_get_text_lang_all(self):
        response = c.get('/api/v3/texts/Rashi_on_Genesis.2.3?version=en|all')
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
        response = c.get('/api/v3/texts/Tosafot_on_Sukkah.2a.4.1?version=he|Vilna_Edition')
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

    def test_api_get_text_base_all(self):
        response = c.get('/api/v3/texts/Genesis.1?version=base|all')
        data = json.loads(response.content)
        self.assertTrue(len(data["versions"]) > 3)
        self.assertTrue(all(v['actualLanguage'] == 'he' for v in data["versions"]))

    def test_api_get_text_two_params(self):
        response = c.get('/api/v3/texts/Genesis.1?version=he|Tanach with Nikkud&version=en|all')
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

    def test_api_get_text_bad_text(self):
        response = c.get('/api/v3/texts/Life_of_Pi.13.13')
        self.assertEqual(400, response.status_code)
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
        self.assertEqual(400, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Couldn't understand text sections: 'Job.6-X'.")

    def test_api_get_text_empty_ref(self):
        response = c.get("/api/v3/texts/Berakhot.1a")
        self.assertEqual(400, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "We have no text for Berakhot 1a.")

    def test_api_get_text_no_source(self):
        response = c.get("/api/v3/texts/The_Book_of_Maccabees_I.1?version=en|Brenton's_Septuagint&version=source")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data['errors'][0]['source']['error_code'], APIWarningCode.APINoSourceText.value)
        self.assertEqual(data['errors'][0]['source']['message'], 'We do not have the source text for The Book of Maccabees I 1')

    def test_api_get_text_no_language(self):
        response = c.get("/api/v3/texts/The_Book_of_Maccabees_I.1?version=en|Brenton's_Septuagint&version=sgrg|all")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data['errors'][0]['sgrg|all']['error_code'], APIWarningCode.APINoLanguageVersion.value)
        self.assertEqual(data['errors'][0]['sgrg|all']['message'],
                         "We do not have the code language you asked for The Book of Maccabees I 1. Available codes are ['en', 'he']")

    def test_api_get_text_no_version(self):
        response = c.get("/api/v3/texts/The_Book_of_Maccabees_I.1?version=en|Brenton's_Septuagint&version=he|Kishkoosh")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data['errors'][0]['he|Kishkoosh']['error_code'], APIWarningCode.APINoVersion.value)
        self.assertEqual(data['errors'][0]['he|Kishkoosh']['message'],
                         'We do not have version named Kishkoosh with language code he for The Book of Maccabees I 1')
