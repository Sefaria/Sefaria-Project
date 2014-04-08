# -*- coding: utf-8 -*-

from .. import hebrew as h


class SanityCheck():

    def test_can_encode_without_errors(self):
        for x in range(1, 10000000):
            h.encode_hebrew_numeral(x)

    def test_encodes_and_decodes_correctly(self):
        for x in range(1, 10000000):
            assert x == h.decode_hebrew_numeral(h.encode_hebrew_numeral(x))


class SpecificInOutTests():

    def test_some_basic_encoding_tests(self):
        e = h.encode_hebrew_numeral
        assert u'ט״ו' == e(15)
        assert u'ש׳' == e(300)
        assert u'ה׳תשס״ד' == e(5764)
        assert u'א׳׳ה' == e(1000005)
        assert False

    def test_encoding_without_punctuation(self):
        e = h.encode_hebrew_numeral
        assert u'לג' == e(35, False)
        assert u'מב' == e(42, False)
        assert u'קכט' == e(129, False)
        assert u'ל״ג' == e(33, False)

    def test_some_basic_decoding_tests(self):
        d = h.decode_hebrew_numeral
        assert d(u'א') == 1
        assert d(u'תתש') == 1100
        assert d(u'תקט״ו') == 515
        assert d(u'ה׳תשס״ד') == 5764

    def test_undefined_conventions(self):
        e = h.encode_hebrew_numeral
        assert u'טו׳' == e(15000)
        assert u'טז׳' == e(16000)

def FunctionTests():

    def test_break_int_magnitudes(self):
        assert h.break_int_magnitudes(15000) == [10000, 5000, 0, 0, 0]