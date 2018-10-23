# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.helper.link import rebuild_links_for_title, AutoLinkerFactory
import sefaria.tracker as tracker
from sefaria.helper.schema import convert_simple_index_to_complex, insert_first_child


class Test_AutoLinker(object):
    link_set_lambda = lambda x: LinkSet({"refs": {"$regex": Ref(x).regex()}, "auto": True, "generated_by": "add_commentary_links"})
    rashi_on_genesis_links = link_set_lambda("Rashi on Genesis")
    kos_eliyahu_links = link_set_lambda("Kos Shel Eliyahu on Pesach Haggadah")
    desired_link_counts = {
        'Rashi on Genesis': rashi_on_genesis_links.count(),
        'Kos Shel Eliyahu on Pesach Haggadah': kos_eliyahu_links.count(),
    }

    @classmethod
    def setup_class(self):
        # create dummy indexes: "Many to One on Genesis" and "One to One on Genesis"
        # ensure dummy index was properly deleted
        index = Index().load({'title': 'Many to One on Genesis'})
        if index is not None:
            ls = LinkSet(Ref("Many to One on Genesis"))
            ls.delete()
            index.delete()

        # Build an index with some nodes
        root = SchemaNode()
        root.add_title('Many to One on Genesis', 'en', primary=True)
        root.add_title(u'הרבה לאחד על בראשית', 'he', primary=True)
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
            'title': 'Many to One on Genesis',
            'dependence': "Commentary",
            "base_text_titles": ["Genesis"],
            "base_text_mapping": "many_to_one_default_only",
            'categories': ['Tanakh', "Commentary"],
        })
        index.save()

        # add some text
        v = Version({
            "language": "en",
            "title": "Many to One on Genesis",
            "versionSource": "http://foobar.com",
            "versionTitle": "Schema Test",
            "chapter": root.create_skeleton()
        }).save()

        p1 = [['intro intro', 'intro'], ['intro'], ['intro', '', 'intro']]
        chunk = TextChunk(Ref('Many to One on Genesis, Introduction'), 'en', 'Schema Test')
        chunk.text = p1
        chunk.save()

        p2 = [[['Default default']], [['default', 'default!']], [['default', '', 'default']]]
        chunk = TextChunk(Ref('Many to One on Genesis'), 'en', 'Schema Test')
        chunk.text = p2
        chunk.save()

        # add some links
        Link({
            'refs': ['Many to One on Genesis, Introduction 1:1', 'Shabbat 2a:5'],
            'type': 'commentary',
            "generated_by": "intro_parser",
            "auto": True
        }).save()
        Link({
            'refs': ['Many to One on Genesis, Introduction 2:1', 'Many to One on Genesis 2:1:2'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "intro_parser"
        }).save()
        Link({
            'refs': ['Many to One on Genesis 3:1:3', 'Genesis 3:1'],
            'type': 'commentary',
            "generated_by": "add_commentary_links",
            "auto": True
        }).save()
        Link({
            'refs': ['Many to One on Genesis 3:1:1', 'Genesis 3:1'],
            'type': 'commentary',
            "generated_by": "add_commentary_links",
            "auto": True
        }).save()
        Link({
            'refs': ['Many to One on Genesis 1:1:1', 'Genesis 1:1'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "add_commentary_links"
        }).save()
        Link({
            'refs': ['Many to One on Genesis 2:1:1', 'Genesis 2:1'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "add_commentary_links"
        }).save()
        Link({
            'refs': ['Many to One on Genesis 2:1:2', 'Genesis 2:1'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "add_commentary_links"
        }).save()

        # ensure dummy index was properly deleted
        index = Index().load({'title': 'One to One on Genesis'})
        if index is not None:
            ls = LinkSet(Ref("One to One on Genesis"))
            ls.delete()
            index.delete()

        # Build an index with some nodes
        root = SchemaNode()
        root.add_title('One to One on Genesis', 'en', primary=True)
        root.add_title(u'אחד לאחד על בראשית', 'he', primary=True)
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
            'title': 'One to One on Genesis',
            'dependence': 'Commentary',
            'base_text_titles': ['Genesis'],
            'base_text_mapping': 'one_to_one_default_only',
            'categories': ['Tanakh', 'Commentary'],
        })
        index.save()

        # add some text
        v = Version({
            "language": "en",
            "title": "One to One on Genesis",
            "versionSource": "http://foobar.com",
            "versionTitle": "Schema Test",
            "chapter": root.create_skeleton()
        }).save()

        p1 = [['intro intro', 'intro'], ['intro'], ['intro', '', 'intro']]
        chunk = TextChunk(Ref('One to One on Genesis, Introduction'), 'en', 'Schema Test')
        chunk.text = p1
        chunk.save()

        p2 = [['Default default'], ['default', 'default!'], ['default', '', 'default']]
        chunk = TextChunk(Ref('One to One on Genesis'), 'en', 'Schema Test')
        chunk.text = p2
        chunk.save()

        # add some links
        Link({
            'refs': ['One to One on Genesis, Introduction 1:1', 'Shabbat 2a:5'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "intro_parser"
        }).save()
        Link({
            'refs': ['One to One on Genesis, Introduction 2:1', 'One to One on Genesis 2:1'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "intro_parser"
        }).save()
        Link({
            'refs': ['One to One on Genesis, Introduction 3:1', 'Shabbat 2a:5'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "intro_parser"
        }).save()
        Link({
            'refs': ['One to One on Genesis 1:1', 'Genesis 1:1'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "add_commentary_links"
        }).save()
        Link({
            'refs': ['One to One on Genesis 2:2', 'Genesis 2:2'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "add_commentary_links"
        }).save()
        Link({
            'refs': ['One to One on Genesis 2:1', 'Genesis 2:1'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "add_commentary_links"
        }).save()
        Link({
            'refs': ['One to One on Genesis 3:3', 'Genesis 3:3'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "add_commentary_links"
        }).save()
        Link({
            'refs': ['One to One on Genesis 3:1', 'Genesis 3:1'],
            'type': 'commentary',
            "auto": True,
            "generated_by": "add_commentary_links"
        }).save()

        VersionState("One to One on Genesis").refresh()

        link_set_lambda = lambda x: LinkSet({"refs": {"$regex": Ref(x).regex()}, "auto": True, "generated_by": "add_commentary_links"})
        self.desired_link_counts["Many to One on Genesis"] = link_set_lambda("Many to One on Genesis").count()
        self.desired_link_counts["One to One on Genesis"] = link_set_lambda("One to One on Genesis").count()
        print 'End of test setup'

    @classmethod
    def teardown_class(self):
        print 'Cleaning Up'
        ls = LinkSet(Ref("Many to One on Genesis"))
        ls.delete()
        ls = LinkSet(Ref("One to One on Genesis"))
        ls.delete()
        v = Version().load({'title': 'Many to One on Genesis'})
        v.delete()
        v = Version().load({'title': 'One to One on Genesis'})
        v.delete()
        i = Index().load({'title': 'Many to One on Genesis'})
        i.delete()
        i = Index().load({"title": "One to One on Genesis"})
        i.delete()

    def test_rebuild_commentary_links(self):
        #test simple adding links
        title = 'Rashi on Genesis'
        rf = Ref(title)
        desired_link_count = self.desired_link_counts[title]
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

    def test_rebuild_same_quantity_of_links_for_many_to_one_default_only(self):
        title = 'Many to One on Genesis'
        rf = Ref(title)
        desired_link_count = self.desired_link_counts[title]
        linker = rf.autolinker()
        found = linker.rebuild_links()
        assert len(found) == desired_link_count

    def test_rebuild_same_quantity_of_links_for_one_to_one_default_only(self):
        title = 'One to One on Genesis'
        rf = Ref(title)
        desired_link_count = self.desired_link_counts[title]
        linker = rf.autolinker()
        found = linker.rebuild_links()
        assert len(found) == desired_link_count


    def test_rebuild_same_link_content_for_many_to_one_default_only(self):
        title_ref = 'Many to One on Genesis 3:1:3'
        base_ref = "Genesis 3:1"
        linker = Ref("Many to One on Genesis").autolinker()

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


    def test_rebuild_same_link_content_for_one_to_one_default_only(self):
        title_ref = "One to One on Genesis 3:3"
        base_ref = "Genesis 3:3"
        linker = Ref("One to One on Genesis").autolinker()

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


    def test_refresh_commentary_links_one_to_one_default_node(self):
        title = "One to One on Genesis"
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


    def test_refresh_commentary_links_many_to_one_default_node(self):
        title = "Many to One on Genesis"
        base = "Genesis"
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
        title_ref = "Many to One on Genesis 1:9"
        title = Ref(title_ref).index.title
        base = Ref(title_ref).index.base_text_titles[0]
        desired_link_count = self.desired_link_counts[title]
        rf = Ref(title)
        regex = rf.regex()

        # add another segment to intro text to show that it won't affect link count
        stext = [u"Intro first segment text", u"Intro second segment text", u"Intro third segment text"]
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
        title_ref = "One to One on Genesis 1"
        title = Ref(title_ref).index.title
        base = Ref(title_ref).index.base_text_titles[0]
        desired_link_count = self.desired_link_counts[title]
        rf = Ref(title)
        regex = rf.regex()

        # add another segment to intro text to show that it won't affect link count
        stext = [u"Intro first segment text", u"Intro second segment text", u"Intro third segment text"]
        oref = Ref("{}, Introduction 1".format(title))
        tracker.modify_text(1, oref, "test", "en", stext)
        link_count = LinkSet({"refs": {"$regex": regex}, "auto": True, "generated_by": "add_commentary_links"}).count()
        assert link_count == desired_link_count

        # now add 2 segments to default node and check that exactly 2 more links exist than
        lang = 'en'
        vtitle = "test"
        oref = Ref(title_ref)
        stext = TextChunk(oref, lang=lang).text
        stext += [u"new", u"new"]
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



