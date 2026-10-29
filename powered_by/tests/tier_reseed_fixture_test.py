"""
The conftest fixture reseeds api_tier before every test that touches the database, including tests
that get the database only from the `db` or `transactional_db` fixtures (directly or through another
fixture) and carry no django_db marker. pytest runs the tests of one file in order, so the flush at
the end of the first test empties api_tier before the second one starts.
"""
from types import SimpleNamespace

import pytest
from django.utils import timezone

from powered_by.models import ApiProject, Project, SubmissionSource
from powered_by.tests.conftest import _touches_database


def test_flush_at_teardown_empties_the_tiers(transactional_db):
    """Runs first. The transactional_db teardown flushes every table, api_tier included."""


@pytest.fixture
def database_through_another_fixture(transactional_db):
    return None


def test_fixture_only_test_after_a_flush_finds_the_developer_tier(database_through_another_fixture):
    profile = Project.objects.create(
        submission_source=SubmissionSource.MANUAL, submission_date=timezone.now(),
        project_name="Reseed", is_published=False)
    try:
        assert ApiProject.objects.create(profile=profile).tier_id == "developer"
    finally:
        ApiProject.objects.filter(profile=profile).delete()
        profile.delete()


@pytest.mark.parametrize("fixture_name", ["db", "transactional_db", "django_db_reset_sequences"])
def test_a_database_fixture_without_a_marker_counts_as_touching_the_database(fixture_name):
    request = SimpleNamespace(
        node=SimpleNamespace(get_closest_marker=lambda name: None), instance=None,
        fixturenames=["request", fixture_name])
    assert _touches_database(request)


def test_a_test_with_no_database_fixture_does_not_count():
    request = SimpleNamespace(
        node=SimpleNamespace(get_closest_marker=lambda name: None), instance=None,
        fixturenames=["request", "tmp_path"])
    assert not _touches_database(request)
