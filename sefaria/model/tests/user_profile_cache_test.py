"""
Tests for the public_user_data cache: clearing on UserProfile.save(), expiry, and
when a save is broadcast to other servers.

These run save() against a stub DB (no Mongo, no Postgres), so they need no
database fixtures.
"""
import time

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
    public_user_data_cache[FAKE_UID] = (time.monotonic() + 60, {"name": "Old Name"})
    profile.save()
    assert FAKE_UID not in public_user_data_cache


def test_unexpired_entry_is_returned(profile):
    public_user_data_cache[FAKE_UID] = (time.monotonic() + 60, {"name": "Name"})
    assert up._get_cached_public_user_data(FAKE_UID) == {"name": "Name"}


def test_expired_entry_is_dropped(profile):
    public_user_data_cache[FAKE_UID] = (time.monotonic() - 1, {"name": "Old Name"})
    assert up._get_cached_public_user_data(FAKE_UID) is None
    assert FAKE_UID not in public_user_data_cache


# --- The _public_data_updated flag --------------------------------------------
#
# profile_sync_api saves a profile on every reading-history sync, so a save is
# broadcast only when a field that public_user_data() exposes has changed.

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


def test_none_and_empty_string_are_not_a_change():
    assert _flag_after_update({"position": None, "organization": None}) is False


def test_update_empty_ignores_fields_it_skips():
    p = UserProfile.__new__(UserProfile)
    p._name_updated = False
    p._process_remove_history = False
    p._public_data_updated = False
    p.settings = {}
    p.first_name, p.last_name = "Old", "Name"
    p.organization = ""
    # first_name is already set, so update_empty() leaves it alone
    p.update_empty({"first_name": "Other"})
    assert p._public_data_updated is False
    assert p.first_name == "Old"
    # organization is empty, so update_empty() fills it in
    p.update_empty({"organization": "Sefaria"})
    assert p._public_data_updated is True
    assert p.organization == "Sefaria"


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


class _FakeRedis(object):
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(key)

    def set(self, key, value):
        self.store[key] = value


def test_public_data_change_clears_other_processes_cache(monkeypatch):
    from sefaria.system.cache import GenCache

    redis = _FakeRedis()
    writer = GenCache(redis, check_interval_seconds=0, jitter_max_seconds=0)
    peer = GenCache(redis, check_interval_seconds=0, jitter_max_seconds=0)
    peer_cache = {FAKE_UID: (time.monotonic() + 600, {"name": "Old Name"})}
    peer.register(up.PUBLIC_USER_DATA_GEN_KEY, peer_cache.clear)
    peer.get(up.PUBLIC_USER_DATA_GEN_KEY)  # first access records the current generation
    peer_cache[FAKE_UID] = (time.monotonic() + 600, {"name": "Old Name"})

    peer.get(up.PUBLIC_USER_DATA_GEN_KEY)
    assert FAKE_UID in peer_cache, "no bump yet, so the peer keeps its entry"

    monkeypatch.setattr(up, "gen_cache", writer)
    writer.register(up.PUBLIC_USER_DATA_GEN_KEY, lambda: None)
    p = UserProfile.__new__(UserProfile)
    p._publish_public_data_invalidation()

    peer.get(up.PUBLIC_USER_DATA_GEN_KEY)
    assert FAKE_UID not in peer_cache
