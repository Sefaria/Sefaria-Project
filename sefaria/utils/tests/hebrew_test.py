# -*- coding: utf-8 -*-

from sefaria.utils import hebrew as h


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

class TestIsHebrew():
    def test_is_hebrew(self):
        assert h.is_hebrew("ג")

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