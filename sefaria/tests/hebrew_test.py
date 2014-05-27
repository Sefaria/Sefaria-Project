# -*- coding: utf-8 -*-
import pytest

from .. import hebrew as h

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
        assert u'ש׳' == e(300)
        assert u'ל״ג' == e(33, True)
        assert u'ה׳תשס״ד' == e(5764)
        assert u'א׳׳ה' == e(1000005)

    def test_special_cases_tests(self):
        assert u'ער״ה' == e(275)
        assert u'ע״ר' == e(270)
        assert u'ער״ב' == e(272)

        assert u'ט״ו' == e(15)
        assert u'ט״ז' == e(16)

    def test_encoding_without_punctuation(self):
        assert u'לה' == e(35, False)
        assert u'מב' == e(42, False)
        assert u'קכט' == e(129, False)


    def test_some_basic_decoding_tests(self):
        assert d(u'א') == 1
        assert d(u'תתש') == 1100
        assert d(u'תקט״ו') == 515
        assert d(u'ה׳תשס״ד') == 5764
        assert d(u"ד'") == 4

    def test_undefined_conventions(self):
        assert u'טו׳' == e(15000)
        assert u'טז׳' == e(16000)

def TestFunctionTests():

    def test_break_int_magnitudes(self):
        assert h.break_int_magnitudes(15000) == [10000, 5000, 0, 0, 0]