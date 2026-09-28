"""
Regression tests for public_user_data cache invalidation on profile save.

`public_user_data()` memoizes name / pic / position / organization in a plain
module-level dict. Before UserProfile.save() evicted the saved user's entry, a
profile edit left that entry in place, so sheets, notes and collections kept
rendering the pre-edit values for the life of the worker process — most visibly
as a stale author name in a sheet's `authorStatement`.

These exercise save() in isolation (no Mongo, no Postgres) so they stay fast and
run without database fixtures.
"""
import pytest

from sefaria.model import user_profile as up
from sefaria.model.user_profile import UserProfile, public_user_data_cache


FAKE_UID = 999999999


class _FakeProfiles(object):
    def replace_one(self, query, doc, upsert=False):
        pass


class _FakeDB(object):
    def __init__(self):
        self.profiles = _FakeProfiles()


@pytest.fixture
def profile(monkeypatch):
    """A UserProfile whose save() writes to a stub DB and skips the cascades."""
    p = UserProfile.__new__(UserProfile)   # bypass __init__, which hits both DBs
    p.id = FAKE_UID
    p._id = "fake-mongo-id"                # truthy -> save() takes the replace_one path
    p.bio = ""
    p._name_updated = False
    p._process_remove_history = False
    p._public_data_updated = False
    monkeypatch.setattr(p, "to_mongo_dict", lambda: {})
    monkeypatch.setattr(up, "db", _FakeDB())

    yield p

    public_user_data_cache.pop(FAKE_UID, None)


def test_save_evicts_cached_entry(profile):
    public_user_data_cache[FAKE_UID] = {"name": "Old Name"}
    profile.save()
    assert FAKE_UID not in public_user_data_cache


# --- The _public_data_updated guard -------------------------------------------
#
# save() runs on every reading-history sync (profile_sync_api bumps last_sync_web),
# but the multiserver channel is sized for rare admin events and every listener
# publishes a confirmation back. So a broadcast must fire only when a field that
# public_user_data() actually exposes has changed.

def _flag_after_update(updates):
    """Run UserProfile.update() over a bare profile and report the broadcast flag."""
    p = UserProfile.__new__(UserProfile)
    p._name_updated = False
    p._process_remove_history = False
    p._public_data_updated = False
    p.settings = {}
    p.first_name, p.last_name = "Old", "Name"
    p.slug = "old-slug"
    p.profile_pic_url_small = "old.png"
    p.position, p.organization = "", ""
    p.update(updates)
    return p._public_data_updated


def test_public_field_change_sets_flag():
    assert _flag_after_update({"first_name": "New", "last_name": "Name"}) is True


def test_sync_timestamp_change_does_not_set_flag():
    assert _flag_after_update({"last_sync_web": 1234567890}) is False


def test_save_broadcasts_only_when_flagged(profile, monkeypatch):
    published = []
    monkeypatch.setattr(
        UserProfile, "_publish_public_data_invalidation",
        lambda self: published.append(self.id))

    profile._public_data_updated = False
    profile.save()
    assert published == []

    profile._public_data_updated = True
    profile.save()
    assert published == [FAKE_UID]
    assert profile._public_data_updated is False, "flag must reset so it fires once"
