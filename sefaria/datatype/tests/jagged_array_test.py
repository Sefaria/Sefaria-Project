# -*- coding: utf-8 -*-

import sefaria.datatype.jagged_array as ja
import pytest


def setup_module(module):
    global twoby, threeby, threeby_empty_section, two_by_mask
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
    threeby_empty_section = [
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
            [],
            []
        ],
        [
            ["Part 3 Line 1:1", "This is the first second", "First third"],
            ["Chapter 2, Verse 1", "2:2", "2:3"],
            ["Third first", "Third second", "Third third"]
        ],
    ]

class Test_Jagged_Array(object):

    def test_ja_normalize(self):
        input_ja = ["a",[],["","a", ["c"]],["",""],["b"]]
        output_ja = [[["a"]],[],[[],["a"], ["c"]],[[],[]],[["b"]]]
        jaobj = ja.JaggedArray(input_ja)
        jaobj.normalize()
        assert jaobj.array() == output_ja

    def test_last_index(self):
        assert ja.JaggedIntArray([
            [[1,3],[4,5],[7]],
            [[1,2,3],[2,2],[8,8,8]],
            [[0],[1],[2,3,4],[7,7,7,7,7]]
        ]).last_index(3) == [2, 3, 4]
        assert ja.JaggedIntArray([
            [[1,3],[4,5],[7]],
            [[1,2,3],[2,2],[8,8,8]],
            [[0],[1],[2,3,4],[7,7,7,7,7],[],[]]
        ]).last_index(3) == [2, 3, 4]


class Test_Jagged_Int_Array(object):
    def test_sum(self):
        x = ja.JaggedIntArray([[1, 2], [3, 4]]) + ja.JaggedIntArray([[2, 3], [4]])
        assert x.array() == [[3, 5], [7, 4]]

class Test_Jagged_Text_Array(object):
    def test_until_last_nonempty(self):
        sparse_ja = ja.JaggedTextArray([["", "", ""], ["", "foo", "", "bar", ""], ["", "", ""],[]])
        assert sparse_ja.sub_array_length([],until_last_nonempty=True) == 3

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


    def test_distance(self):
        jia = ja.JaggedTextArray(threeby)
        jia_empty = ja.JaggedTextArray(threeby_empty_section)
        assert jia.distance([0],[0,0,2]) == 2 #check if padding correctly
        assert jia.distance([0],[0,2]) == 6 #padding for both inputs
        assert jia.distance([0,0,1],[2,2,2]) == 25 #recursive distance
        assert jia_empty.distance([0,0,1], [3,2,2])  == 25
        assert jia_empty.distance([0,0,1], [2,1,3]) == 17
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

        assert ja.JaggedTextArray(threeby).subarray([1, 1, 1], [1, 1, 2]) == ja.JaggedTextArray(
            ["2:2", "2:3"],
        )

    def test_set_element(self):
        j = ja.JaggedTextArray(twoby).set_element([1,1], "Foobar")
        assert j.get_element([1, 1]) == "Foobar"
        assert j.array() == [
                ["Line 1:1", "This is the first second", "First third"],
                ["Chapter 2, Verse 1", "Foobar", "2:3"],
                ["Third first", "Third second", "Third third"]
        ]
        j = ja.JaggedTextArray(twoby).set_element([1], ["Foobar", "Flan", "Bob"])
        assert j.get_element([1]) == ["Foobar", "Flan", "Bob"]
        assert j.array() == [
                ["Line 1:1", "This is the first second", "First third"],
                ["Foobar", "Flan", "Bob"],
                ["Third first", "Third second", "Third third"]
        ]
        j = ja.JaggedTextArray()
        assert j.set_element([2, 3], "Foo").array() == [
            [],
            [],
            [None, None, None, "Foo"]
        ]

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

        assert ja.JaggedTextArray(
            [
                ["a",[],[],["",""],["b"]],
                ["a",[],["","a"],["",""],["b"]]
            ]
        ).zero_mask() == ja.JaggedIntArray(
            [
                [0,[],[],[0,0],[0]],
                [0,[],[0,0],[0,0],[0]]
            ]
        )

        assert ja.JaggedTextArray(
            [
                ["a",[],[],["",""],["b"]],
                ["a",[],["","a"],["",""],["b"]]
            ]
        ).constant_mask(None) == ja.JaggedIntArray(
            [
                [None,[],[],[None,None],[None]],
                [None,[],[None,None],[None,None],[None]]
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

    def test_shape(self):
        assert ja.JaggedTextArray(twoby).shape() == [3,3,3]
        assert ja.JaggedTextArray(threeby).shape() == [[3, 3, 3],[3, 3, 3],[3, 3, 3]]
        assert ja.JaggedTextArray(["a","b","c"]).shape() == 3

    def test_trim_ending_whitespace(self):
        depth_two = [["a", "b"], ["a"], ["d"]]
        depth_two_with_space = [["a", "b", ""], ["a", ""], ["d"]]
        depth_three = [[["a"], []], [["a", "", "b"], ["", "a", "b", "c"]]]
        depth_three_with_space = [[["a", ""], [""]], [["a", "", "b"], ["", "a", "b", "c"]]]
        # do no harm
        assert ja.JaggedTextArray(depth_two).trim_ending_whitespace() == ja.JaggedTextArray(depth_two)
        assert ja.JaggedTextArray(depth_three).trim_ending_whitespace() == ja.JaggedTextArray(depth_three)

        # trim
        assert ja.JaggedTextArray(["a","b","c","",""]).trim_ending_whitespace() == ja.JaggedTextArray(["a","b","c"])
        assert ja.JaggedTextArray(["",None,"\t\n ","",""]).trim_ending_whitespace() == ja.JaggedTextArray([])
        assert ja.JaggedTextArray(["", ["a"]]).trim_ending_whitespace() == ja.JaggedTextArray(["", ["a"]])
        assert ja.JaggedTextArray([[""], "a"]).trim_ending_whitespace() == ja.JaggedTextArray([[], "a"])
        assert ja.JaggedTextArray(depth_two_with_space).trim_ending_whitespace() == ja.JaggedTextArray(depth_two)
        assert ja.JaggedTextArray(depth_three_with_space).trim_ending_whitespace() == ja.JaggedTextArray(depth_three)

    def test_overlap(self):
        a = ja.JaggedTextArray([["","b",""],["d","","f"],["","h",""]])
        b = ja.JaggedTextArray([["","","c"],["","e",""],["g","",""]])
        c = ja.JaggedTextArray([["","",""],["","q",""],["","",""]])
        assert not a.overlaps(b)
        assert not a.overlaps(c)
        assert b.overlaps(c)

    def test_resize(self):
        assert ja.JaggedTextArray(twoby).resize(1).resize(-1) == ja.JaggedTextArray(twoby)

    def test_resize_with_empty_string(self):
        a = ["Foo","Bar","","Quux"]
        assert ja.JaggedTextArray(a).resize(1).resize(-1) == ja.JaggedTextArray(a)

        # A bug had left [] alone during downsize.
        b = [["Foo"],["Bar"],[],["Quux"]]
        c = [["Foo"],["Bar"],[""],["Quux"]]

        jb = ja.JaggedTextArray(b).resize(-1)
        jc = ja.JaggedTextArray(c).resize(-1)
        assert jb == jc, "{} != {}".format(jb.array(), jc.array())

    def test_flatten_to_array(self):
        assert ja.JaggedTextArray(threeby).flatten_to_array() == [
            "Part 1 Line 1:1", "This is the first second", "First third",
            "Chapter 2, Verse 1", "2:2", "2:3",
            "Third first", "Third second", "Third third",
            "Part 2 Line 1:1", "This is the first second", "First third",
            "Chapter 2, Verse 1", "2:2", "2:3",
            "Third first", "Third second", "Third third",
            "Part 3 Line 1:1", "This is the first second", "First third",
            "Chapter 2, Verse 1", "2:2", "2:3",
            "Third first", "Third second", "Third third"
        ]

    def test_flatten_to_string(self):
        assert ja.JaggedTextArray("Test").flatten_to_string() == "Test"
        assert ja.JaggedTextArray(["Test", "More", "Test"]).flatten_to_string() == "Test More Test"

    def test_next_prev(self):
        sparse_ja = ja.JaggedTextArray([["","",""],["","foo","","bar",""],["","",""]])
        assert sparse_ja.next_index([0,0]) == [1, 1]
        assert sparse_ja.next_index([]) == [1, 1]
        assert sparse_ja.next_index() == [1, 1]

        assert sparse_ja.prev_index([]) == [1, 3]
        assert sparse_ja.prev_index() == [1, 3]


class Test_Depth_0(object):
    def test_depth_0(self):
        j = ja.JaggedTextArray("Fee Fi Fo Fum")
        assert j._store == "Fee Fi Fo Fum"
        assert j.is_full()
        assert not j.is_empty()
        assert j.verse_count() == 1
        assert j.mask() == ja.JaggedIntArray(1)
        assert j.flatten_to_array() == ["Fee Fi Fo Fum"]


class Test_Modify_by_Func():

    def test_modify_by_func(self):
        j = ja.JaggedTextArray(threeby_empty_section)
        self.modifier_input = []
        j.modify_by_function(self.modifier)
        assert self.modifier_input[0][1] == [0,0,0]
        assert self.modifier_input[-1][1] == [3,2,2]
        assert self.modifier_input[-1][0] == threeby_empty_section[3][2][2]

        self.modifier_input = []
        j.modify_by_function(self.modifier, start_sections=[1,2,3,4,5])
        assert self.modifier_input[0][1] == [1,2,3,4,5]
        assert self.modifier_input[-1][1] == [1,2,6,2,2]

    def modifier(self, s, sections):
        self.modifier_input += [(s, sections)]
        return s

