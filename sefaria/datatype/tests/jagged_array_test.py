# -*- coding: utf-8 -*-

import sefaria.datatype.jagged_array as ja


def setup_module(module):
    global twoby
    twoby = [
                ["Line 1:1", "This is the first second", "First third"],
                ["Chapter 2, Verse 1", "2:2", "2:3"],
                ["Third first", "Third second", "Third third"]
    ]


class Test_Jagged_Text_Array():

    def test_count_words(self):
        assert ja.JaggedTextArray(twoby).word_count() == 21

    def test_count_chars(self):
        assert ja.JaggedTextArray(twoby).char_count() == 101

    def test_verse_count(self):
        assert ja.JaggedTextArray(twoby).verse_count() == 9