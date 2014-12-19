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
            ["Part 1 Line 1:1", "This is the first second", "First third"],
            ["Chapter 2, Verse 1", "2:2", "2:3"],
            ["Third first", "Third second", "Third third"]
        ],
        [
            ["Part 2 Line 1:1", "This is the first second", "First third"],
            ["Chapter 2, Verse 1", "2:2", "2:3"],
            ["Third first", "Third second", "Third third"]
        ],
        [
            ["Part 3 Line 1:1", "This is the first second", "First third"],
            ["Chapter 2, Verse 1", "2:2", "2:3"],
            ["Third first", "Third second", "Third third"]
        ],
    ]


class Test_Jagged_Text_Array(object):

    def test_count_words(self):
        assert ja.JaggedTextArray(twoby).word_count() == 21
        assert ja.JaggedTextArray(threeby).word_count() == 69


    def test_count_chars(self):
        assert ja.JaggedTextArray(twoby).char_count() == 101
        assert ja.JaggedTextArray(threeby).char_count() == 324

    def test_verse_count(self):
        assert ja.JaggedTextArray(twoby).verse_count() == 9
        assert ja.JaggedTextArray(threeby).verse_count() == 27

    def test_equality(self):
        assert ja.JaggedTextArray(twoby) == ja.JaggedTextArray(twoby)
        assert ja.JaggedTextArray(threeby) == ja.JaggedTextArray(threeby)
        assert ja.JaggedTextArray(twoby) != ja.JaggedTextArray(threeby)

    def test_subarray(self):
        assert ja.JaggedTextArray(threeby).subarray([0],[0]) == ja.JaggedTextArray([
            ["Part 1 Line 1:1", "This is the first second", "First third"],
            ["Chapter 2, Verse 1", "2:2", "2:3"],
            ["Third first", "Third second", "Third third"]
        ])
        assert ja.JaggedTextArray(threeby).subarray([1],[1]) == ja.JaggedTextArray([
            ["Part 2 Line 1:1", "This is the first second", "First third"],
            ["Chapter 2, Verse 1", "2:2", "2:3"],
            ["Third first", "Third second", "Third third"]
        ])
        assert ja.JaggedTextArray(threeby).subarray([1,1,1],[1,2,1]) == ja.JaggedTextArray([
            ["2:2", "2:3"],
            ["Third first", "Third second"]
        ])

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

    def test_is_full(self):
        assert ja.JaggedTextArray(twoby).is_full()
        assert ja.JaggedTextArray(threeby).is_full()
        assert not ja.JaggedTextArray([]).is_full()
        assert not ja.JaggedTextArray([[]]).is_full()
        assert not ja.JaggedTextArray([[""]]).is_full()
        assert not ja.JaggedTextArray([["a","b","c",""]]).is_full()
        assert not ja.JaggedTextArray([["a","b","c",[""]]]).is_full()

    def test_is_empty(self):
        assert not ja.JaggedTextArray(twoby).is_empty()
        assert not ja.JaggedTextArray(threeby).is_empty()
        assert ja.JaggedTextArray([]).is_empty()
        assert ja.JaggedTextArray([[]]).is_empty()
        assert ja.JaggedTextArray([[""]]).is_empty()
        assert not ja.JaggedTextArray([["a","b","c",""]]).is_empty()
        assert not ja.JaggedTextArray([["a","b","c",[""]]]).is_empty()

    def test_sections(self):
        assert ja.JaggedTextArray(twoby).sections() == [[0],[1],[2]]
        assert ja.JaggedTextArray(threeby).sections() == [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]]