"""Account merges use synthetic SQL users and a disposable MongoDB database.

Never use the application Mongo database here: Django only isolates SQL for tests.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from django.contrib.auth.models import User

from sefaria.system.database import client
from sefaria.system.exceptions import InputError
from sefaria.utils import user as user_utils


@pytest.fixture
def merge_env(db, monkeypatch):
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
    monkeypatch.setattr("builtins.input", lambda _: "MERGE")
    try:
        yield SimpleNamespace(mongo=mongo, source=source, survivor=survivor,
                              profiles=profiles, cleanup=cleanup)
    finally:
        client.drop_database(mongo_name)


def merge(env):
    return user_utils.merge_user_accounts(env.source.id, env.survivor.id, fill_in_profile_data=False)


def test_merge_moves_membership_in_every_collection(merge_env):
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
    env.cleanup.assert_called_once_with(env.source.id, confirm=False)


def test_cancel_leaves_accounts_untouched(merge_env, monkeypatch):
    env = merge_env
    env.mongo.user_history.insert_one({"uid": env.source.id})
    monkeypatch.setattr("builtins.input", lambda _: "CANCEL")
    merge(env)
    assert env.mongo.user_history.count_documents({"uid": env.source.id}) == 1
    env.cleanup.assert_not_called()


def test_self_merge_is_rejected_before_loading_profiles(merge_env):
    env = merge_env
    with pytest.raises(InputError, match="must be different"):
        user_utils.merge_user_accounts(env.source.id, env.source.id)
    env.profiles.assert_not_called()
    env.cleanup.assert_not_called()


@pytest.mark.parametrize("missing", ["source", "survivor"])
def test_missing_sql_user_stops_before_loading_profiles(merge_env, missing):
    env = merge_env
    User.objects.filter(id=getattr(env, missing).id).delete()
    with pytest.raises(InputError, match="does not exist"):
        merge(env)
    env.profiles.assert_not_called()
    env.cleanup.assert_not_called()


@pytest.mark.parametrize("missing", ["source", "survivor"])
def test_missing_profile_is_not_created_by_merge(merge_env, missing):
    env = merge_env
    env.mongo.profiles.delete_one({"id": getattr(env, missing).id})
    with pytest.raises(InputError, match="does not have a profile"):
        merge(env)
    assert env.mongo.profiles.count_documents({}) == 1
    env.profiles.assert_not_called()
    env.cleanup.assert_not_called()
