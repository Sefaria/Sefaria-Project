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