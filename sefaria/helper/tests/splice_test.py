import pytest

from sefaria.model import *
from sefaria.helper.splice import Splicer


def test_splice_mode_equivalence():
    n = Splicer().spliceNextIntoThis(Ref("Shabbat 45b:11"))
    assert n == Splicer().spliceThisIntoNext(Ref("Shabbat 45b:11"))
    assert n == Splicer().splicePrevIntoThis(Ref("Shabbat 45b:12"))
    assert n == Splicer().spliceThisIntoPrev(Ref("Shabbat 45b:12"))

def test_rewrite():
    n = Splicer().spliceNextIntoThis(Ref("Shabbat 45b:11"))
    assert n._rewrite(Ref("Rashi on Shabbat 45b:15:1"), commentary=True) == Ref("Rashi on Shabbat 45b:14:1")

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