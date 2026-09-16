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
    def __init__(self):
        self.replaced = 0

    def replace_one(self, query, doc, upsert=False):
        self.replaced += 1


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


def test_save_is_safe_when_user_not_cached(profile):
    public_user_data_cache.pop(FAKE_UID, None)
    profile.save()   # must not raise
    assert FAKE_UID not in public_user_data_cache


def test_save_leaves_other_users_cached(profile):
    other = FAKE_UID - 1
    public_user_data_cache[FAKE_UID] = {"name": "Old Name"}
    public_user_data_cache[other] = {"name": "Someone Else"}
    try:
        profile.save()
        assert FAKE_UID not in public_user_data_cache
        assert public_user_data_cache[other] == {"name": "Someone Else"}
    finally:
        public_user_data_cache.pop(other, None)


def test_save_evicts_after_writing(profile):
    """Eviction must run after the DB writes, so a concurrent repopulate can't
    re-cache the pre-save values."""
    public_user_data_cache[FAKE_UID] = {"name": "Old Name"}
    profile.save()
    assert up.db.profiles.replaced == 1
    assert FAKE_UID not in public_user_data_cache


# --- The _public_data_updated guard -------------------------------------------
#
# save() runs on every reading-history sync (profile_sync_api bumps last_sync_web),
# but the multiserver channel is sized for rare admin events and every listener
# publishes a confirmation back. So a broadcast must fire only when a field that
# public_user_data() actually exposes has changed.

def _flag_after_update(updates, **initial):
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
    for k, v in initial.items():
        setattr(p, k, v)
    p.update(updates)
    return p._public_data_updated


@pytest.mark.parametrize("updates", [
    {"first_name": "New", "last_name": "Name"},
    {"slug": "new-slug"},
    {"profile_pic_url_small": "new.png"},
    {"position": "Rabbi"},
    {"organization": "Sefaria"},
])
def test_public_field_change_sets_flag(updates):
    assert _flag_after_update(updates) is True


@pytest.mark.parametrize("updates", [
    {"last_sync_web": 1234567890},       # the profile_sync_api hot path
    {"bio": "a new bio"},
    {"website": "https://example.com"},
])
def test_private_field_change_does_not_set_flag(updates):
    assert _flag_after_update(updates) is False


def test_rewriting_same_value_does_not_set_flag():
    """A no-op write must not broadcast."""
    assert _flag_after_update({"position": "Rabbi"}, position="Rabbi") is False


def test_public_data_fields_match_what_public_user_data_exposes():
    """
    Guard against drift: if someone adds a field to public_user_data()'s payload,
    it has to be added to public_data_fields too, or edits to it go un-broadcast.
    """
    assert set(UserProfile.public_data_fields) == {
        "first_name", "last_name", "slug",
        "profile_pic_url_small", "position", "organization",
    }


# --- Remote dispatch -----------------------------------------------------------

def test_coordinator_can_resolve_the_remote_target():
    """
    The coordinator dispatches with `obj = locals()[data["obj"]]`, so the published
    (obj, method) pair must actually resolve inside _process_message.
    """
    import inspect
    from sefaria.system.multiserver import coordinator

    src = inspect.getsource(coordinator.ServerCoordinator._process_message)
    assert "from sefaria.model import user_profile" in src
    assert callable(up.invalidate_public_user_data_cache)


def test_invalidate_function_evicts_and_tolerates_missing_uid():
    public_user_data_cache[FAKE_UID] = {"name": "Old Name"}
    up.invalidate_public_user_data_cache(FAKE_UID)
    assert FAKE_UID not in public_user_data_cache
    up.invalidate_public_user_data_cache(FAKE_UID)   # second call must not raise


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
