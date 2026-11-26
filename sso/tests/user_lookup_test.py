import hashlib
import hmac
import json
import sys
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import RequestFactory, SimpleTestCase, override_settings

sys._called_from_test = True

from sso.user_lookup import MAX_BODY_BYTES, social_user_lookup

SECRET = "test-lookup-secret"


def _sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@override_settings(SOCIAL_LOOKUP_SECRET=SECRET)
class SocialUserLookupTest(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def _post(self, payload, signature=None, raw=None):
        body = raw if raw is not None else json.dumps(payload).encode()
        headers = {} if signature is False else {"HTTP_X_SEFARIA_SIGNATURE": signature or _sign(body)}
        request = self.factory.post("/api/social/user-lookup", data=body, content_type="application/json", **headers)
        return social_user_lookup(request)

    @patch("sso.user_lookup.get_user")
    def test_an_address_with_an_account_answers_its_id(self, get_user):
        get_user.return_value = User(pk=4242)
        response = self._post({"email": " Ben@Example.org "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content), {"user_id": 4242})
        self.assertEqual(response["Cache-Control"], "no-store")
        get_user.assert_called_once_with("Ben@Example.org")

    @patch("sso.user_lookup.get_user")
    def test_an_address_without_an_account_answers_404(self, get_user):
        get_user.side_effect = User.DoesNotExist
        response = self._post({"email": "nobody@example.org"})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(json.loads(response.content), {})

    @patch("sso.user_lookup.get_user")
    def test_a_missing_or_wrong_signature_is_refused_before_anything_is_read(self, get_user):
        self.assertEqual(self._post({"email": "a@example.org"}, signature=False).status_code, 401)
        self.assertEqual(self._post({"email": "a@example.org"}, signature="sha256=" + "0" * 64).status_code, 401)
        body = json.dumps({"email": "a@example.org"}).encode()
        self.assertEqual(self._post(None, signature=_sign(body, "other-secret"), raw=body).status_code, 401)
        get_user.assert_not_called()

    @patch("sso.user_lookup.get_user")
    def test_bad_bodies_are_refused(self, get_user):
        too_big = json.dumps({"email": "a" * MAX_BODY_BYTES + "@example.org"}).encode()
        self.assertEqual(self._post(None, raw=too_big).status_code, 400)
        self.assertEqual(self._post(None, raw=b"not json").status_code, 400)
        self.assertEqual(self._post({"email": ""}).status_code, 400)
        self.assertEqual(self._post({"email": 42}).status_code, 400)
        self.assertEqual(self._post(["a@example.org"]).status_code, 400)
        get_user.assert_not_called()

    def test_get_is_not_allowed(self):
        request = self.factory.get("/api/social/user-lookup")
        self.assertEqual(social_user_lookup(request).status_code, 405)

    @override_settings(SOCIAL_LOOKUP_SECRET=None)
    def test_without_a_secret_it_answers_503(self):
        self.assertEqual(self._post({"email": "a@example.org"}).status_code, 503)
