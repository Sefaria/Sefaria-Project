from unittest.mock import patch, Mock
from django.test import TestCase, RequestFactory
from django.contrib.auth.models import AnonymousUser
from django.http import HttpResponse
import sefaria.system.middleware as middleware_module
from django.contrib.auth import get_user_model

User = get_user_model()


class ApiKeyMiddlewareTestBase(TestCase):
    def setUp(self):
        self.user = User.objects.create(username="mockuser")

        self.anonymous_request = RequestFactory().get("/")
        self.anonymous_request.user = AnonymousUser()
        self.logged_in_request = RequestFactory().get("/")
        self.logged_in_request.user = self.user
        self.get_response = lambda r: HttpResponse("ok")

        self.mock_apikeys = Mock()
        self.mock_apikeys.find_one.return_value = {"uid": self.user.id}
        self.mock_get_user = patch.object(middleware_module.User.objects, "get", return_value=self.user).start()
        self.patch_db = patch.object(middleware_module.db, "apikeys", self.mock_apikeys).start()

        self.addCleanup(patch.stopall)


class ApiKeyMiddlewareTests(ApiKeyMiddlewareTestBase):
    def test_middleware_authenticated_with_valid_apikey(self):
        request = self.anonymous_request
        request.META["HTTP_X_APIKEY"] = "valid-key"

        mw = middleware_module.ApiKeyAuthenticationMiddleware(self.get_response)
        response = mw(request)

        self.mock_apikeys.find_one.assert_called_once_with({"key": "valid-key"})
        self.mock_get_user.assert_called_once_with(id=self.user.id)

        self.assertTrue(request.is_api_authenticated)
        self.assertEqual(request.user.username, "mockuser")
        self.assertTrue(request.user.is_authenticated)
        self.assertEqual(response.status_code, 200)

    def test_middleware_invalid_apikey_does_not_authenticate(self):
        request = self.anonymous_request
        request.META["HTTP_X_APIKEY"] = "invalid-key"
        self.mock_get_user.side_effect = User.DoesNotExist

        mw = middleware_module.ApiKeyAuthenticationMiddleware(self.get_response)
        response = mw(request)

        self.mock_apikeys.find_one.assert_called_once_with({"key": "invalid-key"})
        self.mock_get_user.assert_called_once_with(id=self.user.id)

        self.assertFalse(request.is_api_authenticated)
        self.assertTrue(isinstance(self.anonymous_request.user, AnonymousUser))
        self.assertFalse(request.user.is_authenticated)
        self.assertEqual(response.status_code, 200)

    def test_middleware_logged_out_user_without_apikey_provided(self):
        request = self.anonymous_request

        mw = middleware_module.ApiKeyAuthenticationMiddleware(self.get_response)
        response = mw(request)

        self.assertFalse(request.is_api_authenticated)
        self.assertFalse(request.user.is_authenticated)
        self.assertEqual(response.status_code, 200)

    def test_middleware_logged_in_user_without_apikey_provided(self):
        request = self.logged_in_request

        mw = middleware_module.ApiKeyAuthenticationMiddleware(self.get_response)
        response = mw(request)

        self.assertFalse(request.is_api_authenticated)
        self.assertEqual(request.user, self.user)
        self.assertTrue(request.user.is_authenticated)
        self.assertEqual(response.status_code, 200)
