import pytest
from unittest.mock import patch, MagicMock

mock_topics_pool = {'sheets_topic_only': ['sheets', 'general_en', 'torah_tab'],
 'library_topic_only': ['library'],
 'sheets_and_library_topic': ['library', 'sheets', 'general_en']}


def mock_get_pools(self):
    return mock_topics_pool.get(self.slug, [])

patch("sefaria.model.topic.Topic.get_pools", mock_get_pools).start()

def pytest_configure(config):
    import sys
    import django
    sys._called_from_test = True
    django.setup()

    # The `vector_db` (pgvector) database is an external Postgres that is not
    # provisioned for the test run. Leaving it in DATABASES makes pytest-django's
    # setup_databases() attempt to create a test database for it, which fails auth
    # and errors every DB-backed test at setup. Drop it here (before any test DB is
    # set up) so the suite runs against `default` only. The pgvector-specific tests
    # are skipped separately. Remove this once pgvector is reachable in CI.
    from django.conf import settings as _dj_settings
    from django.db import connections as _dj_connections
    _dj_settings.DATABASES.pop("vector_db", None)
    # Bust the ConnectionHandler's cached settings so the popped alias is really gone.
    _dj_connections.__dict__.pop("settings", None)


def pytest_unconfigure(config):
    import sys
    del sys._called_from_test


@pytest.fixture(autouse=True)
def _block_salesforce_webhook():
    """Prevent any test from making real HTTP calls to the Salesforce webhook."""
    with patch("sefaria.helper.crm.tasks.requests.post") as mock_post:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"success": True}),
            raise_for_status=MagicMock(),
        )
        yield mock_post
