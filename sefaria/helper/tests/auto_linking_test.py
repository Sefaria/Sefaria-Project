# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.helper.link import rebuild_links_for_title, AutoLinkerFactory
import sefaria.tracker as tracker


def test_add_commentary_links():
    #test simple adding links
    title = 'Rashi on Genesis'
    rf = Ref(title)
    linker = rf.autolinker()
    desired_link_count = 2027
    found = linker.rebuild_links()
    assert len(found) == desired_link_count


def test_add_commentary_links_complex():
    title = 'Kos Shel Eliyahu on Pesach Haggadah'
    rf = Ref(title)
    linker = rf.autolinker(user=1)
    desired_link_count = 80
    found = linker.rebuild_links()
    assert len(found) == desired_link_count


def test_add_commentary_links_default_node():
    title = "Be'er Mayim Chaim on Chofetz Chaim"
    rf = Ref(title)
    linker = rf.autolinker()
    found = linker.build_links()


def test_add_delete_commentary_links():
    #test that there are the same number of links before and after
    title = 'Rashi on Genesis'
    desired_link_count = 2027
    regex = Ref(title).regex()
    rf = Ref(title)
    linker = rf.autolinker()
    linker.refresh_links()
    ls = LinkSet({"refs": {"$regex": regex}, "generated_by": 'CommentaryAutoLinker'})
    link_count = ls.count()
    assert desired_link_count == link_count


def test_add_delete_commentary_links_complex():
    #test that there are the same number of links before and after
    title = 'Kos Shel Eliyahu on Pesach Haggadah'
    desired_link_count = 80
    regex = Ref(title).regex()
    rf = Ref(title)
    linker = rf.autolinker()
    linker.refresh_links()
    ls = LinkSet({"refs": {"$regex": regex}, "generated_by": 'CommentaryAutoLinker'})
    link_count = ls.count()
    assert desired_link_count == link_count


def test_add_remove_links_with_text_save():
    title = 'Rashi on Genesis'
    desired_link_count = 2027
    regex = Ref(title).regex()
    tref = 'Rashi on Genesis 18:22'
    oref = Ref(tref)
    lang = 'he'
    vtitle = "test"
    stext = [u"כךל שדךלגכח ש ךלדקחכ ףךדלכח שףךדג", u"כךל שדךלגכח ש ךלדקחכ ףךדלכח שףךדג", u"כךל שדךלגכח ש ךלדקחכ ףךדלכח שףךדג"]
    tracker.modify_text(1, Ref(tref), vtitle, lang, stext)
    ls = LinkSet({"refs": {"$regex": regex}, "generated_by": "CommentaryAutoLinker"})
    link_count = ls.count()
    assert link_count == (desired_link_count+1)

    chunk = TextChunk(oref, lang, vtitle)
    chunk.text = chunk.text[:-1]
    tracker.modify_text(1, Ref(tref), vtitle, lang, chunk.text)
    ls = LinkSet({"refs": {"$regex": regex}, "generated_by": "CommentaryAutoLinker"})
    link_count = ls.count()
    assert link_count == desired_link_count

def test_add_remove_links_with_text_save_complex():
    title = 'Kos Shel Eliyahu on Pesach Haggadah'
    desired_link_count = 80
    regex = Ref(title).regex()
    tref = 'Kos Shel Eliyahu on Pesach Haggadah, Kadesh 1'
    oref = Ref(tref)
    lang = 'en'
    vtitle = "test"
    stext = ["thlerkawje alkejal ekjlkej", "eaflkje arheahrlka jhklajdhkl ADJHKL"]
    tracker.modify_text(1, Ref(tref), vtitle, lang, stext)
    ls = LinkSet({"refs": {"$regex": regex}, "generated_by": "CommentaryAutoLinker"})
    link_count = ls.count()
    assert link_count == desired_link_count+2

    chunk = TextChunk(oref, lang, vtitle)
    chunk.text = []
    tracker.modify_text(1, Ref(tref), vtitle, lang, chunk.text)
    ls = LinkSet({"refs": {"$regex": regex}, "generated_by": "CommentaryAutoLinker"})
    link_count = ls.count()
    assert link_count == desired_link_count



