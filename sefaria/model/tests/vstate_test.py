# -*- coding: utf-8 -*-

from sefaria.model import *


class Test_VState(object):

    def test_integrity(self):
        titles = ["Exodus", "Shabbat", "Rashi on Exodus", "Rashi on Genesis", "Rashi on Shabbat"]
        for title in titles:
            index = library.get_index(title)
            vs = VersionState(index)
            assert getattr(vs, "title")
            assert getattr(vs, "content")


class Test_VSNode(object):
    def test_section_counts(self):
        sn = StateNode("Exodus")
        cd = sn.get_available_counts_dict("he")
        assert "Chapter" in cd
        assert "Verse" in cd
        assert sn.get_available_counts_dict("en") == cd

        sn = StateNode("Shabbat")
        cd = sn.get_available_counts_dict("he")
        assert "Daf" in cd
        assert "Amud" in cd
        assert "Line" in cd

        sn = StateNode("Rashi on Shabbat")
        cd = sn.get_available_counts_dict("he")
        assert "Daf" in cd
        assert "Amud" in cd
        assert "Line" in cd
        assert "Comment" in cd

        sn = StateNode("Rashi on Exodus")
        cd = sn.get_available_counts_dict("he")
        assert "Chapter" in cd
        assert "Verse" in cd
        assert "Comment" in cd

