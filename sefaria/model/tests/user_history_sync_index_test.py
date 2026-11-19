# sefaria/model/tests/user_history_sync_index_test.py
"""get_sync_items must not 500 when the user_history time index is missing.

get_sync_items hints "uid_1_server_time_stamp_1". A database without that
index (a dev cauldron, the CI sandbox, or any Mongo restored without secondary
indexes) makes Mongo raise OperationFailure and the profile sync view returns
500. get_sync_items now guarantees the index before it uses the hint.
"""

from unittest.mock import MagicMock

import pytest
from pymongo.errors import OperationFailure

from sefaria.model import user_profile


class TestEnsureSyncHistoryIndex:
    def test_creates_the_index(self, monkeypatch):
        created = []
        fake_db = MagicMock()
        fake_db.user_history.create_index = lambda spec, **kw: created.append(spec)
        monkeypatch.setattr(user_profile, "db", fake_db)

        user_profile._ensure_sync_history_index()

        assert created == [[("uid", 1), ("server_time_stamp", 1)]]

    def test_tolerates_failure_when_the_index_already_exists(self, monkeypatch):
        """A restricted DB user cannot create indexes; that is fine if it is there."""
        fake_db = MagicMock()

        def boom(spec, **kw):
            raise OperationFailure("not authorized to create indexes")

        fake_db.user_history.create_index = boom
        fake_db.user_history.index_information.return_value = {
            "_id_": {"key": [("_id", 1)]},
            "uid_1_server_time_stamp_1": {"key": [("uid", 1), ("server_time_stamp", 1)]},
        }
        monkeypatch.setattr(user_profile, "db", fake_db)

        user_profile._ensure_sync_history_index()  # must not raise

    def test_raises_when_creation_fails_and_index_is_missing(self, monkeypatch):
        fake_db = MagicMock()

        def boom(spec, **kw):
            raise OperationFailure("not authorized to create indexes")

        fake_db.user_history.create_index = boom
        fake_db.user_history.index_information.return_value = {"_id_": {"key": [("_id", 1)]}}
        monkeypatch.setattr(user_profile, "db", fake_db)

        with pytest.raises(OperationFailure):
            user_profile._ensure_sync_history_index()


def test_get_sync_items_ensures_the_index_before_querying(monkeypatch):
    """Ordering is the point: the index must exist before the hinted query runs."""
    order = []
    monkeypatch.setattr(user_profile, "_ensure_sync_history_index", lambda: order.append("ensure_index"))

    class FakeSet:
        def __init__(self, *args, **kwargs):
            order.append("query")
            self._items = []

        def __iter__(self):
            return iter(self._items)

    monkeypatch.setattr(user_profile, "UserHistorySet", FakeSet)

    user_profile.UserHistory.get_sync_items(1, 0)

    assert order and order[0] == "ensure_index"
