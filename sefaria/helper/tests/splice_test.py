import pytest

from sefaria.model import *
from sefaria.helper.splice import SegmentSplicer


def test_splice_mode_equivalence():
    n = SegmentSplicer().splice_next_into_this(Ref("Shabbat 45b:11"))
    assert n == SegmentSplicer().splice_this_into_next(Ref("Shabbat 45b:11"))
    assert n == SegmentSplicer().splice_prev_into_this(Ref("Shabbat 45b:12"))
    assert n == SegmentSplicer().splice_this_into_prev(Ref("Shabbat 45b:12"))

def test_join_rewrite():
    n = SegmentSplicer().splice_next_into_this(Ref("Shabbat 45b:11"))
    assert n._needs_rewrite(Ref("Shabbat 45b:15"))
    assert n._needs_rewrite(Ref("Shabbat 45b:12"))
    assert not n._needs_rewrite(Ref("Shabbat 45b:9"))
    assert not n._needs_rewrite(Ref("Shabbat 45b:11"))
    assert not n._needs_rewrite(Ref("Shabbat 45b"))
    assert not n._needs_rewrite(Ref("Shabbat 44b:11"))
    assert not n._needs_rewrite(Ref("Shabbat 46b:11"))

    assert not n._needs_rewrite(Ref("Rif Shabbat 45b:15"))

    assert n._needs_rewrite(Ref("Rashi on Shabbat 45b:15"), commentary=True)
    assert n._needs_rewrite(Ref("Rashi on Shabbat 45b:12"), commentary=True)
    assert n._needs_rewrite(Ref("Rashi on Shabbat 45b:15:2"), commentary=True)
    assert n._needs_rewrite(Ref("Rashi on Shabbat 45b:12:1"), commentary=True)
    assert not n._needs_rewrite(Ref("Rashi on Shabbat 45b:9"), commentary=True)
    assert not n._needs_rewrite(Ref("Rashi on Shabbat 45b:11"), commentary=True)
    assert not n._needs_rewrite(Ref("Rashi on Shabbat 45b"), commentary=True)
    assert not n._needs_rewrite(Ref("Rashi on Shabbat 44b:11"), commentary=True)
    assert not n._needs_rewrite(Ref("Rashi on Shabbat 46b:11"), commentary=True)

    assert n._rewrite(Ref("Shabbat 45b:15")) == Ref("Shabbat 45b:14")
    assert n._rewrite(Ref("Shabbat 45b:12")) == Ref("Shabbat 45b:11")

    assert n._rewrite(Ref("Rashi on Shabbat 45b:15:1"), commentary=True) == Ref("Rashi on Shabbat 45b:14:1")
    assert n._rewrite(Ref("Rashi on Shabbat 45b:15"), commentary=True) == Ref("Rashi on Shabbat 45b:14")
    assert n._rewrite(Ref("Rashi on Shabbat 45b:12:1"), commentary=True) == Ref("Rashi on Shabbat 45b:11:2")  # There's already one comment on 11

def test_page_spanning_rewrite():
    n = SegmentSplicer().splice_this_into_next(Ref("Meilah 19b:1"))
    assert n._needs_rewrite(Ref("Meilah 19b:41-20a:5"))
    assert n._rewrite(Ref("Meilah 19b:41-20a:5")) == Ref("Meilah 19b:40-20a:5")

    n = SegmentSplicer().insert_blank_segment_after(Ref("Meilah 19b:1"))
    assert n._needs_rewrite(Ref("Meilah 19b:41-20a:5"))
    assert n._rewrite(Ref("Meilah 19b:41-20a:5")) == Ref("Meilah 19b:42-20a:5")

def test_insert_rewrite():
    n = SegmentSplicer().insert_blank_segment_after(Ref("Shabbat 45b:11"))
    assert n._needs_rewrite(Ref("Shabbat 45b:15"))
    assert n._needs_rewrite(Ref("Shabbat 45b:12"))
    assert not n._needs_rewrite(Ref("Shabbat 45b:9"))
    assert not n._needs_rewrite(Ref("Shabbat 45b:11"))
    assert not n._needs_rewrite(Ref("Shabbat 45b"))
    assert not n._needs_rewrite(Ref("Shabbat 44b:11"))
    assert not n._needs_rewrite(Ref("Shabbat 46b:11"))

    assert not n._needs_rewrite(Ref("Rif Shabbat 45b:15"))

    assert n._needs_rewrite(Ref("Rashi on Shabbat 45b:15"), commentary=True)
    assert n._needs_rewrite(Ref("Rashi on Shabbat 45b:12"), commentary=True)
    assert n._needs_rewrite(Ref("Rashi on Shabbat 45b:15:2"), commentary=True)
    assert n._needs_rewrite(Ref("Rashi on Shabbat 45b:12:1"), commentary=True)
    assert not n._needs_rewrite(Ref("Rashi on Shabbat 45b:9"), commentary=True)
    assert not n._needs_rewrite(Ref("Rashi on Shabbat 45b:11"), commentary=True)
    assert not n._needs_rewrite(Ref("Rashi on Shabbat 45b"), commentary=True)
    assert not n._needs_rewrite(Ref("Rashi on Shabbat 44b:11"), commentary=True)
    assert not n._needs_rewrite(Ref("Rashi on Shabbat 46b:11"), commentary=True)

    assert n._rewrite(Ref("Shabbat 45b:15")) == Ref("Shabbat 45b:16")
    assert n._rewrite(Ref("Shabbat 45b:12")) == Ref("Shabbat 45b:13")

    assert n._rewrite(Ref("Rashi on Shabbat 45b:15:1"), commentary=True) == Ref("Rashi on Shabbat 45b:16:1")
    assert n._rewrite(Ref("Rashi on Shabbat 45b:15"), commentary=True) == Ref("Rashi on Shabbat 45b:16")
    assert n._rewrite(Ref("Rashi on Shabbat 45b:12:1"), commentary=True) == Ref("Rashi on Shabbat 45b:13:1")

def test_page_spanning_range():
    n = SegmentSplicer().insert_blank_segment_after(Ref("Chagigah 20b:13"))
    assert n._needs_rewrite(Ref("Chagigah 20b:14-21a:1"))
    assert n._rewrite(Ref("Chagigah 20b:14-21a:1")) == Ref("Chagigah 20b:15-21a:1")

    n = SegmentSplicer().splice_this_into_next(Ref("Chagigah 20b:13"))
    assert n._needs_rewrite(Ref("Chagigah 20b:14-21a:1"))
    assert n._rewrite(Ref("Chagigah 20b:14-21a:1")) == Ref("Chagigah 20b:13-21a:1")

@pytest.mark.deep
def test_report():
    n = SegmentSplicer().splice_next_into_this(Ref("Shabbat 25b:11"))
    n.report()

def test_es_cleanup():
    n = SegmentSplicer().splice_next_into_this(Ref("Shabbat 65a:11"))
    n._report = True
    n._clean_elastisearch()

@pytest.mark.deep
def test_sheet_cleanup():
    n = SegmentSplicer().splice_next_into_this(Ref("Shabbat 25b:11"))
    n._report = True
    n._find_sheets()
    n._clean_sheets()

@pytest.mark.deep
def test_insert():
    n = SegmentSplicer().insert_blank_segment_after(Ref("Shabbat 25b:11"))
    n.report()
