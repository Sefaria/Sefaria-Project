"""Fixtures shared by the powered_by suite.

The API tier rows (developer, partner, internal and their semantic meter limits) come from migration
0006. CI runs pytest with --reuse-db, which keeps the test database without rerunning migrations, and
a TransactionTestCase flush at teardown empties api_tier. Without the rows, every API project insert
fails its foreign key. So before each database test this fixture re-runs the same seed the migration
uses. It is idempotent, and it skips while the tables do not exist (the migration tests drop and
rebuild them).
"""
import importlib

import pytest
from django.apps import apps
from django.db import connection
from django.test import TransactionTestCase

SEED = importlib.import_module("powered_by.migrations.0006_api_project_schema")


TRANSACTIONAL_FIXTURES = ("transactional_db", "django_db_reset_sequences")


def _touches_database(request):
    """True for a marked test, a TransactionTestCase, or a test that gets the database from a fixture.

    request.fixturenames includes fixtures pulled in transitively, so a test that reaches `db` or
    `transactional_db` through another fixture still counts.
    """
    if request.node.get_closest_marker("django_db") is not None:
        return True
    if isinstance(request.instance, TransactionTestCase):
        return True
    return any(name in request.fixturenames for name in ("db", *TRANSACTIONAL_FIXTURES))


def _initialize_database_fixture(request):
    """Make sure the database fixture the test needs is set up before seeding."""
    names = request.fixturenames
    if any(name in names for name in TRANSACTIONAL_FIXTURES):
        request.getfixturevalue("transactional_db")
    elif "db" in names:
        request.getfixturevalue("db")
    else:
        request.getfixturevalue("django_db_setup")


@pytest.fixture(autouse=True)
def seed_api_tiers_before_each_test(request, django_db_blocker):
    if _touches_database(request):
        _initialize_database_fixture(request)
        with django_db_blocker.unblock():
            if "api_tier" in connection.introspection.table_names():
                SEED.seed_api_tiers(apps, using=connection.alias)
    yield
