"""
Run me with:
python manage.py test reader
"""
from copy import deepcopy
from pprint import pprint

from django.test import TestCase
from django.test.client import Client
from django.utils import simplejson as json
from django.contrib.auth.models import User
#import selenium


c = Client()


class PagesTest(TestCase):
    def setUp(self):
        pass

    def test_root(self):
        response = c.get('/')
        self.assertEqual(200, response.status_code)

    def test_activity(self):
        response = c.get('/activity')
        self.assertEqual(200, response.status_code)

    def test_text_history(self):
        response = c.get('/activity/Genesis_12/en/The_Holy_Scriptures:_A_New_Translation_(JPS_1917)')
        self.assertEqual(200, response.status_code)

    def test_toc(self):
        response = c.get('/texts')
        self.assertEqual(200, response.status_code)

    def test_dashboard(self):
        response = c.get('/dashboard')
        self.assertEqual(200, response.status_code)

    def test_get_text_tanakh(self):
        response = c.get('/Genesis.1')
        self.assertEqual(200, response.status_code)

    def test_get_text_talmud(self):
        response = c.get('/Shabbat.32a')
        self.assertEqual(200, response.status_code)

    def test_get_text_tanakh_commentary(self):
        response = c.get('/Rashi_on_Genesis.2.3')
        self.assertEqual(200, response.status_code)

    def test_get_talmud_commentary(self):
        response = c.get('/Tosafot_on_Sukkah.2a.1.1')
        self.assertEqual(200, response.status_code)

    def test_sheets_splash(self):
        response = c.get('/sheets')
        self.assertEqual(200, response.status_code)

    def test_new_sheet(self):
        response = c.get('/sheets/new')
        self.assertEqual(200, response.status_code)

    def test_profile(self):
        response = c.get('/profile/brett-lockspeiser')
        self.assertEqual(200, response.status_code)

    def test_campaign(self):
        response = c.get('/translate/Midrash')
        self.assertEqual(200, response.status_code)

    def test_explorer(self):
        response = c.get('/explore')
        self.assertEqual(200, response.status_code)

    def test_login(self):
        response = c.post('/login/', {'username': 'john', 'password': 'smith'})
        self.assertEqual(200, response.status_code)


class ApiTest(TestCase):
    def setUp(self):
        pass

    def test_api_get_text_tanakh(self):
        response = c.get('/api/texts/Genesis.1')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["text"]) > 0)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"],       "Genesis")
        self.assertEqual(data["categories"], ["Tanach", "Torah"])
        self.assertEqual(data["sections"],   [1])
        self.assertEqual(data["toSections"], [1])

    def test_api_get_text_talmud(self):
        response = c.get('/api/texts/Shabbat.22a')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["text"]) > 0)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"],       "Shabbat")
        self.assertEqual(data["categories"], ["Talmud", "Bavli", "Seder Moed"])
        self.assertEqual(data["sections"],   ["22a"])
        self.assertEqual(data["toSections"], ["22a"])

    def test_api_get_text_tanakh_commentary(self):
        response = c.get('/api/texts/Rashi_on_Genesis.2.3')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"],        "Rashi on Genesis")
        self.assertEqual(data["commentator"], "Rashi")
        self.assertEqual(data["categories"],  ["Commentary", "Tanach", "Torah", "Genesis"])
        self.assertEqual(data["sections"],    [2,3])
        self.assertEqual(data["toSections"],  [2,3])

    def test_api_get_text_talmud_commentary(self):
        response = c.get('/api/texts/Tosafot_on_Sukkah.2a.1.1')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"],        "Tosafot on Sukkah")
        self.assertEqual(data["commentator"], "Tosafot")
        self.assertEqual(data["categories"],  ["Commentary", "Talmud", "Bavli", "Seder Moed", "Sukkah"])
        self.assertEqual(data["sections"],    ["2a", 1, 1])
        self.assertEqual(data["toSections"],  ["2a", 1, 1])

    def test_api_get_text_range(self):
        response = c.get('/api/texts/Job.5:2-4')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["sections"],   [5, 2])
        self.assertEqual(data["toSections"], [5, 4])

    def test_api_get_text_bad_text(self):
        response = c.get('/api/texts/Protocols_of_the_Elders_of_Zion.13.13')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "No book named 'Protocols of the Elders of Zion'.")

    def test_api_get_text_out_of_bound(self):
        response = c.get('/api/texts/Genesis.999')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Genesis only has 50 Chapters.")

    def test_api_get_text_too_many_hyphens(self):
        response = c.get('/api/texts/Genesis.9-4-5')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Couldn't understand ref 'Genesis.9-4-5' (too many -'s).")

    def test_api_get_text_bad_sections(self):
        response = c.get('/api/texts/Job.6-X')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Couldn't understand text sections: 'Job.6-X'.")

    def text_api_get_index(self):
        response = c.get('/api/index/Job')
        self.assertEqual(200, response.status_code)        
        data = json.loads(response.content)
        self.assertEqual(data["title"],        "Job")
        self.assertEqual(data["sectionNames"], ["Chapter", "Verse"])
        self.assertEqual(data["categories"],   ["Tanach", "Writings"])

    def text_api_get_commentator_index(self):
        response = c.get('/api/index/Rashi')
        self.assertEqual(200, response.status_code)  
        data = json.loads(response.content)
        self.assertEqual(data["title"],      "Rashi")
        self.assertEqual(data["categories"], ["Commentary"])

    def text_api_get_toc(self):
        response = c.get('/api/index')
        self.assertEqual(200, response.status_code)  
        data = json.loads(response.content)
        self.assertTrue(len(data) > 10)
        self.assertTrue(data[0]["category"] == "Tanach")
        self.assertTrue(data[0]["contents"][0]["category"] == "Torah")
        self.assertTrue(len(data[0]["contents"][0]["contents"]) == 5)
        self.assertTrue(data[-1]["category"] == "Other")

    def text_api_get_books(self):
        response = c.get('/api/index/titles/')
        self.assertEqual(200, response.status_code)  
        data = json.loads(response.content)
        self.assertTrue(len(data["books"]) > 1000)
        test_names = ("Genesis", "Sukkah", "Ex.", "Mishlei", "Mishnah Peah")
        for name in test_names:
            self.assertTrue(name in data["books"])


class PostTest(TestCase):
    def setUp(self):
        user = User.objects.create_user(username="test@sefaria.org", email='test@sefaria.org', password='!!!')
        user.set_password('!!!')
        user.first_name = "Test"
        user.last_name  = "Testerberg"
        user.save()
        c.login(email="test@sefaria.org", password="!!!")

    def test_logged_in(self):
        response = c.get('/')
        self.assertTrue(response.content.find("accountMenuName") > -1)

    def test_post_index(self):
        orig = json.loads(c.get("/api/index/Job").content)
        new = deepcopy(orig)
        new["titleVariants"].append("Boj")
        response = c.post("/api/index/Job", {'json': json.dumps(new)})
        self.assertEqual(200, response.status_code)
        response = c.get("/api/index/titles")
        data = json.loads(response.content)
        self.assertTrue("Boj" in data["books"])

        c.post("/api/index/Job", {'json': json.dumps(orig)})
        response = c.get("/api/index/titles")
        data = json.loads(response.content)
        self.assertTrue("Boj" not in data["books"])

