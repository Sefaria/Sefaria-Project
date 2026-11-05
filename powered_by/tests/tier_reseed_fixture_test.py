"""
The conftest fixture reseeds api_tier before every test that touches the database, including tests
that get the database only from the `db` or `transactional_db` fixtures (directly or through another
fixture) and carry no django_db marker. The sequence is controlled by
running a separate pytest process (pytester) in which each test empties api_tier first, so the
regression no longer depends on which test ran before it in the real suite.
"""
import os
from pathlib import Path
from types import SimpleNamespace

import pytest
from django.test import TransactionTestCase

from powered_by.tests.conftest import _permitted_aliases, _touches_database

pytest_plugins = ["pytester"]


INNER_TESTS = """
import pytest
from powered_by.models import ApiTier, ApiTierMeterLimit


def test_a_flush_empties_the_tiers(transactional_db):
    ApiTier.objects.all().delete()
    assert not ApiTier.objects.exists()


@pytest.fixture
def database_through_another_fixture(transactional_db):
    return None


def test_b_fixture_only_test_finds_the_tiers_after_the_flush(database_through_another_fixture):
    assert set(ApiTier.objects.values_list("id", flat=True)) == {"developer", "partner", "internal"}
    assert ApiTierMeterLimit.objects.filter(meter="semantic").count() == 3


def test_c_flush_again(transactional_db):
    ApiTier.objects.all().delete()


def test_d_plain_db_fixture_finds_the_tiers_after_the_flush(db):
    assert ApiTier.objects.filter(id="developer").exists()
    assert ApiTierMeterLimit.objects.filter(tier_id="developer", meter="semantic").exists()
"""

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFTEST = Path(__file__).with_name("conftest.py")
SEED_CALL = "SEED.seed_api_tiers(apps, using=alias)"


def _run_inner_suite(pytester, monkeypatch, conftest_source):
    """Run a fresh pytest process whose test order we control: each test empties api_tier first, so
    the tiers are missing at the start of the next one unless the conftest reseeds them."""
    monkeypatch.setenv("PYTHONPATH", os.pathsep.join(filter(None, [str(REPO_ROOT), os.environ.get("PYTHONPATH")])))
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", os.environ["DJANGO_SETTINGS_MODULE"])
    pytester.makeconftest(conftest_source)
    pytester.makepyfile(test_inner=INNER_TESTS)
    return pytester.runpytest_subprocess("--reuse-db", "-p", "no:cacheprovider", "-p", "no:randomly")


def test_reseeding_restores_tiers_that_a_previous_test_emptied(pytester, monkeypatch):
    source = CONFTEST.read_text()
    assert SEED_CALL in source
    result = _run_inner_suite(pytester, monkeypatch, source)
    result.assert_outcomes(passed=4)


def test_without_the_reseed_the_same_sequence_fails(pytester, monkeypatch):
    """Guards the guard: with the seed call removed, the emptied tiers really are missing in the next test."""
    source = CONFTEST.read_text().replace(SEED_CALL, "pass")
    assert source != CONFTEST.read_text()
    result = _run_inner_suite(pytester, monkeypatch, source)
    outcomes = result.parseoutcomes()
    assert outcomes.get("failed") == 2 and outcomes.get("passed") == 2


@pytest.mark.django_db(databases=[])
def test_a_test_that_allows_no_database_alias_is_not_forced_onto_default():
    """The fixture used to seed `default` regardless, raising DatabaseOperationForbidden in setup."""


class OtherAliasOnlyCase(TransactionTestCase):
    databases = {"other"}


def test_permitted_aliases_follow_the_marker_and_the_test_class():
    def request_for(databases=None, instance=None):
        marker = None if databases is None else SimpleNamespace(args=(), kwargs={"databases": databases})
        return SimpleNamespace(
            node=SimpleNamespace(get_closest_marker=lambda name: marker), instance=instance, fixturenames=[])

    assert _permitted_aliases(request_for()) == {"default"}
    assert _permitted_aliases(request_for(["other"])) == {"other"}
    assert _permitted_aliases(request_for([])) == set()
    assert "default" in _permitted_aliases(request_for("__all__"))
    assert _permitted_aliases(request_for(instance=OtherAliasOnlyCase())) == {"other"}


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
