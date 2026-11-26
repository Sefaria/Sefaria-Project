import json
import sys
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth.models import User
from django.test import Client, TestCase, override_settings
from jwt.algorithms import RSAAlgorithm

sys._called_from_test = True

from sefaria.utils.chatbot import MCP_LOGIN_TOKEN_AUDIENCE, MCP_TOKEN_AUDIENCE, build_chatbot_user_token
from sso import social_token, views

TOKEN_URL = "/api/social/token"
JWKS_URL = "/.well-known/sefaria-social-jwks.json"
ISSUER = "https://www.example.test"


def _rsa_pem(bits=2048):
    key = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    return key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode("ascii")


# Generated once per test run; never a real key.
PEM_CURRENT = _rsa_pem()
PEM_PREVIOUS = _rsa_pem()
TWO_KEYS = [{"kid": "current", "pem": PEM_CURRENT}, {"kid": "previous", "pem": PEM_PREVIOUS}]
LOCMEM_CACHE = {
    alias: {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": f"social-token-tests-{alias}"}
    for alias in ("default", "shared")
}

CHATBOT_SECRET = "test-chatbot-secret"
MCP_SECRET = "test-user-mcp-secret"


def _mcp_token(user_id, aud=MCP_TOKEN_AUDIENCE, ttl_hours=5 / 60):
    return build_chatbot_user_token(user_id, MCP_SECRET, ttl_hours=ttl_hours, aud=aud)


FAKE_PROFILE = {"name": "Test Person", "imageUrl": "https://images.example.test/u/1.png"}


def _public_key_from_jwks(jwks, kid):
    jwk = next(k for k in jwks["keys"] if k["kid"] == kid)
    return RSAAlgorithm.from_jwk(json.dumps(jwk))


@override_settings(SOCIAL_TOKEN_PRIVATE_KEYS=TWO_KEYS, SOCIAL_TOKEN_ISSUER=ISSUER, CACHES=LOCMEM_CACHE)
@patch("sso.views.public_user_data", return_value=FAKE_PROFILE)
class SocialTokenViewTest(TestCase):
    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.user = User.objects.create_user(username="social@test.com", email="social@test.com", password="pw")
        self.client = Client(enforce_csrf_checks=True)

    def _signed_in_csrf_client(self):
        self.client.force_login(self.user)
        self.client.get(JWKS_URL)  # any request; the CSRF token comes from the cookie we set below
        from django.middleware.csrf import _get_new_csrf_string

        token = _get_new_csrf_string()
        self.client.cookies["csrftoken"] = token
        return token

    def _mint(self):
        csrf = self._signed_in_csrf_client()
        return self.client.post(TOKEN_URL, HTTP_X_CSRFTOKEN=csrf)

    def test_signed_out_is_401_json(self, _profile):
        client = Client()  # CSRF not enforced, so the 401 comes from the view
        res = client.post(TOKEN_URL)
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json(), {"error": "auth.not_authenticated"})

    def test_csrf_required(self, _profile):
        self.client.force_login(self.user)
        res = self.client.post(TOKEN_URL)
        self.assertEqual(res.status_code, 403)

    def test_get_not_allowed(self, _profile):
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(TOKEN_URL).status_code, 405)

    def test_chatbot_x_session_id_auth_is_not_enough(self, _profile):
        # A user set from the chatbot's own X-Session-ID token has no session login, so it can't mint.
        token = build_chatbot_user_token(self.user.id, CHATBOT_SECRET)
        with override_settings(CHATBOT_USER_ID_SECRET=CHATBOT_SECRET, MCP_TOKEN_SECRET=MCP_SECRET):
            res = Client().post(TOKEN_URL, HTTP_X_SESSION_ID=token)
        self.assertEqual(res.status_code, 401)

    def _mcp_post(self, token, path=TOKEN_URL):
        # enforce_csrf_checks: the mcp route must not need a CSRF token.
        with override_settings(CHATBOT_USER_ID_SECRET=CHATBOT_SECRET, MCP_TOKEN_SECRET=MCP_SECRET):
            return Client(enforce_csrf_checks=True).post(path, HTTP_X_SESSION_ID=token)

    def test_mcp_token_mints_a_token_marked_via_mcp(self, _profile):
        res = self._mcp_post(_mcp_token(self.user.id))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Cache-Control"], "no-store")
        claims = jwt.decode(res.json()["token"], verify=False)
        self.assertEqual(claims["via"], "mcp")
        self.assertEqual(claims["sub"], str(self.user.id))
        self.assertEqual(claims["aud"], "sefaria-social")

    def test_session_token_has_no_via_claim(self, _profile):
        claims = jwt.decode(self._mint().json()["token"], verify=False)
        self.assertNotIn("via", claims)

    # A token the middleware does not accept leaves the request signed out, so CSRF applies again
    # and the request is refused (403) before the view; with CSRF off the view answers 401.
    def _assert_refused(self, token):
        self.assertEqual(self._mcp_post(token).status_code, 403)
        with override_settings(CHATBOT_USER_ID_SECRET=CHATBOT_SECRET, MCP_TOKEN_SECRET=MCP_SECRET):
            self.assertEqual(Client().post(TOKEN_URL, HTTP_X_SESSION_ID=token).status_code, 401)

    def test_mcp_login_token_is_refused(self, _profile):
        self._assert_refused(_mcp_token(self.user.id, aud=MCP_LOGIN_TOKEN_AUDIENCE))

    def test_expired_mcp_token_is_refused(self, _profile):
        self._assert_refused(_mcp_token(self.user.id, ttl_hours=-1))

    def test_mcp_token_for_inactive_user_is_refused(self, _profile):
        self.user.is_active = False
        self.user.save()
        self._assert_refused(_mcp_token(self.user.id))

    def test_mcp_token_counts_against_the_rate_limit(self, _profile):
        with patch.object(views, "SOCIAL_TOKEN_RATE_LIMIT", 1):
            statuses = [self._mcp_post(_mcp_token(self.user.id)).status_code for _ in range(2)]
        self.assertEqual(statuses, [200, 429])

    def test_token_verifies_with_published_jwks_and_has_claims(self, _profile):
        res = self._mint()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Cache-Control"], "no-store")
        body = res.json()
        self.assertEqual(set(body), {"token", "expires_at"})

        header = jwt.get_unverified_header(body["token"])
        self.assertEqual(header["alg"], "RS256")
        self.assertEqual(header["kid"], "current")

        jwks = Client().get(JWKS_URL).json()
        public_key = _public_key_from_jwks(jwks, header["kid"])
        claims = jwt.decode(body["token"], public_key, algorithms=["RS256"], audience="sefaria-social", issuer=ISSUER)

        self.assertEqual(claims["sub"], str(self.user.id))
        self.assertNotEqual(claims["sub"], self.user.username)
        self.assertEqual(claims["aud"], "sefaria-social")
        self.assertEqual(claims["iss"], ISSUER)
        self.assertEqual(claims["name"], "Test Person")
        self.assertEqual(claims["picture"], "https://images.example.test/u/1.png")
        self.assertIs(claims["staff"], False)
        self.assertEqual(claims["exp"] - claims["iat"], 600)
        self.assertEqual(claims["exp"], body["expires_at"])
        self.assertTrue(claims["jti"])

    def test_token_does_not_verify_with_the_other_key(self, _profile):
        token = self._mint().json()["token"]
        jwks = Client().get(JWKS_URL).json()
        with self.assertRaises(jwt.InvalidSignatureError):
            jwt.decode(token, _public_key_from_jwks(jwks, "previous"), algorithms=["RS256"], audience="sefaria-social")

    def test_staff_claim(self, _profile):
        self.user.is_staff = True
        self.user.save()
        claims = jwt.decode(self._mint().json()["token"], verify=False)
        self.assertIs(claims["staff"], True)

    def test_picture_omitted_when_not_an_absolute_url(self, profile):
        profile.return_value = {"name": "No Picture", "imageUrl": ""}
        claims = jwt.decode(self._mint().json()["token"], verify=False)
        self.assertNotIn("picture", claims)

    def test_jti_is_unique(self, _profile):
        first = jwt.decode(self._mint().json()["token"], verify=False)
        second = jwt.decode(self._mint().json()["token"], verify=False)
        self.assertNotEqual(first["jti"], second["jti"])

    @override_settings(SOCIAL_TOKEN_PRIVATE_KEYS=[])
    def test_503_without_keys(self, _profile):
        res = self._mint()
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json(), {"error": "social_token_not_configured"})

    def test_rate_limited_per_user(self, _profile):
        csrf = self._signed_in_csrf_client()
        with patch.object(views, "SOCIAL_TOKEN_RATE_LIMIT", 2):
            statuses = [self.client.post(TOKEN_URL, HTTP_X_CSRFTOKEN=csrf).status_code for _ in range(3)]
            self.assertEqual(statuses, [200, 200, 429])
            res = self.client.post(TOKEN_URL, HTTP_X_CSRFTOKEN=csrf)
        self.assertEqual(res["Retry-After"], str(views.SOCIAL_TOKEN_RATE_WINDOW_SECONDS))


class SocialJwksViewTest(TestCase):
    @override_settings(SOCIAL_TOKEN_PRIVATE_KEYS=TWO_KEYS)
    def test_lists_every_configured_key_signing_key_first(self):
        res = Client().get(JWKS_URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Cache-Control"], "public, max-age=300")
        keys = res.json()["keys"]
        self.assertEqual([k["kid"] for k in keys], ["current", "previous"])
        for key in keys:
            self.assertEqual({key["kty"], key["use"], key["alg"]}, {"RSA", "sig", "RS256"})
            self.assertEqual(set(key), {"kty", "use", "alg", "kid", "n", "e"})  # no private parts

    @override_settings(SOCIAL_TOKEN_PRIVATE_KEYS=[])
    def test_empty_without_keys(self):
        self.assertEqual(Client().get(JWKS_URL).json(), {"keys": []})

    def test_post_not_allowed(self):
        self.assertEqual(Client().post(JWKS_URL).status_code, 405)


class SocialTokenKeyLoadingTest(TestCase):
    def test_invalid_pem_disables_all_keys(self):
        with override_settings(SOCIAL_TOKEN_PRIVATE_KEYS=[TWO_KEYS[0], {"kid": "bad", "pem": "not a pem"}]):
            self.assertEqual(social_token.configured_keys(), ())

    def test_duplicate_kid_disables_all_keys(self):
        with override_settings(SOCIAL_TOKEN_PRIVATE_KEYS=[TWO_KEYS[0], {"kid": "current", "pem": PEM_PREVIOUS}]):
            self.assertEqual(social_token.configured_keys(), ())

    def test_small_rsa_key_rejected(self):
        with override_settings(SOCIAL_TOKEN_PRIVATE_KEYS=[{"kid": "small", "pem": _rsa_pem(1024)}]):
            self.assertEqual(social_token.configured_keys(), ())

    def test_issuer_defaults_to_english_library_origin(self):
        modules = {"en": {"library": "https://www.example.test/"}, "he": {"library": "https://www.example.test.il"}}
        with override_settings(SOCIAL_TOKEN_ISSUER="", DOMAIN_MODULES=modules):
            self.assertEqual(social_token.social_token_issuer(), "https://www.example.test")
