"""Shared pytest setup for the portal's tests.

Works under both settings modules the suite runs with: `sefaria.settings` (the sandbox job,
where `./devportal` is collected after `./sefaria`, or alone) and
`devportal.dev.settings_standalone` (local loops and the plain-runner CI job). Tests under
`tests/pure/` need no Django; nothing here imports Django unless it is already configured.
"""

import os


def pytest_configure(config):
    try:
        from django.conf import settings
    except ImportError:  # a plain runner without Django
        return
    if not (settings.configured or os.environ.get("DJANGO_SETTINGS_MODULE")):
        return

    # As in sefaria/conftest.py, which only runs when ./sefaria is collected: the `vector_db`
    # (pgvector) alias points at an external Postgres that is not provisioned for test runs, and
    # pytest-django would try to create a test database for it. Drop it before any database is
    # set up so the suite also runs on its own.
    from django.db import connections

    settings.DATABASES.pop("vector_db", None)
    connections.__dict__.pop("settings", None)

    # The post_migrate seeding hook must not import the content snapshot into test databases.
    settings.DEVPORTAL_AUTO_SEED = False
