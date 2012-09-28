from django.test import TestCase
from django.test.client import Client
import selenium

class GetTest(TestCase):
	def setUp(self):
		pass
		
	def test_get_text(self):
		response = self.client.get('/api/texts/Genesis.1')
		self.assertEqual(200, response.status_code)


	def test_login(self):
		response = self.client.post('/login/', {'username': 'john', 'password': 'smith'})
		self.assertEqual(200, response.status_code)