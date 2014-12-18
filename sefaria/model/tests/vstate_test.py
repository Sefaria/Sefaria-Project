# -*- coding: utf-8 -*-

from sefaria.model import *


class Test_VState(object):

    def test_integrity(self):
        titles = ["Exodus", "Shabbat", "Rashi on Exodus", "Rashi on Shabbat"]
        for title in titles:
            index = get_index(title)
            vs = VersionState(index)
            assert getattr(vs, "title")
            assert getattr(vs, "content")
