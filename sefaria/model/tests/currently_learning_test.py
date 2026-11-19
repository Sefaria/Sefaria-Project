"""Currently Learning POC: history coalescing, last_place guard for merged items, pinned books."""

import pytest

from sefaria.model.user_profile import HISTORY_COALESCE_SECONDS, UserHistory, UserHistorySet, UserProfile

UID = -4242  # synthetic user so these rows can't collide with real or other test data


def _save(ref, ts, book="Pirkei Avot"):
    return UserHistory.save_history_item(
        UID, {"ref": ref, "book": book, "versions": {}, "secondary": False, "time_stamp": ts}, time_stamp=ts
    )


def _rows(**query):
    return UserHistorySet(dict({"uid": UID}, **query), sort=[("time_stamp", -1)]).array()


@pytest.fixture(autouse=True)
def clean_history():
    UserHistorySet({"uid": UID}).delete()
    yield
    UserHistorySet({"uid": UID}).delete()


def test_reads_in_same_book_within_window_coalesce():
    _save("Pirkei Avot 2:1", 1000)
    _save("Pirkei Avot 2:2", 1000 + HISTORY_COALESCE_SECONDS - 1)
    rows = _rows()
    assert len(rows) == 1
    assert rows[0].ref == "Pirkei Avot 2:2"
    assert rows[0].last_place is True


def test_reads_after_window_or_other_book_make_new_rows():
    _save("Pirkei Avot 2:1", 1000)
    _save("Pirkei Avot 2:4", 1000 + HISTORY_COALESCE_SECONDS + 1)
    _save("Genesis 1:3", 1000 + HISTORY_COALESCE_SECONDS + 2, book="Genesis")
    assert [r.ref for r in _rows()] == ["Genesis 1:3", "Pirkei Avot 2:4", "Pirkei Avot 2:1"]
    places = {r.book: r.ref for r in _rows(last_place=True)}
    assert places == {"Pirkei Avot": "Pirkei Avot 2:4", "Genesis": "Genesis 1:3"}


def test_older_merged_item_does_not_steal_last_place():
    _save("Pirkei Avot 3:1", 5000)
    _save("Pirkei Avot 1:1", 100)  # e.g. merged from logged-out device history
    places = _rows(last_place=True)
    assert [r.ref for r in places] == ["Pirkei Avot 3:1"]
    assert len(_rows()) == 2


def test_pinned_books_order_first_then_recent():
    profile = UserProfile(id=UID)
    _save("Genesis 1:3", 100, book="Genesis")
    _save("Pirkei Avot 2:4", 500)
    profile.set_book_pinned("Genesis", True)
    items = profile.currently_learning(limit=3)["items"]
    assert [(i["book"], i["pinned"]) for i in items] == [("Genesis", True), ("Pirkei Avot", False)]
    profile.set_book_pinned("Genesis", False)
    assert profile.pinned_books == []
