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


class PagesTest(TestCase):
    def setUp(self):
        global c
        c = Client()

    def test_root(self):
        response = c.get('/')
        self.assertEqual(200, response.status_code)

    def test_activity(self):
        response = c.get('/activity')
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

    def test_login(self):
        response = c.post('/login/', {'username': 'john', 'password': 'smith'})
        self.assertEqual(200, response.status_code)


class ApiTest(TestCase):
    def setUp(self):
        global c
        c = Client()

    def test_api_get_text_tanakh(self):
        response = c.get('/api/texts/Genesis.1')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"], "Genesis")

    def test_api_get_text_talmud(self):
        response = c.get('/api/texts/Shabbat.32a')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)

    def test_api_get_text_tanakh_commentary(self):
        response = c.get('/api/texts/Rashi_on_Genesis.2.3')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)

    def test_api_get_text_talmud_commentary(self):
        response = c.get('/api/texts/Tosafot_on_Sukkah.2a.1.1')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)

    def text_api_get_index(self):
        response = c.get('/api/index/Job')
        self.assertEqual(200, response.status_code)        
        data = json.loads(response.content)

    def text_api_get_commentator_index(self):
        response = c.get('/api/index/Rashi')
        self.assertEqual(200, response.status_code)  
        data = json.loads(response.content)

    def text_api_get_toc(self):
        response = c.get('/api/index')
        self.assertEqual(200, response.status_code)  
        data = json.loads(response.content)

    def text_api_get_books(self):
        response = c.get('/api/index/titles/')
        self.assertEqual(200, response.status_code)  
        data = json.loads(response.content)
        self.assertTrue(len(data["books"]) > 0)


class PostTest(TestCase):
    def setUp(self):
        user = User.objects.create_user(username="test@sefaria.org", email='test@sefaria.org', password='!!!')
        user.set_password('!!!')
        user.first_name = "Test"
        user.last_name  = "Testerberg"
        user.save()
        self.c = Client()
        self.c.login(email="test@sefaria.org", password="!!!")

    def test_logged_in(self):
        response = self.c.get('/')
        self.assertTrue(response.content.find("accountMenuName") > -1)

    def test_post_index(self):
        orig = json.loads(self.c.get("/api/index/Job").content)
        new = deepcopy(orig)
        new["titleVariants"].append("Boj")
        response = self.c.post("/api/index/Job", {'json': json.dumps(new)})
        self.assertEqual(200, response.status_code)
        response = self.c.get("/api/index/titles")
        data = json.loads(response.content)
        self.assertTrue("Boj" in data["books"])

        self.c.post("/api/index/Job", {'json': json.dumps(orig)})


