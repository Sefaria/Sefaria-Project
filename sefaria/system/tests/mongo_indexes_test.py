"""
The MongoDB indexes the code relies on (sefaria/system/database.py ensure_indices) and the command that creates them where a
database lacks them (reader/management/commands/ensure_mongo_indexes.py; LAUNCH_PLAN T-B07: a cauldron without
expandedRefs_1 answered /api/links/<ref>?with_sheet_links=1 with a 500 while sefaria/sheets.py hinted it).

No Mongo needed: the database is a stand-in.
"""

from io import StringIO
from unittest import mock

import pymongo
import pytest
from django.core.management import call_command

from sefaria.system import database


class _Collection:
    def __init__(self, indexes=None):
        self.indexes = dict(indexes or {})
        self.created = []

    def index_information(self):
        return {name: {"key": key} for name, key in self.indexes.items()}

    def create_index(self, spec, **kwargs):
        key = database._index_key([spec])
        name = kwargs.get("name") or "_".join(f"{f}_{d}" for f, d in key)
        self.indexes.setdefault(name, key)
        self.created.append(name)
        return name


class _Db:
    def __init__(self, **collections):
        self.collections = collections

    def __getattr__(self, name):
        return self.collections.setdefault(name, _Collection())


def _default_name(args):
    return "_".join(f"{f}_{d}" for f, d in database._index_key(args))


# Every index the code names in a hint (a hint that names a missing index fails the whole query).
HINTED = [
    (
        "sheets",
        "expandedRefs_1",
    ),  # sefaria/sheets.py get_sheets_for_ref until #3936; still what cauldrons lacked (T-B07)
    ("topic_links", "expandedRefs_1"),  # sefaria/sheets.py update_sheet_topic_links
    ("webpages", "expandedRefs_1"),  # sefaria/model/webpage.py
    ("manuscript_pages", "expanded_refs_1"),  # sefaria/model/manuscript.py
    ("marked_up_text_chunks", "ref_1"),  # sefaria/helper/linker/tasks.py
    ("user_history", "uid_1_server_time_stamp_1"),  # sefaria/model/user_profile.py
]


@pytest.mark.parametrize("collection,name", HINTED)
def test_every_hinted_index_is_registered(collection, name):
    registered = {
        _default_name(args) for col, args, _ in database.ensure_indices(_Db(), dry_run=True) if col == collection
    }
    assert name in registered


def test_missing_indices_compares_by_key_not_name():
    sheets = _Collection({"_id_": [("_id", 1)], "by_hand": [("expandedRefs", 1.0)]})  # a dump may carry 1.0
    db = _Db(sheets=sheets)
    missing = database.missing_indices(db, collections={"sheets"})
    assert [("expandedRefs", 1)] not in [database._index_key(args) for _, args, _ in missing]
    assert [("owner", 1)] in [database._index_key(args) for _, args, _ in missing]
    assert all(col == "sheets" for col, _, _ in missing)


def test_ensure_indices_can_be_limited_to_some_collections_and_dry_run():
    db = _Db()
    specs = database.ensure_indices(db, collections={"sheets"}, dry_run=True)
    assert specs and {col for col, _, _ in specs} == {"sheets"}
    assert db.collections == {}
    database.ensure_indices(db, collections={"sheets"})
    assert "expandedRefs_1" in db.collections["sheets"].indexes
    assert set(db.collections) == {"sheets"}


def test_command_by_default_only_lists_what_is_missing_and_fails():
    db = _Db(sheets=_Collection({"_id_": [("_id", 1)]}))
    out = StringIO()
    with mock.patch.object(database, "db", db), pytest.raises(SystemExit) as exit_:
        call_command("ensure_mongo_indexes", "--collection", "sheets", stdout=out)  # listing is the default
    assert exit_.value.code == 1
    assert "would create sheets: [('expandedRefs', 1)]" in out.getvalue()
    assert db.collections["sheets"].created == []


def test_command_creates_only_what_is_missing():
    sheets = _Collection({"_id_": [("_id", 1)], "expandedRefs_1": [("expandedRefs", pymongo.ASCENDING)]})
    db = _Db(sheets=sheets)
    out = StringIO()
    with mock.patch.object(database, "db", db):
        call_command("ensure_mongo_indexes", "--create", "--collection", "sheets", stdout=out)
        assert "expandedRefs_1" not in sheets.created
        assert "owner_1" in sheets.created
        assert "still missing" in out.getvalue() and ", 0 still missing" in out.getvalue()
        out = StringIO()
        call_command("ensure_mongo_indexes", "--collection", "sheets", stdout=out)
    assert "0 missing" in out.getvalue()
