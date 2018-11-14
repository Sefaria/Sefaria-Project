# -*- coding: utf-8 -*-

"""
Tests for virtual texts, like dictionries
Handling virtual schema nodes
Refs pointing to virtual schemas, etc

"""

from sefaria.model import *


class Test_VirtualRefs(object):

    def test_identity(self):
        assert Ref(u'Jastrow,_אַבִּיר.1').url() == u"Jastrow,_אַבִּיר.1"

    def test_parse_of_base(self):
        r = Ref(u'Jastrow')

    def test_parse_of_section(self):
        r = Ref(u'Jastrow, אֱגוּזָא')
        assert r.sections == []
        assert r.index_node.full_title("en") == u"Jastrow, אֱגוּזָא"
        assert r.normal() == u"Jastrow, אֱגוּזָא"

    def test_section_identity(self):
        r1 = Ref(u'Jastrow, אֱגוּזָא')
        r2 = Ref(u'Jastrow,_אֱגוּזָא')
        assert r1 == r2

    def test_parse_of_segment(self):
        r = Ref(u'Jastrow, אֱגוּזָא 1')
        assert r.sections == [1]
        assert r.index_node.full_title("en") == u"Jastrow, אֱגוּזָא"
        assert r.normal() == u'Jastrow, אֱגוּזָא 1'

    def test_segment_identity(self):
        r1 = Ref(u'Jastrow, אֱגוּזָא 1')
        r2 = Ref(u'Jastrow,_אֱגוּזָא.1')
        assert r1 == r2