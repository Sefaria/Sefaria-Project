"""
Shared pytest fixtures for the api/ test suite.

All fixtures here use the default function scope. That means pytest creates a
brand-new instance for every single test that requests one. This is the
foundation of test independence: one test's mutations (logged-in state,
created users, modified mock newsletters) cannot leak into the next test.

If you ever feel tempted to add `scope="module"` or `scope="session"` to
speed something up, stop and think hard. A module-scoped Client() means every
test in the file shares the same login state. A session-scoped User row
exists across the whole test run and tests can interfere with each other's
profile state. Function scope keeps tests honest.

Database isolation is provided by pytest-django: every test marked with
@pytest.mark.django_db (or in a class so marked) is wrapped in a transaction
that's rolled back at the end of the test. So `test_user` creates a real
User row, but the row is undone before the next test starts.
"""

import pytest
from django.test import Client
from django.contrib.auth.models import User


@pytest.fixture
def client():
    """A fresh Django test client per test. No login, no cookies, no state."""
    return Client()


@pytest.fixture
def test_user():
    """
    Create the standard test user (testuser@sefaria.org / testpass123).

    Requires @pytest.mark.django_db on the test (or its enclosing class) so
    pytest-django sets up the test database and rolls back the User row when
    the test ends.
    """
    user = User.objects.create_user(
        username='testuser@sefaria.org',
        email='testuser@sefaria.org',
        password='testpass123',
    )
    user.first_name = 'Test'
    user.last_name = 'User'
    user.save()
    return user


@pytest.fixture
def test_user_no_name():
    """
    Like test_user, but with empty first_name and last_name. Used by tests
    that exercise the default-name fallback (e.g. when AC needs a first_name
    but the user hasn't set one in their profile).
    """
    user = User.objects.create_user(
        username='testuser@sefaria.org',
        email='testuser@sefaria.org',
        password='testpass123',
    )
    user.first_name = ''
    user.last_name = ''
    user.save()
    return user


@pytest.fixture
def logged_in_client(client, test_user):
    """
    A fresh Django test client already logged in as the standard test user.

    Composes the function-scoped `client` and `test_user` fixtures, so each
    test that uses this gets its own client AND its own user — no state
    bleeds across tests.
    """
    client.login(email='testuser@sefaria.org', password='testpass123')
    return client


@pytest.fixture
def mock_newsletters():
    """
    Standard 4-newsletter list used as the mocked AC response in most tests.

    Returns a fresh list per test, so a test that mutates this list (e.g.
    appending an entry) won't affect other tests.
    """
    return [
        {
            'id': '1',
            'stringid': 'sefaria_news',
            'displayName': 'Sefaria News & Resources',
            'icon': 'news-and-resources.svg',
            'language': 'english',
        },
        {
            'id': '3',
            'stringid': 'text_updates',
            'displayName': 'New Text Updates',
            'icon': 'new-text-release-updates.svg',
            'language': 'english',
        },
        {
            'id': '5',
            'stringid': 'parashah_series',
            'displayName': 'Weekly Parashah Study Series',
            'icon': 'weekly-study-guide.svg',
            'language': 'english',
        },
        {
            'id': '7',
            'stringid': 'educator_resources',
            'displayName': 'Educator Resources',
            'icon': 'educator-resources.svg',
            'language': 'english',
        },
    ]
