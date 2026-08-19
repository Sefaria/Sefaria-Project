# -*- coding: utf-8 -*-
"""
The Library Assistant setting's decision logic: how a profile reads and how a posted
value is coerced.
"""

from unittest import mock

import pytest

from sefaria.helper import library_assistant
from sefaria.helper.library_assistant import SETTING_KEY


class FakeProfile(object):
    """
    Enough of a UserProfile for the read rules: an id, a settings dict, the legacy
    `experiments` flag, and the Django user the whitelist lookup keys on.
    """

    def __init__(self, settings=None, experiments=False, user="a-user", id=1):
        self.id = id
        self.settings = settings if settings is not None else {}
        self.experiments = experiments
        self.user = user
        self.email = "user@example.com"


def whitelisted(has_row):
    return mock.patch("reader.models.user_has_experiments", return_value=has_row)


@pytest.mark.parametrize("value,expected", [
    (True, True),
    (1, True),
    ("true", True),
    ("True", True),
    ("on", True),
    (False, False),
    (0, False),
    ("false", False),
    ("False", False),
    (" FALSE ", False),
    ("0", False),
    ("off", False),
    ("no", False),
    ("", False),
    (None, False),
])
def test_normalize(value, expected):
    assert library_assistant.normalize(value) is expected


def test_no_profile_is_not_enabled():
    assert library_assistant.is_enabled(None) is False
    assert library_assistant.is_enabled(FakeProfile(id=None)) is False


def test_set_key_wins_over_the_legacy_rule():
    # On the whitelist and opted in, but the setting says off.
    with whitelisted(True):
        profile = FakeProfile(settings={SETTING_KEY: False}, experiments=True)
        assert library_assistant.is_enabled(profile) is False


def test_set_key_wins_when_legacy_would_say_off():
    with whitelisted(False):
        profile = FakeProfile(settings={SETTING_KEY: True}, experiments=False)
        assert library_assistant.is_enabled(profile) is True


def test_posted_string_false_in_a_stored_setting_is_not_truthy():
    with whitelisted(False):
        assert library_assistant.is_enabled(FakeProfile(settings={SETTING_KEY: "false"})) is False


@pytest.mark.parametrize("has_row,experiments,expected", [
    (True, True, True),      # on the whitelist and opted in — the only legacy "on"
    (True, False, False),    # deliberate opt-out
    (False, True, False),    # never enrolled; the stray Mongo flag means nothing
    (False, False, False),
])
def test_absent_key_falls_back_to_the_legacy_rule(has_row, experiments, expected):
    with whitelisted(has_row):
        profile = FakeProfile(settings={}, experiments=experiments)
        assert library_assistant.is_enabled(profile) is expected


def test_absent_key_and_no_django_user_is_not_enabled():
    with whitelisted(True):
        assert library_assistant.is_enabled(FakeProfile(user=None, experiments=True)) is False


class _SaveableProfile(FakeProfile):
    def update(self, obj):
        self.settings.update(obj.get("settings", {}))
        return self

    def save(self):
        return self


@pytest.fixture
def saveable_profile():
    profile = _SaveableProfile()
    with mock.patch("sefaria.model.user_profile.UserProfile", return_value=profile):
        yield profile


def test_set_enabled_writes_the_key(saveable_profile):
    with whitelisted(False):
        library_assistant.set_enabled(mock.Mock(id=1), False)
    assert saveable_profile.settings[SETTING_KEY] is False


def test_set_enabled_coerces_before_writing(saveable_profile):
    with whitelisted(False):
        library_assistant.set_enabled(mock.Mock(id=1), "false")
    assert saveable_profile.settings[SETTING_KEY] is False
