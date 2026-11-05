"""
GET /api/library-assistant (reader/views.py library_assistant_api): the new reader's source for the Library Assistant's token
and eligibility, the same rule and token as base_props.
"""
from django.test import TestCase

from reader.conftest import create_test_user, purge_test_profiles
from sefaria.helper import library_assistant
from reader.views import CHATBOT_USER_ID_SECRET as SECRET  # the value the view signs with (imported at module load)
from sefaria.utils.chatbot import get_user_id_from_chatbot_user_token


class LibraryAssistantApiTest(TestCase):
    databases = "__all__"
    url = "/api/library-assistant"

    def setUp(self):
        self.user = create_test_user("la-api")
        purge_test_profiles(self.user)

    def tearDown(self):
        purge_test_profiles(self.user)

    def test_signed_out_gets_nothing(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"enabled": False, "userToken": None, "isModerator": False})
        self.assertIn("no-store", res["Cache-Control"])

    def test_signed_in_without_the_assistant_gets_no_token(self):
        library_assistant.set_enabled(self.user, False)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(self.url).json()["userToken"], None)

    def test_signed_in_with_the_assistant_gets_a_token_naming_them(self):
        library_assistant.set_enabled(self.user, True)
        self.client.force_login(self.user)
        body = self.client.get(self.url).json()
        self.assertTrue(body["enabled"])
        self.assertEqual(get_user_id_from_chatbot_user_token(body["userToken"], SECRET), self.user.id)
        self.assertIn("private", self.client.get(self.url)["Cache-Control"])

    def test_only_get(self):
        self.assertEqual(self.client.post(self.url).status_code, 405)
