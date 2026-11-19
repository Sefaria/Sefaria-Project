"""Automatic seeding after `migrate` (PLAN.md §7.6)."""

import sys
from unittest import mock

import pytest
from django.db import connection

from devportal import apps as devportal_apps
from devportal.adapters import spec as spec_adapter
from devportal.models import Page, PortalState
from devportal.services import seed

from . import content_helpers

source = content_helpers.source  # a fixture

pytestmark = pytest.mark.django_db


def test_auto_seed_is_off_under_pytest(settings):
    settings.DEVPORTAL_AUTO_SEED = True
    assert seed.auto_seed_enabled() is False  # pytest is loaded
    settings.DEVPORTAL_AUTO_SEED = False
    assert seed.auto_seed_enabled() is False


def test_auto_seed_enabled_outside_pytest(settings, monkeypatch):
    settings.DEVPORTAL_AUTO_SEED = True
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delitem(sys.modules, "pytest")
    assert seed.auto_seed_enabled() is True


def test_hook_does_nothing_when_disabled():
    with mock.patch.object(seed, "auto_seed") as auto:
        devportal_apps.seed_after_migrate(sender=None, using="default")
    auto.assert_not_called()
    assert not Page.objects.exists()


def test_hook_seeds_when_enabled(source):
    with (
        mock.patch.object(seed, "auto_seed_enabled", return_value=True),
        mock.patch.object(seed, "SOURCE_DIR", source),
    ):
        devportal_apps.seed_after_migrate(sender=None, using="default")
    assert Page.objects.count() == 160
    state = PortalState.load()
    assert state.snapshot_sha == seed.snapshot_sha(source)
    assert state.spec_sha == spec_adapter.spec_sha()
    assert state.last_seed_error == ""
    assert state.last_seed_at is not None


def test_auto_seed_runs_once_per_snapshot(source):
    assert seed.auto_seed(source).startswith("imported: 160")
    assert seed.auto_seed(source) == "up to date"
    target = source / "docs" / "SEFARIA RESEARCH" / "patot.md"
    target.write_text(target.read_text(encoding="utf-8") + "\nNew.\n", encoding="utf-8")
    assert seed.auto_seed(source) == "imported: 1 changes"


def test_auto_seed_rerenders_when_only_the_renderer_changed(source):
    seed.auto_seed(source)
    with mock.patch("devportal.adapters.markdown.renderer_version", return_value="v-next"):
        assert seed.auto_seed(source) == "re-rendered"
        assert seed.auto_seed(source) == "up to date"


def test_auto_seed_is_safe_mode(source):
    seed.auto_seed(source)
    (source / "docs" / "SEFARIA RESEARCH" / "patot.md").unlink()
    seed.auto_seed(source)
    assert Page.objects.get(slug="patot").deleted_at is None  # never prunes


def test_failure_is_stored_and_never_raised(source):
    stub = source / "reference" / "Sefaria API" / "ref" / "get-ref.md"
    stub.write_text(stub.read_text(encoding="utf-8").replace("get-ref", "get-nope"), encoding="utf-8")
    status = seed.auto_seed(source)
    assert status == "failed: SourceError"
    state = PortalState.load()
    assert "get-nope" in state.last_seed_error
    assert not Page.objects.exists()


def test_hook_swallows_unexpected_errors():
    with (
        mock.patch.object(seed, "auto_seed_enabled", return_value=True),
        mock.patch.object(seed, "auto_seed", side_effect=RuntimeError("boom")),
    ):
        devportal_apps.seed_after_migrate(sender=None, using="default")  # does not raise


def test_in_process_guard_prevents_reentry(source):
    with seed._Lock(connection) as outer:  # noqa: SLF001
        assert outer.acquired
        assert seed.auto_seed(source) == "skipped: another process is seeding"
    assert seed.auto_seed(source).startswith("imported")
