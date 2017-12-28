# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.helper.link import rebuild_links_for_title, AutoLinkerFactory
import sefaria.tracker as tracker
from sefaria.helper.schema import convert_simple_index_to_complex, insert_first_child


class Test_AutoLinker(object):
    desired_link_counts = {
        'Rashi on Genesis': 2018,
        'Kos Shel Eliyahu on Pesach Haggadah': 80,
        'Rashi on Deuteronomy': 1370,
        "Onkelos Genesis": 1533
    }

    def test_rebuild_commentary_links(self):
        #test simple adding links
        title = 'Rashi on Genesis'
        rf = Ref(title)
        desired_link_count = self.desired_link_counts[title] #LinkSet({"refs": {"$regex": rf.regex()},"auto": True, "generated_by": "add_commentary_links"}).count()
        linker = rf.autolinker()
        found = linker.rebuild_links()
        assert len(found) == desired_link_count

    def test_rebuild_commentary_links_default_node(self):
        many_to_one = ("many_to_one_default_only", "Rashi on Deuteronomy", "Deuteronomy")
        one_to_one = ("one_to_one_default_only", "Onkelos Genesis", "Genesis")
        for type in [many_to_one]:
            # convert simple text to a complex text with default node and add base_text_* and dependence properties
            title = type[1]
            base = type[2]
            index = library.get_index(title)
            convert_simple_index_to_complex(index)
            index.base_text_mapping = type[0]
            index.base_text_titles = [base]
            index.dependence = "Commentary"
            index.save()

            # add intro node and give it some text
            intro = JaggedArrayNode()
            intro.add_shared_term("Introduction")
            intro.key = 'intro'
            intro.add_structure(["Chapter", "Paragraph"])
            insert_first_child(intro, library.get_index(title).nodes)
            comm_ref = "{}, Introduction 1:1".format(title)
            tc = TextChunk(Ref(comm_ref), vtitle="test", lang="en")
            tc.text = "Intro first segment text"
            tc.save()

            # rebuild links and assert that despite adding text to the intro node, the number of links should be exactly as they before (e.g desired_link_count)
            rf = Ref(title)
            linker = rf.autolinker()
            desired_link_count = self.desired_link_counts[title]
            found = linker.rebuild_links()
            assert len(found) == desired_link_count


    def test_rebuild_commentary_links_complex(self):
        title = 'Kos Shel Eliyahu on Pesach Haggadah'
        rf = Ref(title)
        linker = rf.autolinker(user=1)
        desired_link_count = self.desired_link_counts[title]
        found = linker.rebuild_links()
        assert len(found) == desired_link_count


    # def test_add_commentary_links_default_node(self):
    #     title = "Be'er Mayim Chaim on Chofetz Chaim"
    #     rf = Ref(title)
    #     linker = rf.autolinker()
    #     found = linker.build_links()

    def test_refresh_commentary_links_default_node(self):
        many_to_one = ("many_to_one_default_only", "Rashi on Deuteronomy", "Deuteronomy")
        one_to_one = ("one_to_one_default_only", "Onkelos Genesis", "Genesis")
        for type in [many_to_one]:
            title = type[1]
            base = type[2]
            rf = Ref(title)
            regex = rf.regex()
            desired_link_count = self.desired_link_counts[title]
            linker = rf.autolinker()

            # add a link to the intro even though there shouldn't be such a link
            comm_ref = "{}, Introduction 1:1".format(title)
            base_ref = "{} 1".format(base)
            if type[0] == "one_to_one_default_only": #If it's one to one, 1:1 should map to 1:1
                base_ref = "{} 1:1".format(base)
            Link({"refs": [base_ref, comm_ref], "generated_by": linker._generated_by_string, "type": "commentary", "auto": True}).save()

            # test that refreshing the links causes the new link above to be deleted. the result should be the same number of links as before the link was created
            linker.refresh_links()
            link_count = LinkSet({"generated_by": linker._generated_by_string, "refs": {"$regex": regex}}).count()
            assert desired_link_count == link_count


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

    def test_refresh_links_with_text_save_default_node(self):
        many_to_one = ("many_to_one_default_only", "Rashi on Deuteronomy", "Deuteronomy", "1:9")
        one_to_one = ("one_to_one_default_only", "Onkelos Genesis", "Genesis", "1:1")
        for type in [many_to_one]:
            title = type[1]
            base = type[2]
            desired_link_count = self.desired_link_counts[title]
            rf = Ref(title)
            regex = rf.regex()

            # add another segment to intro text to show that it won't affect link count
            stext = [u"Intro first segment text", u"Intro second segment text"]
            oref = Ref("Rashi on Deuteronomy, Introduction 1")
            tracker.modify_text(1, oref, "test", "en", stext)
            link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
            assert link_count == desired_link_count

            # now add 2 segments to default node and check that exactly 2 more links exist than
            section_tref = "{} {}".format(title, type[3])
            lang = 'en'
            vtitle = "test"
            oref = Ref(section_tref)
            stext = TextChunk(oref, lang=lang).text
            stext += [u"New segment!", u"Another new segment!"]
            tracker.modify_text(1, oref, vtitle, lang, stext)
            link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
            assert link_count == (desired_link_count+2)

            # now delete 2 segments
            chunk = TextChunk(oref, lang, vtitle)
            chunk.text = chunk.text[:-2]
            tracker.modify_text(1, oref, vtitle, lang, chunk.text)
            link_count =  LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
            assert link_count == desired_link_count


    # def test_refresh_links_with_text_save_default_node_one_to_one(self):
    #     title = "Onkelos Genesis"
    #     base = "Genesis"
    #     index = library.get_index(title)
    #     index.base_text_mapping = "many_to_one_default_only"
    #     index.base_text_titles = [base]
    #     index.dependence = "Commentary"
    #     ibnezra_regex = Ref(title).regex()
    #     isaiah_regex = Ref(base).regex()
    #     section_tref = '{} 1:9'.format(title)
    #     stext = [u"<span>חזון</span> ",
    #              u"<i>Concerning Judah and Jerusalem</i>.",
    #              u"New segment!",
    #              u"Another new segment!"]
    #     lang = 'en'
    #     vtitle = "test"
    #     oref = Ref(section_tref)
    #     rf = Ref(title)
    #     regex = rf.regex()
    #     #original count
    #     desired_link_count = self.desired_link_counts[title]
    #     # add some text (adding one more comment than there is already)
    #     tracker.modify_text(1, oref, vtitle, lang, stext)
    #     link_count = LinkSet({"generated_by": {"$ne": "add_links_from_text"}, "$and": [{"refs": {"$regex": ibnezra_regex}}, {"refs": {"$regex": isaiah_regex}}]}).count()
    #     assert link_count == (desired_link_count+2)
    #     # now delete
    #     chunk = TextChunk(oref, lang, vtitle)
    #     chunk.text = chunk.text[:-2]
    #     tracker.modify_text(1, oref, vtitle, lang, chunk.text)
    #     link_count = LinkSet({"generated_by": {"$ne": "add_links_from_text"}, "$and": [{"refs": {"$regex": ibnezra_regex}}, {"refs": {"$regex": isaiah_regex}}]}).count()
    #     assert link_count == desired_link_count


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

