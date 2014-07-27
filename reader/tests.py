"""
Run me with:
python manage.py test reader
"""

from django.test import TestCase
from django.test.client import Client
#import selenium


class GetTest(TestCase):
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

    def test_api_get_text_tanakh(self):
        response = c.get('/api/texts/Genesis.1')
        self.assertEqual(200, response.status_code)

    def test_api_get_text_talmud(self):
        response = c.get('/api/texts/Shabbat.32a')
        self.assertEqual(200, response.status_code)

    def test_api_get_text_tanakh_commentary(self):
        response = c.get('/api/texts/Rashi_on_Genesis.2.3')
        self.assertEqual(200, response.status_code)

    def test_api_get_text_talmud_commentary(self):
        response = c.get('/api/texts/Tosafot_on_Sukkah.2a.1.1')
        self.assertEqual(200, response.status_code)

    def test_login(self):
        response = c.post('/login/', {'username': 'john', 'password': 'smith'})
        self.assertEqual(200, response.status_code)