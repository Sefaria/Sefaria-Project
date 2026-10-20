"""
Account merge integration tests.

These tests run the **real** merge_user_accounts() from start to finish. Only
the edges of the system are replaced:
    - MongoDB: each test gets its own throwaway database (see `merge_env`).
    - SQL: pytest-django undoes every row a test creates when the test ends.
    - CRM, search indexing, cache refresh, and the MERGE prompt are mocked.

Never point these tests at the application's Mongo database. Django only
isolates SQL during tests; Mongo has no automatic cleanup.

Where to put a new test:
    - A pure helper (one that only reads its inputs, like _profile_updates or
      _merged_roles): write a unit test in user_test.py instead. Those run
      without any database and are easier to read.
    - The staff web form (permissions, form errors, JSON responses): use
      sefaria/tests/account_merge_view_test.py.
    - How the steps work together against real data: here.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from django.contrib.auth.models import Group, Permission, User
from django.db import IntegrityError, connection, transaction
from django.test import override_settings

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount, SocialToken

from sefaria.system.database import client
from sefaria.system.exceptions import InputError
from sefaria.utils import user as user_utils


# ============================================================================
# Fixtures and helpers
# ============================================================================

@pytest.fixture
def merge_env(db, monkeypatch):
    """
    Two real Django users ("source" and "survivor") with profiles in a throwaway Mongo database.

    The fixture swaps user_utils.db for that database, so every MongoDB read and
    write in the merge goes there. The database is dropped when the test ends,
    even if the test fails.

    It also replaces anything that would reach outside the test:
        - UserProfile loading (it would read the application database)
        - delete_user_account (a merge must never call it; tests check this)
        - _refresh_merge_caches (tested on its own in TestCacheRefresh)
        - CrmMediator (would call Salesforce or NationBuilder)
        - input() (always answers MERGE, unless a test changes it)
    """
    mongo_name = "test_account_merge_" + uuid.uuid4().hex
    mongo = client[mongo_name]
    source = User.objects.create_user(username="merge-source", email="source@example.com")
    survivor = User.objects.create_user(username="merge-survivor", email="survivor@example.com")
    for account in (source, survivor):
        mongo.profiles.insert_one({"id": account.id, "slug": "profile-%s" % account.id})

    def load_profile(id):
        account = User.objects.get(id=id)
        return SimpleNamespace(
            _id=mongo.profiles.find_one({"id": id})["_id"],
            full_name=account.username, email=account.email,
        )

    monkeypatch.setattr(user_utils, "db", mongo)
    profiles = Mock(side_effect=load_profile)
    monkeypatch.setattr(user_utils, "model", SimpleNamespace(UserProfile=profiles))
    cleanup = Mock()
    monkeypatch.setattr(user_utils, "delete_user_account", cleanup)
    monkeypatch.setattr(user_utils, "_refresh_merge_caches", Mock(return_value=None))
    monkeypatch.setattr(user_utils.settings, "SEARCH_INDEX_ON_SAVE", False)
    monkeypatch.setattr(user_utils, "CrmMediator", Mock())
    monkeypatch.setattr("builtins.input", lambda _: "MERGE")
    try:
        yield SimpleNamespace(mongo=mongo, source=source, survivor=survivor,
                              profiles=profiles, cleanup=cleanup)
    finally:
        client.drop_database(mongo_name)


def merge(env):
    """Merge source into survivor without copying profile fields, as most tests need."""
    return user_utils.merge_user_accounts(env.source.id, env.survivor.id, fill_in_profile_data=False)


# ============================================================================
# Before the merge
# ============================================================================

class TestInputChecks:
    """Bad input is rejected before anything is loaded or changed."""

    def test_self_merge_is_rejected_before_loading_profiles(self, merge_env):
        """Merging an account into itself is refused, since it would delete the account"""
        env = merge_env
        with pytest.raises(InputError, match="must be different"):
            user_utils.merge_user_accounts(env.source.id, env.source.id)
        env.profiles.assert_not_called()
        env.cleanup.assert_not_called()

    def test_string_self_merge_is_rejected(self, merge_env):
        """A string ID like "12" is the same account as 12, so this is a self-merge too"""
        with pytest.raises(InputError, match="must be different"):
            user_utils.merge_user_accounts(str(merge_env.source.id), merge_env.source.id)

    @pytest.mark.parametrize("bad_id", [True, 1.5, "not-an-id", None])
    def test_invalid_ids_are_rejected(self, merge_env, bad_id):
        """Only integers and digit strings are accepted as account IDs"""
        with pytest.raises(InputError, match="IDs must be integers"):
            user_utils.merge_user_accounts(bad_id, merge_env.survivor.id)
        merge_env.profiles.assert_not_called()

    @pytest.mark.parametrize("missing", ["source", "survivor"])
    def test_missing_sql_user_stops_before_loading_profiles(self, merge_env, missing):
        """A Django user that doesn't exist stops the merge"""
        env = merge_env
        User.objects.filter(id=getattr(env, missing).id).delete()
        with pytest.raises(InputError, match="does not exist"):
            merge(env)
        env.profiles.assert_not_called()
        env.cleanup.assert_not_called()

    @pytest.mark.parametrize("missing", ["source", "survivor"])
    def test_missing_profile_is_not_created_by_merge(self, merge_env, missing):
        """A missing Mongo profile stops the merge, and the check doesn't create one"""
        env = merge_env
        env.mongo.profiles.delete_one({"id": getattr(env, missing).id})
        with pytest.raises(InputError, match="does not have a profile"):
            merge(env)
        assert env.mongo.profiles.count_documents({}) == 1
        env.profiles.assert_not_called()
        env.cleanup.assert_not_called()


class TestConfirmation:
    """The command line asks for MERGE; web callers confirm on their own."""

    def test_cancel_leaves_accounts_untouched(self, merge_env, monkeypatch):
        """Typing anything other than MERGE changes nothing"""
        env = merge_env
        env.mongo.user_history.insert_one({"uid": env.source.id})
        monkeypatch.setattr("builtins.input", lambda _: "CANCEL")
        merge(env)
        assert env.mongo.user_history.count_documents({"uid": env.source.id}) == 1
        env.cleanup.assert_not_called()

    def test_confirmed_web_call_never_reads_console_input(self, merge_env, monkeypatch):
        """confirm=False never waits for keyboard input, which would hang a web server"""
        env = merge_env
        console_input = Mock(side_effect=AssertionError("A web worker must not read stdin"))
        monkeypatch.setattr("builtins.input", console_input)
        result = user_utils.merge_user_accounts(env.source.id, env.survivor.id, confirm=False)
        console_input.assert_not_called()
        assert result == {"from_uid": env.source.id, "into_uid": env.survivor.id, "warnings": []}
        assert not User.objects.filter(pk=env.source.id).exists()


# ============================================================================
# What moves (and what doesn't)
# ============================================================================

class TestContentTransfer:
    """Everything the source owns or is credited with moves to the survivor."""

    def test_merge_moves_membership_in_every_collection(self, merge_env):
        """Admin and member roles move, and the source account is deleted"""
        env = merge_env
        env.mongo.groups.insert_many([
            {"admins": [env.source.id], "members": []},
            {"admins": [env.source.id], "members": []},
            {"admins": [], "members": [env.source.id]},
            {"admins": [], "members": [env.source.id]},
        ])
        env.mongo.user_history.insert_one({"uid": env.source.id})
        merge(env)
        assert env.mongo.groups.count_documents({"admins": env.survivor.id}) == 2
        assert env.mongo.groups.count_documents({"members": env.survivor.id}) == 2
        assert env.mongo.groups.count_documents({"$or": [
            {"admins": env.source.id}, {"members": env.source.id},
        ]}) == 0
        assert env.mongo.user_history.count_documents({"uid": env.survivor.id}) == 1
        assert not User.objects.filter(id=env.source.id).exists()
        assert env.mongo.profiles.find_one({"id": env.source.id}) is None
        env.cleanup.assert_not_called()  # General deletion would discard missed content.

    def test_collection_overlap_preserves_admin_and_removes_duplicates(self, merge_env):
        """When both accounts are in one collection, the survivor keeps the higher role once"""
        env = merge_env
        env.mongo.groups.insert_many([
            {"admins": [env.source.id, env.source.id], "members": [env.survivor.id, env.survivor.id],
             "publishers": [env.source.id, env.survivor.id]},
            {"admins": [env.survivor.id], "members": [env.source.id, 99]},
        ])
        merge(env)
        for group in env.mongo.groups.find():
            assert group["admins"] == [env.survivor.id]
            assert env.source.id not in group["members"]
            assert env.survivor.id not in group["members"]
            if "publishers" in group:
                assert group["publishers"] == [env.survivor.id]

    @pytest.mark.parametrize("collection,left,right", [
        ("following", "follower", "followee"), ("blocking", "blocker", "blockee"),
    ])
    def test_relationships_preserve_both_directions_without_duplicates_or_self_edges(
            self, merge_env, collection, left, right):
        """Follows and blocks move both ways, keeping the oldest copy and no self-follows"""
        env = merge_env
        env.mongo[collection].insert_many([
            {left: env.source.id, right: 99, "original": True},
            {left: env.survivor.id, right: 99},
            {left: 99, right: env.source.id},
            {left: env.source.id, right: env.survivor.id},
            {left: env.survivor.id, right: env.source.id},
        ])
        merge(env)
        edges = list(env.mongo[collection].find())
        assert {(edge[left], edge[right]) for edge in edges} == {(env.survivor.id, 99), (99, env.survivor.id)}
        assert len(edges) == 2
        assert env.mongo[collection].find_one({left: env.survivor.id, right: 99})["original"] is True

    def test_sheet_attribution_permissions_and_notification_actors_move(self, merge_env):
        """Sheet owners, likes, nested source credits, notes, history, and notifications all move"""
        env = merge_env
        env.mongo.sheets.insert_many([
            {"id": 100, "owner": env.source.id, "ownerName": "stale", "likes": [env.source.id, env.survivor.id]},
            {"id": 101, "owner": 99, "viaOwner": env.source.id, "viaOwnerName": "stale",
             "assigner_id": env.source.id, "assignerName": "stale", "sources": [
                 {"addedBy": env.source.id, "userLink": "stale", "subsources": [
                     {"subsources": [{"addedBy": env.source.id, "userLink": "stale"}]}]},
             ]},
        ])
        env.mongo.notes.insert_one({"owner": env.source.id, "text": "private"})
        env.mongo.history.insert_one({"user": env.source.id})
        for actor in ("liker", "publisher", "follower", "adder"):
            env.mongo.notifications.insert_one({"uid": env.source.id, "content": {actor: env.source.id}})
        merge(env)
        owned = env.mongo.sheets.find_one({"id": 100})
        assert owned["owner"] == env.survivor.id
        assert owned["likes"] == [env.survivor.id]
        assert "ownerName" not in owned
        attributed = env.mongo.sheets.find_one({"id": 101})
        assert attributed["owner"] == 99
        assert attributed["viaOwner"] == attributed["assigner_id"] == env.survivor.id
        assert "viaOwnerName" not in attributed and "assignerName" not in attributed
        assert attributed["sources"][0]["addedBy"] == env.survivor.id
        nested = attributed["sources"][0]["subsources"][0]["subsources"][0]
        assert nested == {"addedBy": env.survivor.id}
        assert env.mongo.notes.find_one()["owner"] == env.survivor.id
        assert env.mongo.history.find_one()["user"] == env.survivor.id
        for notification in env.mongo.notifications.find():
            assert notification["uid"] == env.survivor.id
            assert list(notification["content"].values()) == [env.survivor.id]

    def test_history_keeps_reading_events_and_reconciles_bookmarks_and_last_place(self, merge_env):
        """Every reading visit is kept; only the newest bookmark and last place stay switched on"""
        env = merge_env
        def history(uid, ref, read_at, synced_at, **extra):
            return dict(uid=uid, ref=ref, versions={"en": "translation"}, secondary=False,
                        book="Genesis", time_stamp=read_at, server_time_stamp=synced_at, **extra)
        env.mongo.user_history.insert_many([
            history(env.source.id, "Genesis 1:1", 100, 100, saved=True, last_place=True),
            history(env.survivor.id, "Genesis 1:1", 110, 200, saved=False, delete_saved=True),
            history(env.source.id, "Genesis 1:1", 120, 120, saved=False),  # Ordinary repeat visit.
            history(env.survivor.id, "Genesis 1:2", 300, 300, saved=True, last_place=True),
            history(env.source.id, "Genesis 1:2", 200, 300, saved=False, delete_saved=True),
        ])
        merge(env)
        records = list(env.mongo.user_history.find({"uid": env.survivor.id}))
        assert len(records) == 5  # No reading visits are lost to deduplication.
        assert sorted(r["time_stamp"] for r in records) == [100, 110, 120, 200, 300]
        assert env.mongo.user_history.count_documents({"saved": True}) == 1
        assert env.mongo.user_history.find_one({"saved": True})["ref"] == "Genesis 1:2"
        assert env.mongo.user_history.count_documents({"delete_saved": True}) == 1
        assert env.mongo.user_history.find_one({"delete_saved": True})["ref"] == "Genesis 1:1"
        assert env.mongo.user_history.count_documents({"last_place": True}) == 1
        assert env.mongo.user_history.find_one({"last_place": True})["time_stamp"] == 300
        assert all(r["server_time_stamp"] > 300 for r in records)

    def test_history_merge_loads_only_bookmarks_and_last_places(self, merge_env, monkeypatch):
        """Ordinary reading visits are moved in the database, never loaded into memory"""
        env = merge_env
        visits = [{"uid": env.source.id, "ref": "Genesis 1:%d" % verse} for verse in range(1, 51)]
        bookmarks = [{"uid": uid, "ref": "Exodus 1:1", "saved": True} for uid in (env.source.id, env.survivor.id)]
        env.mongo.user_history.insert_many(visits + bookmarks)
        # Record how many documents each user_history query matched when it ran.
        matched_counts = []
        collection_type = type(env.mongo.user_history)
        original_find = collection_type.find
        def counting_find(collection, filter=None, *args, **kwargs):
            if collection.name == "user_history":
                matched_counts.append(collection.count_documents(filter or {}))
            return original_find(collection, filter, *args, **kwargs)
        monkeypatch.setattr(collection_type, "find", counting_find)
        merge(env)
        assert matched_counts and max(matched_counts) <= len(bookmarks)
        assert env.mongo.user_history.count_documents({"uid": env.survivor.id}) == 52

    def test_search_refresh_is_queued_for_changed_sheets(self, merge_env, monkeypatch):
        """Sheets whose owner or credits changed are sent to be re-indexed for search"""
        from sefaria import search
        env = merge_env
        queue = Mock()
        monkeypatch.setattr(user_utils.settings, "SEARCH_INDEX_ON_SAVE", True)
        monkeypatch.setattr(search, "queue_sheets_sync", queue)
        env.mongo.sheets.insert_many([{"id": 100, "owner": env.source.id},
                                     {"id": 101, "owner": 99, "assigner_id": env.source.id}])
        merge(env)
        assert set(queue.call_args.args[0]) == {100, 101}

    def test_discussions_experiments_and_staff_audit_logs_do_not_transfer(self, merge_env):
        """Discussions and audit logs keep the old ID; trend totals are cleared to be rebuilt"""
        from reader.models import UserExperimentSettings
        env = merge_env
        UserExperimentSettings.objects.create(user=env.source, experiments=True)
        UserExperimentSettings.objects.create(user=env.survivor, experiments=False)
        env.mongo.layers.insert_one({"owner": env.source.id})
        env.mongo.linker_editor_history.insert_one({"uid": env.source.id, "action": "historical"})
        env.mongo.trend.insert_many([{"uid": env.source.id}, {"uid": env.survivor.id}, {"uid": 99}])
        merge(env)
        assert UserExperimentSettings.objects.get(user=env.survivor).experiments is False
        assert not UserExperimentSettings.objects.filter(user_id=env.source.id).exists()
        assert env.mongo.layers.find_one()["owner"] == env.source.id
        assert env.mongo.linker_editor_history.find_one()["uid"] == env.source.id
        assert list(env.mongo.trend.find({}, {"_id": 0})) == [{"uid": 99}]


class TestProfileData:
    """Profile fields follow the chosen mode; identity and private settings never move."""

    @pytest.mark.parametrize("fill,override,expected", [
        (True, False, "personal"), (True, True, "source"), (False, False, "personal"),
        (False, True, "source"),
    ])
    def test_profile_modes_protect_identity_and_credentials(self, merge_env, fill, override, expected):
        """No mode copies CRM IDs, logins, sync state, privacy settings, or unknown fields"""
        env = merge_env
        source_data = {
            "bio": '<script>unsafe</script><p>Source bio</p>', "location": "source",
            "sf_app_user_id": "work-crm", "nationbuilder_id": "work-nb", "gauth_token": {"token": "work"},
            "gauth_email": "work@example.com", "experiments": True, "is_sustainer": True,
            "last_sync_web": 999, "settings": {"reading_history": False},
            "pinned_sheets": [1, 2], "tag_order": ["a", "b"],
        }
        destination_data = {
            "bio": "", "location": "personal", "sf_app_user_id": "personal-crm",
            "nationbuilder_id": "personal-nb", "gauth_token": {"token": "personal"},
            "gauth_email": "personal@example.com", "experiments": False, "is_sustainer": False,
            "last_sync_web": 123, "attr_time_stamps": {"settings": 45},
            "settings": {"reading_history": True}, "custom_destination_field": "keep me",
            "pinned_sheets": [2, 3], "tag_order": ["b", "c"],
        }
        env.mongo.profiles.update_one({"id": env.source.id}, {"$set": source_data})
        env.mongo.profiles.update_one({"id": env.survivor.id}, {"$set": destination_data})
        original = env.mongo.profiles.find_one({"id": env.survivor.id})
        env.mongo.user_history.insert_one({"uid": env.source.id, "ref": "Genesis 1:1", "saved": False})
        user_utils.merge_user_accounts(env.source.id, env.survivor.id, fill, override)
        result = env.mongo.profiles.find_one({"id": env.survivor.id})
        for key in ("_id", "id", "slug", "sf_app_user_id", "nationbuilder_id", "gauth_token",
                    "gauth_email", "experiments", "is_sustainer", "last_sync_web", "attr_time_stamps",
                    "settings", "custom_destination_field"):
            assert result[key] == original[key], key
        assert result["location"] == expected
        assert "<script>" not in result["bio"]
        if fill or override:
            assert result["pinned_sheets"] == [2, 3, 1]
            assert result["tag_order"] == ["b", "c", "a"]
        else:
            assert result["pinned_sheets"] == [2, 3]
        assert env.mongo.user_history.count_documents({"uid": env.survivor.id}) == 1

    @pytest.mark.parametrize("override", [False, True])
    def test_nested_preferences_fill_or_override_without_copying_privacy(self, merge_env, override):
        """Reading settings and version preferences merge key by key; privacy settings never move"""
        env = merge_env
        env.mongo.profiles.update_one({"id": env.source.id}, {"$set": {
            "settings": {"reading_history": False, "textual_custom": "ashkenazi", "email_notifications": "never"},
            "version_preferences_by_corpus": {"Tanakh": {"en": "source", "he": "source-he"}},
        }})
        env.mongo.profiles.update_one({"id": env.survivor.id}, {"$set": {
            "settings": {"reading_history": True, "email_notifications": "daily", "textual_custom": "sephardi"},
            "version_preferences_by_corpus": {"Tanakh": {"en": "personal"}},
            "attr_time_stamps": {"settings": 45, "other": 67},
        }})
        user_utils.merge_user_accounts(env.source.id, env.survivor.id, override_profile_data=override)
        result = env.mongo.profiles.find_one({"id": env.survivor.id})
        assert result["settings"]["reading_history"] is True
        assert result["settings"]["email_notifications"] == "daily"
        assert result["settings"]["textual_custom"] == ("ashkenazi" if override else "sephardi")
        assert result["version_preferences_by_corpus"]["Tanakh"] == {
            "en": "source" if override else "personal", "he": "source-he",
        }
        assert result["attr_time_stamps"]["other"] == 67
        assert result["attr_time_stamps"]["settings"] == (pytest.approx(user_utils.time.time(), abs=10) if override else 45)

    def test_fill_copies_source_values_only_into_empty_destination_fields(self, merge_env):
        """Fill mode copies a cleaned bio and other values only where the destination is blank"""
        env = merge_env
        env.mongo.profiles.update_one({"id": env.source.id}, {"$set": {
            "bio": "<script>unsafe</script><p>Source bio</p>", "location": "source", "website": "source.example",
            "settings": {"interface_language": "hebrew"},
        }})
        env.mongo.profiles.update_one({"id": env.survivor.id}, {"$set": {
            "bio": "", "location": "personal", "settings": {}, "attr_time_stamps": {"settings": 45},
        }})
        user_utils.merge_user_accounts(env.source.id, env.survivor.id, fill_in_profile_data=True)
        result = env.mongo.profiles.find_one({"id": env.survivor.id})
        assert "Source bio" in result["bio"] and "<script>" not in result["bio"]
        assert result["website"] == "source.example"
        assert result["location"] == "personal"
        assert result["settings"] == {"interface_language": "hebrew"}
        # Changing settings must also record when they changed, so devices re-sync.
        assert result["attr_time_stamps"]["settings"] == pytest.approx(user_utils.time.time(), abs=10)


class TestLoginsAndAccess:
    """Only the survivor's logins remain, and no backend access survives the merge."""

    @pytest.mark.parametrize("survivor_password", [None, "personal-password"])
    def test_only_survivor_logins_remain_and_all_backend_privileges_are_cleared(self, merge_env, survivor_password):
        """Source passwords, tokens, SSO, emails, and API keys stop working; the survivor's keep working"""
        from emailusernames.backends import EmailAuthBackend
        from rest_framework.exceptions import AuthenticationFailed
        from rest_framework_simplejwt.authentication import JWTAuthentication
        from rest_framework_simplejwt.tokens import AccessToken

        env = merge_env
        for account in (env.source, env.survivor):
            account.is_staff = account.is_superuser = True
            account.set_password("source-password" if account.id == env.source.id else survivor_password)
            account.save()
            account.groups.add(Group.objects.create(name="merge-group-%s" % account.id))
            account.user_permissions.add(Permission.objects.get(codename="change_user"))
        original_password = env.survivor.password
        source_access_token = AccessToken.for_user(env.source)
        survivor_access_token = AccessToken.for_user(env.survivor)
        source_social = SocialAccount.objects.create(user=env.source, provider="google", uid="work-identity")
        survivor_social = SocialAccount.objects.create(user=env.survivor, provider="apple", uid="personal-identity")
        source_token = SocialToken.objects.create(account=source_social, token="work-token")
        survivor_token = SocialToken.objects.create(account=survivor_social, token="personal-token")
        EmailAddress.objects.create(user=env.source, email=env.source.email, primary=True, verified=True)
        EmailAddress.objects.create(user=env.survivor, email=env.survivor.email, primary=True, verified=True)
        env.mongo.apikeys.insert_many([{"uid": env.source.id, "key": "work"},
                                      {"uid": env.survivor.id, "key": "personal"}])
        merge(env)
        env.survivor.refresh_from_db()
        assert env.survivor.is_staff is env.survivor.is_superuser is False
        assert not env.survivor.groups.exists()
        assert not env.survivor.user_permissions.exists()
        assert env.survivor.password == original_password
        if survivor_password:
            assert env.survivor.check_password(survivor_password)
        else:
            assert not env.survivor.has_usable_password()
        assert EmailAuthBackend().get_user(env.source.id) is None
        with pytest.raises(AuthenticationFailed):
            JWTAuthentication().get_user(source_access_token)
        assert JWTAuthentication().get_user(survivor_access_token).id == env.survivor.id
        assert not User.objects.filter(id=env.source.id).exists()
        assert not SocialAccount.objects.filter(pk=source_social.pk).exists()
        assert not SocialToken.objects.filter(pk=source_token.pk).exists()
        assert SocialAccount.objects.get(pk=survivor_social.pk).user_id == env.survivor.id
        assert SocialToken.objects.get(pk=survivor_token.pk).token == "personal-token"
        assert list(EmailAddress.objects.filter(user=env.survivor).values_list("email", flat=True)) == [env.survivor.email]
        assert not EmailAddress.objects.filter(email=env.source.email).exists()
        assert list(env.mongo.apikeys.find({}, {"_id": 0})) == [{"uid": env.survivor.id, "key": "personal"}]


# ============================================================================
# When something goes wrong
# ============================================================================

class TestFailureSafety:
    """A failure never deletes the source while it still owns anything."""

    def test_content_failure_does_not_delete_either_account(self, merge_env, monkeypatch):
        """If moving content fails, both accounts remain and caches are still cleared"""
        env = merge_env
        monkeypatch.setattr(user_utils, "_merge_history", Mock(side_effect=RuntimeError("transfer failed")))
        with pytest.raises(RuntimeError, match="transfer failed"):
            merge(env)
        assert User.objects.filter(id__in=[env.source.id, env.survivor.id]).count() == 2
        assert env.mongo.profiles.count_documents({}) == 2
        user_utils._refresh_merge_caches.assert_called_once_with(env.source.id, env.survivor.id)

    def test_remaining_source_reference_stops_deletion(self, merge_env, monkeypatch):
        """The final check finds a field that wasn't moved and stops before deleting the source"""
        env = merge_env
        env.mongo.notes.insert_one({"owner": env.source.id})
        # Verification must still find ownership missed by the transfer, not merely
        # trust that a transfer function returned without raising an exception.
        collection_type = type(env.mongo.notes)
        original_update = collection_type.update_many
        def skip_notes(collection, *args, **kwargs):
            if collection.name != "notes":
                return original_update(collection, *args, **kwargs)
        monkeypatch.setattr(collection_type, "update_many", skip_notes)
        with pytest.raises(RuntimeError, match="notes.owner"):
            merge(env)
        assert User.objects.filter(id=env.source.id).exists()
        assert env.mongo.profiles.find_one({"id": env.source.id})

    def test_remaining_nested_sheet_attribution_stops_deletion(self, merge_env, monkeypatch):
        """The final check also looks inside nested sheet sources"""
        env = merge_env
        env.mongo.sheets.insert_one({"id": 100, "owner": 99, "sources": [
            {"subsources": [{"addedBy": env.source.id}]}]})
        collection_type = type(env.mongo.sheets)
        original_update = collection_type.update_one
        def skip_sheets(collection, *args, **kwargs):
            if collection.name != "sheets":
                return original_update(collection, *args, **kwargs)
        monkeypatch.setattr(collection_type, "update_one", skip_sheets)
        with pytest.raises(RuntimeError, match="sheet 100"):
            merge(env)
        assert User.objects.filter(id=env.source.id).exists()

    def test_sql_failure_rolls_back_privilege_changes_and_keeps_source_profile(self, merge_env, monkeypatch):
        """A SQL error undoes every SQL change, including the survivor's removed access"""
        env = merge_env
        env.survivor.is_staff = env.survivor.is_superuser = True
        env.survivor.save()
        group = Group.objects.create(name="existing-group")
        env.survivor.groups.add(group)
        permission = Permission.objects.get(codename="change_user")
        env.survivor.user_permissions.add(permission)
        social = SocialAccount.objects.create(user=env.source, provider="google", uid="work-identity")
        original_delete = User.delete
        def failing_delete(account, *args, **kwargs):
            original_delete(account, *args, **kwargs)
            raise IntegrityError("injected SQL failure")
        monkeypatch.setattr(User, "delete", failing_delete)
        with pytest.raises(IntegrityError, match="injected SQL failure"):
            merge(env)
        env.survivor.refresh_from_db()
        assert env.survivor.is_staff and env.survivor.is_superuser
        assert env.survivor.groups.filter(pk=group.pk).exists()
        assert env.survivor.user_permissions.filter(pk=permission.pk).exists()
        assert User.objects.filter(id=env.source.id).exists()
        assert SocialAccount.objects.filter(pk=social.pk, user_id=env.source.id).exists()
        assert env.mongo.profiles.find_one({"id": env.source.id})

    def test_outer_sql_transaction_is_rejected_before_content_moves(self, merge_env):
        """Calling the merge inside another transaction is refused before anything moves"""
        env = merge_env
        env.mongo.notes.insert_one({"owner": env.source.id})
        with transaction.atomic():
            with pytest.raises(RuntimeError, match="durable atomic block"):
                merge(env)
        assert env.mongo.notes.find_one()["owner"] == env.source.id
        assert User.objects.filter(id=env.source.id).exists()

    @pytest.mark.django_db(transaction=True)
    @pytest.mark.parametrize("locked_account", ["source", "survivor"])
    def test_overlapping_merge_stops_before_moving_content(self, merge_env, locked_account, capsys):
        """A second merge of an account that is already being merged fails right away, safe to retry"""
        if connection.vendor != "postgresql":
            pytest.skip("Requires PostgreSQL row locks, as used in production")
        env = merge_env
        env.mongo.notes.insert_one({"owner": env.source.id})
        # Use a separate connection to the same disposable test database, as another
        # merge command would. Never connect to the application database for this test.
        other = connection.Database.connect(**connection.get_connection_params())
        try:
            with other.cursor() as cursor:
                cursor.execute("SELECT id FROM auth_user WHERE id = %s FOR UPDATE",
                               [getattr(env, locked_account).id])
            # InputError tells the web form nothing changed, so it can be tried again.
            with pytest.raises(InputError, match="already being merged"):
                merge(env)
        finally:
            other.rollback()
            other.close()
        assert env.mongo.notes.find_one()["owner"] == env.source.id
        assert User.objects.filter(id=env.source.id).exists()
        assert "may already have applied" not in capsys.readouterr().out

    def test_profile_cleanup_failure_reports_that_sql_deletion_already_committed(self, merge_env, monkeypatch, capsys):
        """If the last step fails, the operator is told the Django user is already gone"""
        env = merge_env
        mongo_profiles = env.mongo.profiles
        # Patch the real collection method, not the general account deletion helper.
        monkeypatch.setattr(type(mongo_profiles), "delete_one", Mock(side_effect=RuntimeError("cleanup failed")))
        with pytest.raises(RuntimeError, match="cleanup failed"):
            merge(env)
        assert not User.objects.filter(id=env.source.id).exists()
        assert env.mongo.profiles.find_one({"id": env.source.id})
        assert "source profile cleanup" in capsys.readouterr().out


# ============================================================================
# Follow-up work after the merge
# ============================================================================

class TestFollowUpWarnings:
    """Tasks a person must finish by hand are returned as warnings, not raised as errors."""

    def test_cache_warning_is_returned_to_web_callers(self, merge_env):
        """A failed cache refresh shows up in the result's warnings"""
        env = merge_env
        user_utils._refresh_merge_caches.return_value = "Profile caches need refresh."
        result = merge(env)
        assert result["warnings"] == ["Profile caches need refresh."]

    @pytest.mark.parametrize("source_id,destination_id,expected_calls", [
        ("source-crm", "personal-crm", 1), ("shared", "shared", 0), (None, "personal-crm", 0),
    ])
    def test_crm_review_uses_source_only_when_distinct(self, merge_env, source_id, destination_id, expected_calls):
        """Only a source CRM record that differs from the survivor's is flagged for review"""
        env = merge_env
        env.mongo.profiles.update_one({"id": env.source.id}, {"$set": {"sf_app_user_id": source_id}})
        env.mongo.profiles.update_one({"id": env.survivor.id}, {"$set": {"sf_app_user_id": destination_id}})
        with override_settings(CRM_TYPE="SALESFORCE"):
            merge(env)
        assert user_utils.CrmMediator.return_value.mark_for_review_in_crm.call_count == expected_calls
        assert env.mongo.profiles.find_one({"id": env.survivor.id})["sf_app_user_id"] == destination_id

    @pytest.mark.parametrize("raises", [False, True])
    def test_crm_failure_reports_followup_without_repeating_or_failing_completed_merge(self, merge_env, capsys, raises):
        """A CRM failure after the merge prints a follow-up task instead of failing the merge"""
        env = merge_env
        env.mongo.profiles.update_one({"id": env.source.id}, {"$set": {"sf_app_user_id": "source-crm"}})
        if raises:
            user_utils.CrmMediator.side_effect = RuntimeError("CRM unavailable")
        else:
            user_utils.CrmMediator.return_value.mark_for_review_in_crm.return_value = False
        with override_settings(CRM_TYPE="SALESFORCE"):
            merge(env)
        assert not User.objects.filter(id=env.source.id).exists()
        assert "source-crm needs manual review" in capsys.readouterr().out


class TestCacheRefresh:
    """Cached profiles are cleared on this server and announced to the others."""

    @override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
    def test_cache_refresh_forgets_both_profiles_and_recommendations(self, monkeypatch):
        """Both accounts' cached profiles and the follow suggestions are cleared; others stay"""
        from sefaria.model import following, user_profile
        from sefaria.system import cache
        monkeypatch.setattr(user_profile, "public_user_data_cache", {
            111: {"name": "old"}, 222: {"name": "old"}, 333: {"name": "keep"},
        })
        monkeypatch.setattr(following, "creators", [{"uid": 111}])
        key = cache.cache_get_key(cache.cache_get_key_arr("aggregate_profiles", lang="english"))
        cache.set_cache_elem(key, "old recommendations")
        cache.invalidate_user_profile_cache([111, 222])
        assert 111 not in user_profile.public_user_data_cache
        assert 222 not in user_profile.public_user_data_cache
        assert user_profile.public_user_data_cache[333] == {"name": "keep"}
        assert following.creators is None
        assert cache.get_cache_elem(key) is None

    def test_cache_refresh_runs_locally_and_on_other_servers(self, monkeypatch):
        """The refresh runs here and is published so the other web servers run it too"""
        from sefaria.system import cache
        from sefaria.system.multiserver import coordinator
        invalidate = Mock()
        publisher = Mock()
        monkeypatch.setattr(cache, "invalidate_user_profile_cache", invalidate)
        monkeypatch.setattr(coordinator, "server_coordinator", publisher)
        assert user_utils._refresh_merge_caches(111, 222) is None
        invalidate.assert_called_once_with([111, 222])
        publisher.publish_event.assert_called_once_with("scache", "invalidate_user_profile_cache", [[111, 222]])

    def test_cache_refresh_failure_becomes_a_warning(self, monkeypatch):
        """A failed refresh returns a warning instead of raising"""
        from sefaria.system import cache
        monkeypatch.setattr(cache, "invalidate_user_profile_cache", Mock(side_effect=RuntimeError("redis down")))
        warning = user_utils._refresh_merge_caches(111, 222)
        assert "could not be refreshed" in warning
