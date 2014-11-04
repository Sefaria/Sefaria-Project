# -*- coding: utf-8 -*-


import pytest
import pprint
import sefaria.model as model
import sefaria.library as lib


class Test_Library(object):
    def test_get_title_node_dict(self):
        l = lib.Library()
        l.get_title_node_dict("en")