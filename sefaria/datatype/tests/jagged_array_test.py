# -*- coding: utf-8 -*-

import sefaria.datatype.jagged_array as ja


def setup_module(module):
    global twoby, threeby, two_by_mask
    twoby = [
                ["Line 1:1", "This is the first second", "First third"],
                ["Chapter 2, Verse 1", "2:2", "2:3"],
                ["Third first", "Third second", "Third third"]
    ]
    two_by_mask = [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1]
    ]
    threeby = [
        [
            ["Line 1:1", "This is the first second", "First third"],
            ["Chapter 2, Verse 1", "2:2", "2:3"],
            ["Third first", "Third second", "Third third"]
        ],
        [
            ["Line 1:1", "This is the first second", "First third"],
            ["Chapter 2, Verse 1", "2:2", "2:3"],
            ["Third first", "Third second", "Third third"]
        ],
        [
            ["Line 1:1", "This is the first second", "First third"],
            ["Chapter 2, Verse 1", "2:2", "2:3"],
            ["Third first", "Third second", "Third third"]
        ],
    ]


class Test_Jagged_Text_Array(object):

    def test_count_words(self):
        assert ja.JaggedTextArray(twoby).word_count() == 21
        assert ja.JaggedTextArray(threeby).word_count() == 63


    def test_count_chars(self):
        assert ja.JaggedTextArray(twoby).char_count() == 101
        assert ja.JaggedTextArray(threeby).char_count() == 303

    def test_verse_count(self):
        assert ja.JaggedTextArray(twoby).verse_count() == 9
        assert ja.JaggedTextArray(threeby).verse_count() == 27

    def test_equality(self):
        assert ja.JaggedTextArray(twoby) == ja.JaggedTextArray(twoby)
        assert ja.JaggedTextArray(threeby) == ja.JaggedTextArray(threeby)
        assert ja.JaggedTextArray(twoby) != ja.JaggedTextArray(threeby)

    def test_mask(self):
        assert ja.JaggedTextArray(twoby).mask() == ja.JaggedIntArray(two_by_mask)
        assert ja.JaggedTextArray(
            [
                ["a",[],[],["",""],["b"]],
                ["a",[],["","a"],["",""],["b"]]
            ]
        ).mask() == ja.JaggedIntArray(
            [
                [1,[],[],[0,0],[1]],
                [1,[],[0,1],[0,0],[1]]
            ]
        )
