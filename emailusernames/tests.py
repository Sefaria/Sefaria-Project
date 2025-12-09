from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.test import TestCase
from emailusernames.utils import create_user


class CreateUserTests(TestCase):
    """
    Tests which create users.
    """
    def setUp(self):
        self.email = 'user@example.com'
        self.password = 'password'

    def test_can_create_user(self):
        user = create_user(self.email, self.password)
        self.assertEquals(list(User.objects.all()), [user])

    def test_can_create_user_with_long_email(self):
        padding = 'a' * 30
        create_user(padding + self.email, self.password)

    def test_created_user_has_correct_details(self):
        user = create_user(self.email, self.password)
        self.assertEquals(user.email, self.email)

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
        self.assertEquals(self.user, auth)

    def test_user_can_authenticate_with_case_insensitive_match(self):
        auth = authenticate(email=self.email.upper(), password=self.password)
        self.assertEquals(self.user, auth)

    def test_user_can_authenticate_with_username_parameter(self):
        auth = authenticate(username=self.email, password=self.password)
        self.assertEquals(self.user, auth)
        # Invalid username should be ignored
        auth = authenticate(email=self.email, password=self.password,
                            username='invalid')
        self.assertEquals(self.user, auth)

    def test_user_emails_are_unique(self):
        with self.assertRaises(IntegrityError) as ctx:
            create_user(self.email, self.password)
        if hasattr(ctx.exception, 'message'):
            self.assertEquals(ctx.exception.message, 'user email is not unique')
        else:
            self.assertEquals(str(ctx.exception), 'user email is not unique')

    def test_user_emails_are_case_insensitive_unique(self):
        with self.assertRaises(IntegrityError) as ctx:
            create_user(self.email.upper(), self.password)
        if hasattr(ctx.exception, 'message'):
            self.assertEquals(ctx.exception.message, 'user email is not unique')
        else:
            self.assertEquals(str(ctx.exception), 'user email is not unique')

    def test_user_unicode(self):
        if isinstance(self.email, str):
            self.assertEquals(str(self.user), self.email)
        else:
            self.assertEquals(unicode(self.user), self.email)
