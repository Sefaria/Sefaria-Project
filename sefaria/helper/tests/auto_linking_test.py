# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.helper.link import rebuild_links_for_title, AutoLinkerFactory
import sefaria.tracker as tracker

class Test_AutoLinker(object):
    desired_link_counts = {
        'Rashi on Genesis' : 2018,
        'Kos Shel Eliyahu on Pesach Haggadah': 80
    }

    def test_rebuild_commentary_links(self):
        #test simple adding links
        title = 'Rashi on Genesis'
        rf = Ref(title)
        desired_link_count = self.desired_link_counts[title] #LinkSet({"refs": {"$regex": rf.regex()},"auto": True, "generated_by": "add_commentary_links"}).count()
        linker = rf.autolinker()
        found = linker.rebuild_links()
        assert len(found) == desired_link_count


    def test_rebuild_commentary_links_complex(self):
        title = 'Kos Shel Eliyahu on Pesach Haggadah'
        rf = Ref(title)
        linker = rf.autolinker(user=1)
        desired_link_count = self.desired_link_counts[title]
        found = linker.rebuild_links()
        assert len(found) == desired_link_count


    def test_add_commentary_links_default_node(self):
        title = "Be'er Mayim Chaim on Chofetz Chaim"
        rf = Ref(title)
        linker = rf.autolinker()
        found = linker.build_links()


    def test_refresh_commentary_links(self):
        #test that there are the same number of links before and after
        title = 'Rashi on Genesis'
        rf = Ref(title)
        regex = rf.regex()
        desired_link_count = self.desired_link_counts[title]
        linker = rf.autolinker()
        linker.refresh_links()
        link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert desired_link_count == link_count


    def test_refresh_commentary_links_complex(self):
        #test that there are the same number of links before and after
        title = 'Kos Shel Eliyahu on Pesach Haggadah'
        rf = Ref(title)
        regex = rf.regex()
        desired_link_count = self.desired_link_counts[title]
        linker = rf.autolinker()
        linker.refresh_links()
        link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert desired_link_count == link_count


    def test_refresh_links_with_text_save(self):
        title = 'Rashi on Genesis'
        section_tref = 'Rashi on Genesis 18:22'
        stext = [u"כךל שדךלגכח ש ךלדקחכ ףךדלכח שףךדג", u"כךל שדךלגכח ש ךלדקחכ ףךדלכח שףךדג", u"כךל שדךלגכח ש ךלדקחכ ףךדלכח שףךדג"]
        lang = 'he'
        vtitle = "test"
        oref = Ref(section_tref)
        rf = Ref(title)
        regex = rf.regex()
        #original count
        desired_link_count = self.desired_link_counts[title]
        # add some text (adding one more comment than there is already)
        tracker.modify_text(1, oref, vtitle, lang, stext)
        link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert link_count == (desired_link_count+1)
        # now delete
        chunk = TextChunk(oref, lang, vtitle)
        chunk.text = chunk.text[:-1]
        tracker.modify_text(1, oref, vtitle, lang, chunk.text)
        link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert link_count == desired_link_count

    def test_refresh_links_with_text_save_complex(self):
        title = 'Kos Shel Eliyahu on Pesach Haggadah'
        section_tref = 'Kos Shel Eliyahu on Pesach Haggadah, Kadesh 1'
        stext = ["thlerkawje alkejal ekjlkej", "eaflkje arheahrlka jhklajdhkl ADJHKL"]
        lang = 'he'
        vtitle = "test"
        oref = Ref(section_tref)
        rf = Ref(title)
        regex = rf.regex()
        #original count
        desired_link_count = self.desired_link_counts[title]
        # add some text (adding two more comment than there is already)
        tracker.modify_text(1, oref, vtitle, lang, stext)
        link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert link_count == (desired_link_count+2)
        # now delete
        chunk = TextChunk(oref, lang, vtitle)
        chunk.text = chunk.text[:-2]
        tracker.modify_text(1, oref, vtitle, lang, chunk.text)
        link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert link_count == desired_link_count




