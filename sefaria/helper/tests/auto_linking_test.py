# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.helper.link import rebuild_links_for_title, AutoLinkerFactory
import sefaria.tracker as tracker
from sefaria.helper.schema import convert_simple_index_to_complex, insert_first_child


class Test_AutoLinker(object):
    link_set_lambda = lambda x: LinkSet({"refs": {"$regex": Ref(x).regex()}, "auto": True, "generated_by": "add_commentary_links"})
    rashi_on_genesis_links = link_set_lambda("Rashi on Genesis")
    kos_eliyahu_links = link_set_lambda("Kos Shel Eliyahu on Pesach Haggadah")
    rashi_on_deut_links = link_set_lambda("Rashi on Deuteronomy")
    desired_link_counts = {
        'Rashi on Genesis': rashi_on_genesis_links.count(),
        'Kos Shel Eliyahu on Pesach Haggadah': kos_eliyahu_links.count(),
        "Rashi on Deuteronomy": rashi_on_deut_links.count(),
        "Onkelos Genesis": LinkSet({"refs": {"$regex": "^Onkelos Genesis"}, "generated_by": "MatchBaseTextDepthAutoLinker"}).count()
    }

    def test_setup(self):
        # create dummy indexes: "Delete Me Many to One" and "Delete Me One to One"
        # ensure dummy index was properly deleted
        index = Index().load({'title': 'Delete Me Many to One'})
        if index is not None:
            ls = LinkSet(Ref("Delete Me Many to One"))
            ls.delete()
            index.delete()

        # Build an index with some nodes
        root = SchemaNode()
        root.add_title('Delete Me Many to One', 'en', primary=True)
        root.add_title(u'תמחק אותי הרבה לאחד', 'he', primary=True)
        root.key = 'Delete Me'

        intro = JaggedArrayNode()
        intro.add_shared_term("Introduction")
        intro.add_structure(['Chapter', 'Verse'])
        intro.depth = 2
        intro.key = 'intro'
        root.append(intro)

        default = JaggedArrayNode()
        default.key = "default"
        default.default = True
        default.add_structure(["Chapter", "Verse", "Comment"])
        root.append(default)

        root.validate()

        index = Index({
            'schema': root.serialize(),
            'title': 'Delete Me Many to One',
            'categories': ['Tanakh'],
        })
        index.save()

        # add some text
        v = Version({
            "language": "en",
            "title": "Delete Me Many to One",
            "versionSource": "http://foobar.com",
            "versionTitle": "Schema Test",
            "chapter": root.create_skeleton()
        }).save()

        p1 = [['intro intro', 'intro'], ['intro'], ['intro', '', 'intro']]
        chunk = TextChunk(Ref('Delete Me Many to One, Introduction'), 'en', 'Schema Test')
        chunk.text = p1
        chunk.save()

        p2 = [[['Default default', 'default']], [['default', 'default!']], [['default', '', 'default']]]
        chunk = TextChunk(Ref('Delete Me Many to One'), 'en', 'Schema Test')
        chunk.text = p2
        chunk.save()

        #"refs": [base_ref, comm_ref], "generated_by": linker._generated_by_string, "type": "commentary", "auto": True
        # add some links
        Link({
            'refs': ['Delete Me Many to One, Introduction 1:1', 'Shabbat 2a:5'],
            'type': 'commentary',
            "generated_by": "intro_parser",
            "auto": True
        }).save()
        Link({
            'refs': ['Delete Me Many to One, Introduction 2:1', 'Delete Me Many to One 2:1:2'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "intro_parser"
        }).save()
        Link({
            'refs': ['Delete Me Many to One 3:1:2', 'Shabbat 2a:1'],
            'type': 'commentary',
            "generated_by": "add_commentary_links",
            "auto": True
        }).save()
        Link({
            'refs': ['Delete Me Many to One 1:1:1', 'Shabbat 2a:5'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "add_commentary_links"
        }).save()
        Link({
            'refs': ['Delete Me Many to One 3:1:3', 'Shabbat 2a:5'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "add_commentary_links"
        }).save()

        # ensure dummy index was properly deleted
        index = Index().load({'title': 'Delete Me One to One'})
        if index is not None:
            ls = LinkSet(Ref("Delete Me One to One"))
            ls.delete()
            index.delete()

        # Build an index with some nodes
        root = SchemaNode()
        root.add_title('Delete Me One to One', 'en', primary=True)
        root.add_title(u'תמחק אותי אחד לאחד', 'he', primary=True)
        root.key = 'Delete Me'

        intro = JaggedArrayNode()
        intro.add_shared_term("Introduction")
        intro.add_structure(['Chapter', 'Verse'])
        intro.depth = 2
        intro.key = 'intro'
        root.append(intro)

        default = JaggedArrayNode()
        default.key = "default"
        default.default = True
        default.add_structure(["Chapter", "Verse"])
        root.append(default)

        root.validate()

        index = Index({
            'schema': root.serialize(),
            'title': 'Delete Me One to One',
            'categories': ['Tanakh'],
        })
        index.save()

        # add some text
        v = Version({
            "language": "en",
            "title": "Delete Me One to One",
            "versionSource": "http://foobar.com",
            "versionTitle": "Schema Test",
            "chapter": root.create_skeleton()
        }).save()

        p1 = [['intro intro', 'intro'], ['intro'], ['intro', '', 'intro']]
        chunk = TextChunk(Ref('Delete Me One to One, Introduction'), 'en', 'Schema Test')
        chunk.text = p1
        chunk.save()

        p2 = [['Default default', 'default'], ['default', 'default!'], ['default', '', 'default']]
        chunk = TextChunk(Ref('Delete Me One to One'), 'en', 'Schema Test')
        chunk.text = p2
        chunk.save()

        # add some links
        Link({
            'refs': ['Delete Me One to One, Introduction 1:1', 'Shabbat 2a:5'],
            'type': 'None'
        }).save()
        Link({
            'refs': ['Delete Me One to One, Introduction 2:1', 'Delete Me One to One 2:1'],
            'type': 'None'
        }).save()
        Link({
            'refs': ['Delete Me One to One, Introduction 3', 'Shabbat 2a:5'],
            'type': 'None'
        }).save()
        Link({
            'refs': ['Delete Me One to One 1:2', 'Shabbat 2a:5'],
            'type': 'None'
        }).save()
        Link({
            'refs': ['Delete Me One to One 3:3', 'Shabbat 2a:5'],
            'type': 'None'
        }).save()

        VersionState("Delete Me One to One").refresh()
        print 'End of test setup'

    def test_rebuild_commentary_links(self):
        #test simple adding links
        title = 'Rashi on Genesis'
        rf = Ref(title)
        desired_link_count = self.desired_link_counts[title] #LinkSet({"refs": {"$regex": rf.regex()},"auto": True, "generated_by": "add_commentary_links"}).count()
        linker = rf.autolinker()
        found = linker.rebuild_links()
        assert len(found) == desired_link_count

    def test_rebuild_same_quantity_of_links_for_many_to_one_default_only(self):
        title = "Rashi on Deuteronomy"
        base = "Deuteronomy"
        rf = Ref(title)
        linker = rf.autolinker()

        # prepare the text for the tests:
        # convert simple text to a complex text with default node and add base_text_* and dependence properties.
        index = library.get_index(title)
        convert_simple_index_to_complex(index)
        index.base_text_mapping = "many_to_one_default_only"
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

        #new test should work how?  intro should have text and links that don't

        # assert that despite adding text to the intro node, the number of links
        # should be exactly as they were before (e.g desired_link_count)
        found = linker.rebuild_links()
        desired_link_count = self.desired_link_counts[title]
        assert len(found) == desired_link_count


    def test_rebuild_same_link_content_for_many_to_one_default_only(self):
        title_ref = "Rashi on Deuteronomy 10:10:1"
        base_ref = "Deuteronomy 10:10"
        linker = Ref("Rashi on Deuteronomy").autolinker()

        # load an existing link, delete it, then rebuild links and
        # assert that the link exists again
        query = {"$and": [{"refs": {"$regex": "^{}".format(title_ref)}},
                          {"refs": {"$regex": "^{}".format(base_ref)}}]}

        # now load the link and delete it
        existing_link = Link().load(query)
        existing_link.delete()

        # rebuild links and assert old link successfully rebuilt
        found = linker.rebuild_links()
        new_link = Link().load(query)
        assert new_link

    def test_rebuild_same_quantity_of_links_for_one_to_one_default_only(self):
        title = "Onkelos Genesis"
        base = "Genesis"
        rf = Ref(title)
        linker = rf.autolinker()

        # prepare the text for the tests:
        # convert simple text to a complex text with default node and add base_text_* and dependence properties.
        index = library.get_index(title)
        convert_simple_index_to_complex(index)
        index.base_text_mapping = "one_to_one_default_only"
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

        # need to change value of "generated_by" from "MatchBaseTextDepthAutoLinker" to "add_commentary_links"
        # and "link_type" from "targum" to "commentary"
        for l in LinkSet({"refs": {"$regex": title}, "generated_by": "MatchBaseTextDepthAutoLinker"}):
            l.generated_by = linker._generated_by_string
            l.auto = linker._auto
            l.type = linker._link_type
            l.save()

        # assert that despite adding text to the intro node, the number of links
        # should be exactly as they were before (e.g desired_link_count)
        found = linker.rebuild_links()
        desired_link_count = self.desired_link_counts[title]
        assert len(found) == desired_link_count

    def test_rebuild_same_link_content_for_one_to_one_default_only(self):
        title_ref = "Onkelos Genesis 2:2"
        base_ref = "Genesis 2:2"
        linker = Ref("Rashi on Deuteronomy").autolinker()

        # load an existing link, delete it, then rebuild links and
        # assert that the link exists again
        query = {"$and": [{"refs": {"$regex": "^{}".format(title_ref)}},
                          {"refs": {"$regex": "^{}".format(base_ref)}}]}

        # now load the link and delete it
        existing_link = Link().load(query)
        existing_link.delete()

        # rebuild links and assert old link successfully rebuilt
        found = linker.rebuild_links()
        new_link = Link().load(query)
        assert new_link


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

    def test_refresh_commentary_links_many_to_one_default_node(self):
        title = "Rashi on Deuteronomy"
        base = "Deuteronomy"
        rf = Ref(title)
        regex = rf.regex()
        desired_link_count = self.desired_link_counts[title]
        linker = rf.autolinker()

        # add a link to the intro even though there shouldn't be such a link
        comm_ref = "{}, Introduction 1:2".format(title)
        base_ref = "{} 1".format(base)
        Link({"refs": [base_ref, comm_ref], "generated_by": linker._generated_by_string, "type": "commentary", "auto": True}).save()

        # test that refreshing the links causes the new link above to be deleted.
        # the result should be the same number of links as before the link was created
        linker.refresh_links()
        link_count = LinkSet({"generated_by": linker._generated_by_string, "refs": {"$regex": regex}}).count()
        assert desired_link_count == link_count


    def test_refresh_commentary_links_one_to_one_default_node(self):
        title = "Onkelos Genesis"
        base = "Genesis"
        rf = Ref(title)
        regex = rf.regex()
        desired_link_count = self.desired_link_counts[title]
        linker = rf.autolinker()

        # add a link to the intro even though there shouldn't be such a link
        comm_ref = "{}, Introduction 1:2".format(title)
        base_ref = "{} 1:2".format(base)
        Link({"refs": [base_ref, comm_ref], "generated_by": linker._generated_by_string, "type": "commentary", "auto": True}).save()

        # test that refreshing the links causes the new link above to be deleted.
        # the result should be the same number of links as before the link was created
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

    def test_refresh_links_with_text_save_many_to_one_default_node(self):
        title_ref = "Rashi on Deuteronomy 1:9"
        title = Ref(title_ref).index.title
        base = Ref(title_ref).index.base_text_titles[0]
        desired_link_count = self.desired_link_counts[title]
        rf = Ref(title)
        regex = rf.regex()

        # add another segment to intro text to show that it won't affect link count
        stext = [u"Intro first segment text", u"Intro second segment text"]
        oref = Ref("{}, Introduction 1".format(title))
        tracker.modify_text(1, oref, "test", "en", stext)
        link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert link_count == desired_link_count

        # now add 2 segments to default node and check that exactly 2 more links exist than
        lang = 'he'
        vtitle = "test"
        oref = Ref(title_ref)
        stext = TextChunk(oref, lang=lang).text
        stext += [u"חדש", u"חדש"]
        tracker.modify_text(1, oref, vtitle, lang, stext)
        link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert link_count == (desired_link_count+2)

        # now delete 2 segments
        chunk = TextChunk(oref, lang, vtitle)
        chunk.text = chunk.text[:-2]
        tracker.modify_text(1, oref, vtitle, lang, chunk.text)
        link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert link_count == desired_link_count


    def test_refresh_links_with_text_save_one_to_one_default_node(self):
        title_ref = "Onkelos Genesis 1"
        title = Ref(title_ref).index.title
        base = Ref(title_ref).index.base_text_titles[0]
        desired_link_count = self.desired_link_counts[title]
        rf = Ref(title)
        regex = rf.regex()

        # add another segment to intro text to show that it won't affect link count
        stext = [u"Intro first segment text", u"Intro second segment text"]
        oref = Ref("{}, Introduction 1".format(title))
        tracker.modify_text(1, oref, "test", "en", stext)
        link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert link_count == desired_link_count

        # now add 2 segments to default node and check that exactly 2 more links exist than
        lang = 'he'
        vtitle = "test"
        oref = Ref(title_ref)
        stext = TextChunk(oref, lang=lang).text
        stext += [u"חדש", u"חדש"]
        tracker.modify_text(1, oref, vtitle, lang, stext)
        link_count = LinkSet(
            {"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert link_count == (desired_link_count + 2)

        # now delete 2 segments
        chunk = TextChunk(oref, lang, vtitle)
        chunk.text = chunk.text[:-2]
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


    def test_teardown(self):
        print 'Cleaning Up'
        ls = LinkSet(Ref("Delete Me Many to One"))
        ls.delete()
        ls = LinkSet(Ref("Delete Me One to One"))
        ls.delete()
        v = Version().load({'title': 'Delete Me Many to One'})
        v.delete()
        v = Version().load({'title': 'Delete Me One to One'})
        v.delete()
        i = Index().load({'title': 'Delete Me Many to One'})
        i.delete()
        i = Index().load({"title": "Delete Me One to One"})
        i.delete()
