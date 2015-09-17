import pytest

from sefaria.model import *
from sefaria.helper.splice import Splicer


def test_splice_mode_equivalence():
    n = Splicer().spliceNextIntoThis(Ref("Shabbat 45b:11"))
    assert n == Splicer().spliceThisIntoNext(Ref("Shabbat 45b:11"))
    assert n == Splicer().splicePrevIntoThis(Ref("Shabbat 45b:12"))
    assert n == Splicer().spliceThisIntoPrev(Ref("Shabbat 45b:12"))

def test_join_rewrite():
    n = Splicer().spliceNextIntoThis(Ref("Shabbat 45b:11"))
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


def test_insert_rewrite():
    n = Splicer().insert_blank_segment_after(Ref("Shabbat 45b:11"))
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


def test_report():
    n = Splicer().spliceNextIntoThis(Ref("Shabbat 25b:11"))
    n.report()

def test_es_cleanup():
    n = Splicer().spliceNextIntoThis(Ref("Shabbat 65a:11"))
    n._report = True
    n._clean_elastisearch()

def test_sheet_cleanup():
    n = Splicer().spliceNextIntoThis(Ref("Shabbat 25b:11"))
    n._report = True
    n._find_sheets()
    n._clean_sheets()

def test_insert():
    n = Splicer().insert_blank_segment_after(Ref("Shabbat 25b:11"))
    n.report()
