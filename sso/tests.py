import sys
import json
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.test import TestCase, Client

sys._called_from_test = True

from allauth.socialaccount.models import SocialAccount, SocialLogin

from sso.adapters import SefariaSocialAccountAdapter, SefariaAccountAdapter


class EmailLoginTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.url = '/api/auth/login'

    def _post(self, body):
        return self.client.post(
            self.url,
            data=json.dumps(body),
            content_type='application/json',
        )

    def test_valid_login(self):
        User.objects.create_user(username='a@test.com', email='a@test.com', password='pass123')
        res = self._post({'email': 'a@test.com', 'password': 'pass123'})
        self.assertEqual(res.status_code, 200)
        self.assertIn('_auth_user_id', self.client.session)

    def test_wrong_password(self):
        User.objects.create_user(username='b@test.com', email='b@test.com', password='correct')
        res = self._post({'email': 'b@test.com', 'password': 'wrong'})
        self.assertEqual(res.status_code, 401)
        data = res.json()
        self.assertIn('error', data)
        self.assertNotIn('_auth', data)

    def test_unknown_email(self):
        res = self._post({'email': 'nobody@test.com', 'password': 'x'})
        self.assertEqual(res.status_code, 401)
        self.assertIn('error', res.json())

    def test_sso_only_account(self):
        user = User.objects.create_user(username='sso@test.com', email='sso@test.com', password='x')
        user.set_unusable_password()
        user.save()
        SocialAccount.objects.create(user=user, provider='google', uid='12345')

        res = self._post({'email': 'sso@test.com', 'password': 'anything'})
        self.assertEqual(res.status_code, 401)
        data = res.json()
        self.assertEqual(data['_auth']['code'], 'sso_only_account')
        self.assertIn('google', data['_auth']['providers'])

    def test_invalid_json(self):
        res = self.client.post(self.url, data='not-json', content_type='application/json')
        self.assertEqual(res.status_code, 400)


class PreSocialLoginTest(TestCase):
    def _make_sociallogin(self, email, is_existing=False):
        user = MagicMock()
        user.email = email
        sl = MagicMock(spec=SocialLogin)
        sl.is_existing = is_existing
        sl.user = user
        return sl

    def test_disables_password_on_email_collision(self):
        existing = User.objects.create_user(username='col@test.com', email='col@test.com', password='secret')
        self.assertTrue(existing.has_usable_password())

        adapter = SefariaSocialAccountAdapter()
        sl = self._make_sociallogin('col@test.com', is_existing=False)
        adapter.pre_social_login(MagicMock(), sl)

        existing.refresh_from_db()
        self.assertFalse(existing.has_usable_password())

    def test_skips_returning_user(self):
        existing = User.objects.create_user(username='ret@test.com', email='ret@test.com', password='secret')
        adapter = SefariaSocialAccountAdapter()
        sl = self._make_sociallogin('ret@test.com', is_existing=True)
        adapter.pre_social_login(MagicMock(), sl)

        existing.refresh_from_db()
        self.assertTrue(existing.has_usable_password())

    def test_no_op_for_new_email(self):
        adapter = SefariaSocialAccountAdapter()
        sl = self._make_sociallogin('brand@new.com', is_existing=False)
        adapter.pre_social_login(MagicMock(), sl)  # must not raise


class PopulateUsernameTest(TestCase):
    def test_sets_username_to_email(self):
        user = MagicMock()
        user.email = 'u@test.com'
        adapter = SefariaAccountAdapter()
        adapter.populate_username(MagicMock(), user)
        self.assertEqual(user.username, 'u@test.com')


class AppleCallbackTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.url = '/api/auth/apple/callback'

    def _post(self, body):
        return self.client.post(
            self.url,
            data=json.dumps(body),
            content_type='application/json',
        )

    def test_missing_id_token(self):
        res = self._post({})
        self.assertEqual(res.status_code, 400)

    def test_invalid_json(self):
        res = self.client.post(self.url, data='bad', content_type='application/json')
        self.assertEqual(res.status_code, 400)

    def test_invalid_token_returns_400(self):
        with patch('sso.views.get_social_adapter') as mock_get_adapter:
            provider = MagicMock()
            provider.verify_token.side_effect = Exception('bad token')
            mock_get_adapter.return_value.get_provider.return_value = provider
            res = self._post({'id_token': 'bogus'})
        self.assertEqual(res.status_code, 400)

    @patch('sso.views.complete_social_login')
    def test_success_injects_name(self, mock_complete):
        with patch('sso.views.get_social_adapter') as mock_get_adapter:
            sl = MagicMock()
            sl.user.first_name = ''
            sl.user.last_name = ''
            provider = MagicMock()
            provider.verify_token.return_value = sl
            mock_get_adapter.return_value.get_provider.return_value = provider

            def set_authenticated(request, sociallogin):
                request.user = MagicMock()
                request.user.is_authenticated = True

            mock_complete.side_effect = set_authenticated

            res = self._post({'id_token': 'valid', 'first_name': 'Alice', 'last_name': 'Smith'})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(sl.user.first_name, 'Alice')
        self.assertEqual(sl.user.last_name, 'Smith')

    @patch('sso.views.complete_social_login')
    def test_does_not_overwrite_existing_name(self, mock_complete):
        with patch('sso.views.get_social_adapter') as mock_get_adapter:
            sl = MagicMock()
            sl.user.first_name = 'Bob'
            sl.user.last_name = 'Jones'
            provider = MagicMock()
            provider.verify_token.return_value = sl
            mock_get_adapter.return_value.get_provider.return_value = provider
            mock_complete.side_effect = lambda req, s: None

            res = self._post({'id_token': 'valid', 'first_name': 'Other', 'last_name': 'Name'})

        self.assertEqual(sl.user.first_name, 'Bob')
        self.assertEqual(sl.user.last_name, 'Jones')
