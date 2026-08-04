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
    """Enough of a UserProfile for the read rules: an id and a settings dict."""

    def __init__(self, settings=None, id=1):
        self.id = id
        self.settings = settings if settings is not None else {}
        self.email = "user@example.com"


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


def test_absent_key_is_not_enabled():
    # Every account carries the key; a profile without it has yet to be migrated.
    assert library_assistant.is_enabled(FakeProfile(settings={})) is False


def test_stored_string_false_is_not_truthy():
    assert library_assistant.is_enabled(FakeProfile(settings={SETTING_KEY: "false"})) is False


def test_stored_true_is_enabled():
    assert library_assistant.is_enabled(FakeProfile(settings={SETTING_KEY: True})) is True


class _SaveableProfile(FakeProfile):
    def update(self, obj):
        self.settings.update(obj.get("settings", {}))
        return self

    def save(self):
        return self


@pytest.fixture
def saveable_profile():
    profile = _SaveableProfile()
    with mock.patch("sefaria.helper.library_assistant.UserProfile", return_value=profile):
        yield profile


def test_set_enabled_writes_the_key(saveable_profile):
    library_assistant.set_enabled(mock.Mock(id=1), False)
    assert saveable_profile.settings[SETTING_KEY] is False


def test_set_enabled_coerces_before_writing(saveable_profile):
    library_assistant.set_enabled(mock.Mock(id=1), "false")
    assert saveable_profile.settings[SETTING_KEY] is False
