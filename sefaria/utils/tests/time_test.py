from sefaria.utils.util import concise_natural_time as cnt
from datetime import datetime


def test_concise_natural_time():
    end = datetime(2000, 1, 1)  # y2k
    start = datetime(2000, 1, 1, 0, 0, 0)  # y2k
    assert cnt(start, end) == u"now"
    start = datetime(1999, 12, 31, 23, 59, 59)
    assert cnt(start, end) == u"1 second"
    start = datetime(1999, 12, 31, 23, 59, 58)
    assert cnt(start, end) == u"2 seconds"
    start = datetime(1999, 12, 31, 23, 59, 1)
    assert cnt(start, end) == u"59 seconds"
    start = datetime(1999, 12, 31, 23, 59, 0)
    assert cnt(start, end) == u"1 minute"
    start = datetime(1999, 12, 31, 23, 58, 1)
    assert cnt(start, end) == u"1 minute"
    start = datetime(1999, 12, 31, 23, 58, 0)
    assert cnt(start, end) == u"2 minutes"
    start = datetime(1999, 12, 31, 23, 1, 3)
    assert cnt(start, end) == u"58 minutes"
    start = datetime(1999, 12, 30, 23, 1, 3)
    assert cnt(start, end) == u"1 day"
    start = datetime(1999, 12, 24, 23, 1, 3)
    assert cnt(start, end) == u"1 week"
    start = datetime(1999, 12, 17, 23, 1, 3)
    assert cnt(start, end) == u"2 weeks"
    start = datetime(1999, 12, 1, 23, 1, 3)
    assert cnt(start, end) == u"1 month"
    start = datetime(1999, 9, 30, 23, 1, 3)
    assert cnt(start, end) == u"3 months"
    start = datetime(1000, 9, 30, 23, 1, 3)
    assert cnt(start, end) == u"999 years"

