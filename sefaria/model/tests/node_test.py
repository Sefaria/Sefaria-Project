# -*- coding: utf-8 -*-

import pytest

from sefaria.model import *
from sefaria.model.text import SchemaNode, SchemaContentNode, SchemaStructureNode, JaggedArrayNode, JaggedArrayCommentatorNode, StringNode
from sefaria.system.exceptions import IndexSchemaError


class Test_Titles(object):

    def test_add(self):
        j = JaggedArrayNode()
        j.add_title(u"title1", "en", primary=True)
        j.add_title(u"ייי", "he", primary=True)
        j.add_title(u"title2", "en")
        j.add_title(u"ייכי", "he")
        assert len(j.all_node_titles("he")) == 2
        assert len(j.all_node_titles("en")) == 2

        assert j.primary_title("en") == u"title1"
        j.add_title(u"title3", "en", primary=True, replace_primary=True)
        assert len(j.all_node_titles("en")) == 3
        assert len(j.all_node_titles("he")) == 2
        assert j.primary_title("en") == u"title3"



    def test_duplicate_primary(self):
        with pytest.raises(IndexSchemaError):
            j = JaggedArrayNode()
            j.add_title(u"title1", "en", primary=True)
            j.add_title(u"title2", "en", primary=True)

        with pytest.raises(IndexSchemaError):
            j = JaggedArrayNode()
            j.add_title(u"ייי", "he", primary=True)
            j.add_title(u"ייעי", "he", primary=True)