import pymongo
import pytest

from sefaria.model.user_profile import UserHistory, UserHistorySet, UserLastPlace, UserLastPlaceSet, UserProfile
from sefaria.system.database import db
from sefaria.system.exceptions import InputError


def make_uh(
    uid=0,
    ref="Genesis 1:1",
    he_ref="בראשית א:א",
    versions=None,
    time_stamp=0,
    server_time_stamp=0,
    last_place=False,
    book="Genesis",
    saved=False,
    secondary=False,
):
    versions = versions or {"he": "blah", "en": "blah"}
    uh = UserHistory(
        {
            "uid": uid,
            "ref": ref,
            "he_ref": he_ref,
            "versions": versions,
            "time_stamp": time_stamp,
            "server_time_stamp": server_time_stamp,
            "last_place": last_place,
            "book": book,
            "saved": saved,
            "secondary": secondary,
        }
    )
    uh.save()
    return uh


@pytest.fixture(scope="module")
def uh_secondary_item():
    uh = make_uh(secondary=True)
    yield uh
    uh.delete()


def test_saved_with_secondary_item(uh_secondary_item):
    """
    Ephraim found bug where saved flag can get attached to secondary item that was created immediately before saving
    This tests for this case
    """
    uh = UserHistory.save_history_item(
        0,
        {
            "ref": "Genesis 1:1",
            "versions": {"he": "blah", "en": "blah"},
            "saved": True,
            "last_place": True,
            "secondary": False,
            "time_stamp": 1,
            "server_time_stamp": 1,
            "action": "add_saved",
        },
    )
    assert uh_secondary_item._id != uh._id
    assert not uh.secondary
    uh.delete()


def test_validation_for_saved_and_secondary():
    with pytest.raises(InputError):
        make_uh(saved=True, secondary=True)


SYNC_UID = -1  # negative, so it can't be a real user


@pytest.fixture
def sync_history():
    """
    Ten plain reads at server_time_stamp 1..10, with saved and last_place items among the oldest.
    """
    # get_sync_items hints the (uid, server_time_stamp) index. ensure_indices() registers it but
    # nothing runs that in the CI sandbox, and a hint on a missing index is an error, not a slow query.
    db.user_history.create_index([("uid", pymongo.ASCENDING), ("server_time_stamp", pymongo.ASCENDING)])
    items = [
        make_uh(uid=SYNC_UID, ref=f"Genesis 1:{i}", time_stamp=i, server_time_stamp=i, saved=(i == 1))
        for i in range(1, 11)
    ]
    UserLastPlace.update_for_read(items[1])
    yield items
    UserHistorySet({"uid": SYNC_UID}).delete(bulk_delete=True)
    UserLastPlaceSet({"uid": SYNC_UID}).delete(bulk_delete=True)


def sync_refs(last_sync, limit):
    items = UserProfile(id=SYNC_UID).get_sync_history(last_sync, limit=limit)
    refs = [uh.ref for uh in items]
    assert len(refs) == len(set(refs))
    return refs


def test_sync_full_pull_capped(sync_history):
    assert sync_refs(0, 3) == ["Genesis 1:1", "Genesis 1:2", "Genesis 1:8", "Genesis 1:9", "Genesis 1:10"]


def test_sync_full_pull_under_cap(sync_history):
    assert sync_refs(0, 100) == [f"Genesis 1:{i}" for i in range(1, 11)]


def test_sync_delta_capped(sync_history):
    # saved / last_place items before last_sync aren't resent
    assert sync_refs(2, 3) == ["Genesis 1:8", "Genesis 1:9", "Genesis 1:10"]
    # ...but flagged items in the delta are, even when older than the newest `limit`
    assert sync_refs(1, 3) == ["Genesis 1:2", "Genesis 1:8", "Genesis 1:9", "Genesis 1:10"]


def test_sync_delta_includes_unsaved(sync_history):
    uh = sync_history[4]
    uh.delete_saved = True
    uh.save()
    assert sync_refs(1, 3) == ["Genesis 1:2", "Genesis 1:5", "Genesis 1:8", "Genesis 1:9", "Genesis 1:10"]


@pytest.fixture
def two_books_history():
    items = [
        make_uh(uid=SYNC_UID, ref="Genesis 1:1", book="Genesis", time_stamp=1, last_place=True),
        make_uh(uid=SYNC_UID, ref="Exodus 2:1", book="Exodus", time_stamp=2, last_place=True),
        make_uh(uid=SYNC_UID, ref="Exodus 1:1", book="Exodus", time_stamp=3),
    ]
    yield items
    UserHistorySet({"uid": SYNC_UID}).delete(bulk_delete=True)


def test_last_place_for_one_book(two_books_history):
    items = UserHistory.get_user_history(uid=SYNC_UID, book="Exodus", last_place=True, secondary=False, serialized=True)
    assert [item["ref"] for item in items] == ["Exodus 2:1"]


READ_UID = -2  # negative, so it can't be a real user
DAY = 24 * 60 * 60
NOON = 20000 * DAY + 12 * 60 * 60  # 12:00 UTC


@pytest.fixture
def reader():
    # Created by scripts/migrations/create_user_last_place_collection.py, which nothing runs in the CI sandbox.
    # The unique index is what keeps a late, older read from adding a second last place for a book.
    db.user_last_place.create_index([("uid", pymongo.ASCENDING), ("book", pymongo.ASCENDING)], unique=True)
    yield
    UserHistorySet({"uid": READ_UID}).delete(bulk_delete=True)
    UserLastPlaceSet({"uid": READ_UID}).delete(bulk_delete=True)


def profile():
    return UserProfile(id=READ_UID)  # no Django user behind it, so nothing is saved to profiles


def read(ref, time_stamp, **extra):
    hist = {"ref": ref, "versions": {}, "time_stamp": time_stamp, **extra}
    return profile().process_history_item(hist, time_stamp)


def history_refs():
    return [uh.ref for uh in UserHistorySet({"uid": READ_UID}, sort=[("time_stamp", -1)])]


def last_place(book="Genesis"):
    return UserLastPlace().load({"uid": READ_UID, "book": book})


def test_read_records_last_place(reader):
    uh = read("Genesis 1:3", NOON)
    lp = last_place()
    assert (lp.ref, lp.history_id) == ("Genesis 1:3", uh._id)
    assert not uh.last_place


def test_every_read_is_kept(reader):
    read("Genesis 1:3", NOON)
    read("Genesis 1:7", NOON + 600)
    assert history_refs() == ["Genesis 1:7", "Genesis 1:3"]
    assert last_place().ref == "Genesis 1:7"


def test_older_read_keeps_newer_place(reader):
    read("Genesis 1:7", NOON + 600)
    read("Genesis 1:3", NOON)  # reported late, e.g. read offline in the app
    assert history_refs() == ["Genesis 1:7", "Genesis 1:3"]
    assert last_place().ref == "Genesis 1:7"


def test_secondary_reads_and_sheets_are_not_tracked(reader):
    read("Genesis 1:3", NOON, secondary=True)
    assert last_place() is None
    assert not UserLastPlace.tracks(UserHistory({"book": "Sheet"}))


def test_last_places_fall_back_to_legacy_flag(reader):
    make_uh(uid=READ_UID, ref="Genesis 5:1", book="Genesis", time_stamp=NOON - DAY, last_place=True)
    make_uh(uid=READ_UID, ref="Exodus 2:1", book="Exodus", time_stamp=NOON - DAY, last_place=True)
    read("Genesis 1:3", NOON)
    assert [uh.ref for uh in profile().get_last_places()] == ["Genesis 1:3", "Exodus 2:1"]
    assert [uh.ref for uh in profile().get_last_places(book="Genesis")] == ["Genesis 1:3"]


def test_last_places_newest_first(reader):
    read("Exodus 2:1", NOON - DAY)
    read("Genesis 1:3", NOON)
    assert [uh.ref for uh in profile().get_last_places()] == ["Genesis 1:3", "Exodus 2:1"]
    assert [uh.ref for uh in profile().get_last_places(book="Exodus")] == ["Exodus 2:1"]


def test_last_place_survives_its_record_being_deleted(reader):
    uh = read("Genesis 1:3", NOON)
    uh.delete()
    assert [uh.ref for uh in profile().get_last_places()] == ["Genesis 1:3"]


def test_delete_history_deletes_last_places(reader):
    read("Genesis 1:3", NOON)
    profile().delete_user_history()
    assert history_refs() == []
    assert last_place() is None


def test_delete_history_excluding_last_place_keeps_last_places(reader):
    read("Genesis 1:3", NOON)
    profile().delete_user_history(exclude_last_place=True)
    assert history_refs() == []
    assert [uh.ref for uh in profile().get_last_places()] == ["Genesis 1:3"]


def test_sync_full_pull_includes_legacy_last_places(reader):
    legacy = make_uh(uid=READ_UID, ref="Exodus 2:1", book="Exodus", time_stamp=1, server_time_stamp=1, last_place=True)
    read("Genesis 1:3", NOON)
    refs = [uh.ref for uh in profile().get_sync_history(0, limit=1)]
    assert refs == [legacy.ref, "Genesis 1:3"]


def test_sync_full_pull_includes_every_last_place(reader):
    read("Exodus 2:1", NOON - DAY)
    read("Genesis 1:3", NOON)
    refs = [uh.ref for uh in profile().get_sync_history(0, limit=1)]
    assert refs == ["Exodus 2:1", "Genesis 1:3"]


def _load_backfill_script():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[3] / "scripts" / "migrations" / "backfill_user_last_place.py"
    spec = importlib.util.spec_from_file_location("backfill_user_last_place", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_backfill_keeps_newer_places(reader):
    backfill = _load_backfill_script()
    make_uh(uid=READ_UID, ref="Genesis 5:1", book="Genesis", time_stamp=NOON - DAY, last_place=True)
    exodus = make_uh(uid=READ_UID, ref="Exodus 2:1", book="Exodus", time_stamp=NOON - DAY, last_place=True)
    read("Genesis 1:3", NOON)
    written, skipped = backfill.write_batch([backfill.upsert_for(doc) for doc in backfill.legacy_last_places(READ_UID)])
    assert (written, skipped) == (1, 1)
    assert last_place("Genesis").ref == "Genesis 1:3"
    assert last_place("Exodus").history_id == exodus._id
    assert [uh.ref for uh in profile().get_last_places()] == ["Genesis 1:3", "Exodus 2:1"]
