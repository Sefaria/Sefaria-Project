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

    def test_get_text(self):
        response = c.get('/Genesis.1')
        self.assertEqual(200, response.status_code)

    def test_api_get_text(self):
        response = c.get('/api/texts/Genesis.1')
        self.assertEqual(200, response.status_code)

    def test_login(self):
        response = c.post('/login/', {'username': 'john', 'password': 'smith'})
        self.assertEqual(200, response.status_code)