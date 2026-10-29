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


def _touches_database(request):
    if request.node.get_closest_marker("django_db") is not None:
        return True
    return isinstance(request.instance, TransactionTestCase)


@pytest.fixture(autouse=True)
def seed_api_tiers_before_each_test(request, django_db_blocker):
    if _touches_database(request):
        request.getfixturevalue("django_db_setup")
        with django_db_blocker.unblock():
            if "api_tier" in connection.introspection.table_names():
                SEED.seed_api_tiers(apps, using=connection.alias)
    yield
