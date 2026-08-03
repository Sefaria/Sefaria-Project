# -*- coding: utf-8 -*-
"""
The Library Assistant setting's decision logic: how a profile reads, how a posted value
is coerced, and when the CRM hears about a change.
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
    # Every account is backfilled; a profile without the key has not been migrated.
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
    with mock.patch("sefaria.model.user_profile.UserProfile", return_value=profile):
        yield profile


def test_set_enabled_writes_the_key(saveable_profile):
    library_assistant.set_enabled(mock.Mock(id=1), False, notify_crm=False)
    assert saveable_profile.settings[SETTING_KEY] is False


def test_set_enabled_coerces_before_writing(saveable_profile):
    library_assistant.set_enabled(mock.Mock(id=1), "false", notify_crm=False)
    assert saveable_profile.settings[SETTING_KEY] is False


def test_crm_hears_about_a_real_change(saveable_profile):
    with mock.patch.object(library_assistant, "notify_crm_of_change") as notify:
        library_assistant.set_enabled(mock.Mock(id=1), True)
        assert notify.call_count == 1


def test_crm_does_not_hear_about_a_no_op(saveable_profile):
    saveable_profile.settings[SETTING_KEY] = True
    with mock.patch.object(library_assistant, "notify_crm_of_change") as notify:
        library_assistant.set_enabled(mock.Mock(id=1), True)
        assert notify.call_count == 0


def test_crm_hears_once_per_change(saveable_profile):
    with mock.patch.object(library_assistant, "notify_crm_of_change") as notify:
        library_assistant.set_enabled(mock.Mock(id=1), True)
        library_assistant.set_enabled(mock.Mock(id=1), True)
        library_assistant.set_enabled(mock.Mock(id=1), False)
        assert notify.call_count == 2


def test_backfill_does_not_notify_the_crm(saveable_profile):
    with mock.patch.object(library_assistant, "notify_crm_of_change") as notify:
        library_assistant.set_enabled(mock.Mock(id=1), True, notify_crm=False)
        assert notify.call_count == 0
