from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db import IntegrityError, connection
from django.test import TestCase
from emailusernames.utils import create_user, get_user, _email_to_username
from emailusernames.models import _patched


class CreateUserTests(TestCase):
    """
    Tests which create users.
    """
    def setUp(self):
        self.email = 'user@example.com'
        self.password = 'password'

    def test_can_create_user(self):
        user = create_user(self.email, self.password)
        self.assertEqual(list(User.objects.all()), [user])

    def test_can_create_user_with_long_email(self):
        padding = 'a' * 30
        create_user(padding + self.email, self.password)

    def test_created_user_has_correct_details(self):
        user = create_user(self.email, self.password)
        self.assertEqual(user.email, self.email)

    def test_can_create_user_with_explicit_id(self):
        """Regression test for
        https://github.com/dabapps/django-email-as-username/issues/52

        """
        User.objects.create(email=self.email, id=1)



class ExistingUserTests(TestCase):
    """
    Tests which require an existing user.
    """

    def setUp(self):
        self.email = 'user@example.com'
        self.password = 'password'
        self.user = create_user(self.email, self.password)

    def test_user_can_authenticate(self):
        auth = authenticate(email=self.email, password=self.password)
        self.assertEqual(self.user, auth)

    def test_user_can_authenticate_with_case_insensitive_match(self):
        auth = authenticate(email=self.email.upper(), password=self.password)
        self.assertEqual(self.user, auth)

    def test_user_can_authenticate_with_username_parameter(self):
        auth = authenticate(username=self.email, password=self.password)
        self.assertEqual(self.user, auth)
        # Invalid username should be ignored
        auth = authenticate(email=self.email, password=self.password,
                            username='invalid')
        self.assertEqual(self.user, auth)

    def test_user_emails_are_unique(self):
        with self.assertRaises(IntegrityError) as ctx:
            create_user(self.email, self.password)
        if hasattr(ctx.exception, 'message'):
            self.assertEqual(ctx.exception.message, 'user email is not unique')
        else:
            self.assertEqual(str(ctx.exception), 'user email is not unique')

    def test_user_emails_are_case_insensitive_unique(self):
        with self.assertRaises(IntegrityError) as ctx:
            create_user(self.email.upper(), self.password)
        if hasattr(ctx.exception, 'message'):
            self.assertEqual(ctx.exception.message, 'user email is not unique')
        else:
            self.assertEqual(str(ctx.exception), 'user email is not unique')

    def test_user_unicode(self):
        if isinstance(self.email, str):
            self.assertEqual(str(self.user), self.email)
        else:
            raise AssertionError("Test email is not a str type")


class MonkeyPatchTests(TestCase):
    """
    Tests for the User model monkey patching that enables email-as-username.

    The monkey patch ensures:
    - Usernames are stored as hashes in the database (to fit in 30 char limit)
    - Usernames are displayed as emails in Python (for UX)
    - Users can be looked up by email via get_user()
    """

    def setUp(self):
        self.email = 'monkeypatch_test@example.com'
        self.password = 'testpassword123'

    def test_monkey_patch_is_applied(self):
        """Verify that the monkey patch has been applied via AppConfig.ready()"""
        self.assertTrue(_patched, "Monkey patch should be applied after Django setup")
        self.assertEqual(User.__init__.__name__, 'user_init_patch')
        self.assertEqual(User.save_base.__name__, 'user_save_patch')

    def test_username_stored_as_hash_in_database(self):
        """Verify that the username is stored as a hash, not the raw email"""
        user = create_user(self.email, self.password)
        expected_hash = _email_to_username(self.email)

        # Query the database directly to see what's actually stored
        with connection.cursor() as cursor:
            cursor.execute('SELECT username FROM auth_user WHERE id = %s', [user.pk])
            row = cursor.fetchone()

        actual_username_in_db = row[0]
        self.assertEqual(actual_username_in_db, expected_hash,
            "Username in database should be the hash, not the raw email")
        self.assertNotEqual(actual_username_in_db, self.email,
            "Username in database should NOT be the raw email")

    def test_username_displayed_as_email_in_python(self):
        """Verify that user.username returns the email for display purposes"""
        user = create_user(self.email, self.password)

        # The username attribute should show the email (for admin "Welcome, username")
        self.assertEqual(user.username, self.email,
            "user.username should display as email after creation")

        # Reload from database and verify it still shows as email
        reloaded_user = User.objects.get(pk=user.pk)
        self.assertEqual(reloaded_user.username, self.email,
            "user.username should display as email after loading from DB")

    def test_get_user_lookup_by_email_works(self):
        """Verify that get_user() can find users by their email address"""
        user = create_user(self.email, self.password)

        # get_user internally converts email to hash for lookup
        found_user = get_user(self.email)
        self.assertEqual(found_user.pk, user.pk,
            "get_user() should find the user by email")

    def test_get_user_lookup_case_insensitive(self):
        """Verify that get_user() lookup is case-insensitive"""
        user = create_user(self.email, self.password)

        found_user = get_user(self.email.upper())
        self.assertEqual(found_user.pk, user.pk,
            "get_user() should find the user with case-insensitive email")
