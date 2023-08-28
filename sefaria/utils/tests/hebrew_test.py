# -*- coding: utf-8 -*-

from sefaria.utils import hebrew as h
import pytest

def setup_module(module):
    global e
    global d
    e = h.encode_hebrew_numeral
    d = h.decode_hebrew_numeral


class TestSanityCheck():

    def test_can_encode_without_errors(self):
        for x in range(1, 5000):
            _ = h.encode_hebrew_numeral(x)

    def test_encodes_and_decodes_correctly(self):
        for x in range(1, 5000):
            if x in (2000, 3000, 4000, 5000):
                # known ambiguity with single thousands above 1000
                pass
            else:
                assert x == h.decode_hebrew_numeral(h.encode_hebrew_numeral(x))


class TestSpecificInOutTests():

    def test_some_basic_encoding_tests(self):
        assert 'ש׳' == e(300)
        assert 'ל״ג' == e(33, True)
        assert 'ה׳תשס״ד' == e(5764)
        assert 'א׳׳ה' == e(1000005)

    def test_special_cases_tests(self):
        assert 'ער״ה' == e(275)
        assert 'ע״ר' == e(270)
        assert 'ער״ב' == e(272)

        assert 'ט״ו' == e(15)
        assert 'ט״ז' == e(16)

    def test_encoding_without_punctuation(self):
        assert 'לה' == e(35, False)
        assert 'מב' == e(42, False)
        assert 'קכט' == e(129, False)


    def test_some_basic_decoding_tests(self):
        assert d('א') == 1
        assert d('תתש') == 1100
        assert d('תקט״ו') == 515
        assert d('ה׳תשס״ד') == 5764
        assert d("ד'") == 4

    def test_undefined_conventions(self):
        assert 'טו׳' == e(15000)
        assert 'טז׳' == e(16000)


class TestFunctionTests(object):

    def test_break_int_magnitudes(self):
        assert h.break_int_magnitudes(15000) == [10000, 5000, 0, 0, 0]


class TestNikkudUtils():

    def test_strip_nikkud(self):
        assert h.strip_nikkud('הַדְּבָרִים אֲשֶׁר') == 'הדברים אשר'
        assert h.strip_nikkud("הַמּוֹצִיא בְמִסְפָּר צְבָאָם לְכֻלָּם בְּשֵׁם יִקְרָא") == "המוציא במספר צבאם לכלם בשם יקרא"


class TestIsHebrewFuncs:
    """
    Tests the various functions that check for the amount of Hebrew in a string
    """
    def test_has_hebrew(self):
        assert h.has_hebrew("ג")
        assert h.has_hebrew("שלום world")
        assert not h.has_hebrew("hello world")

    def test_is_all_hebrew(self):
        assert h.is_all_hebrew("גגגדגחח")
        assert not h.is_all_hebrew("שלום world")

    def test_is_mostly_hebrew(self):
        assert h.is_mostly_hebrew("שלום עולם")
        assert not h.is_mostly_hebrew("שלום world")  # exactly one less than half
        assert not h.is_mostly_hebrew("שלוגם world")  # exactly half
        assert h.is_mostly_hebrew("שלוגם word")  # exactly one more than half
        assert not h.is_mostly_hebrew("word לשוםג", len_to_check=4)
        assert h.is_mostly_hebrew("גשגכדגכשדגכדלשוםג", len_to_check=4)


class TestGematria():
    def test_simple_gematria(self):
        assert h.gematria("צדיק") == 204
        assert h.gematria("צדיק גמור") == 204 + 249
        assert h.gematria("אבגדהוזחטיכלמנסעפצקרשת") == 1000 + 450 + 45

    def test_final_letters(self):
        # Assumption is that final letters are counted as simple
        assert h.gematria("םןףךץ") == 280

    def test_with_nikkud(self):
        assert h.gematria('הַדְּבָרִים אֲשֶׁר') == 501 + 261

    def test_punctuation(self):
        assert h.gematria("אבגדהוזחטיכלמנסעפקרשת") == h.gematria("אב[]גדהוז{}()?!ח..,,טיכלמנס    - -עפקרשת")


@pytest.mark.parametrize(('hebrew', 'other_hebrew', 'should_match'), [
    ("אבג דהוז חטיכ", "אבג דהוז חטיכ", True),    # same
    ("אבג דהוז חטיכ", "אבג דהוז", True),         # same other shorter
    ("אבג דהוז", "אבג דהוז חטיכ", False),        # same other longer
    ("אמר רבי יהודה", "אמר ר״י", True),          # same other abbrev
    ("אמר ר״י", "אמר רבי יהודה", True),          # same orig abbrev
    ("הבית כנסת פתוח", "הביכ״נ פתוח רק", False),  # same other longer abbrev
    ("אע״ג שרבי שמעול בן גמליאל שמר שבית שאשרעש לגכשג", "אף על גב שרשב״ג שמר שבשאש״ל", True),    # multiple abbrevs
    ("אע״ג שרבי שמעול בן גמליאל שמר שבית שארעש לגכשג", "אף על גב שרשב״ג שמר שבשאש״ל", False),    # diff multiple abbrevs
])
def test_hebrew_starts_with(hebrew, other_hebrew, should_match):
    assert h.hebrew_starts_with(hebrew, other_hebrew) == should_match


@pytest.mark.parametrize(('abbr', 'unabbr', 'match'), [
    ("אעג", "אף על גב", "אף על גב"),
    pytest.param("אפעג", "אף על גב", "אף על גב", marks=pytest.mark.xfail(reason="cannot handle non-sofit letters in abbrev matching sofit in unabbr")),
    ("כארגלב", "כגשג ארשלקן גל בדגש", "כגשג ארשלקן גל בדגש"),
    ("כאגלב", "כגשג ארשלקן גל בדגש", "כגשג ארשלקן גל בדגש"),
    ("כאב", "כגשג ארשלקן גל בדגש", None),
    ("כאר", "כגשג ארשלקן גל בדגש", "כגשג ארשלקן"),
])
def test_get_abbr(abbr, unabbr, match):
    unabbr_words = unabbr.split()
    test_match = h.get_abbr(abbr, unabbr_words)
    if match is not None:
        match = match.split()
    assert test_match == match
