import pytest
from sefaria.model.user_profile import UserHistory, UserHistorySet
from sefaria.system.exceptions import InputError

def make_uh(uid=0, ref="Genesis 1:1", he_ref="בראשית א:א", versions=None, time_stamp=0, server_time_stamp=0, last_place=False, book="Genesis", saved=False, secondary=False):
    versions = versions or {
        "he": "blah",
        "en": "blah"
    }
    uh = UserHistory({
        "uid": uid,
        "ref": ref,
        "he_ref": he_ref,
        "versions": versions,
        "time_stamp": time_stamp,
        "server_time_stamp": server_time_stamp,
        "last_place": last_place,
        "book": book,
        "saved": saved,
        "secondary": secondary        
    })
    uh.save()
    return uh

@pytest.fixture(scope='module')
def uh_secondary_item():
    uh = make_uh(secondary=True)
    yield uh
    uh.delete()

def test_saved_with_secondary_item(uh_secondary_item):
    """
    Ephraim found bug where saved flag can get attached to secondary item that was created immediately before saving
    This tests for this case
    """
    uh = UserHistory.save_history_item(0, {
        "ref": "Genesis 1:1",
        "versions": {
            "he": "blah",
            "en": "blah"
        },
        "saved": True,
        "last_place": True,
        "secondary": False,
        "time_stamp": 1,
        "server_time_stamp": 1,
        "action": "add_saved"
    })
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
    items = [make_uh(uid=SYNC_UID, ref=f"Genesis 1:{i}", time_stamp=i, server_time_stamp=i,
                     saved=(i == 1), last_place=(i == 2)) for i in range(1, 11)]
    yield items
    UserHistorySet({"uid": SYNC_UID}).delete(bulk_delete=True)


def sync_refs(last_sync, limit):
    items = UserHistory.get_sync_items(SYNC_UID, last_sync, limit=limit)
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
