# -*- coding: utf-8 -*-
import csv
import sys
import os
os.environ['DJANGO_SETTINGS_MODULE'] = "sefaria.settings"
from sefaria.system.database import db

__author__ = 'stevenkaplan'
from sefaria.helper.schema import *
from sefaria.model import *
from sefaria.system.exceptions import InputError

def map_(x, map_array):
    return map_array[x.sections[1]-1]

def get_parshiot():
    en_he_parshiot = []
    with open("data/tmp/parsha.csv") as parsha_file:
        parshiot = csv.reader(parsha_file)
        parshiot.next()
        order = 1
        for row in parshiot:
            (en, he, ref) = row
            if en == "Lech-Lecha":
                en = "Lech Lecha"
            he = he.decode('utf-8')
            en_he_parshiot.append((en, he))
    return en_he_parshiot


def create_schema(en_he_parshiot):
    en_parshiot = []
    book = SchemaNode()
    book.add_title("Midrash Tanchuma", "en", primary=True)
    book.add_title(u"מדרש תנחומא", "he", primary=True)
    book.key = "midrash_tanhuma"

    foreword = JaggedArrayNode()
    foreword.add_title("Foreword", "en", primary=True)
    foreword.add_title(u"פתח דבר", "he", primary=True)
    foreword.key = "foreword"
    foreword.depth = 1
    foreword.sectionNames = ["Paragraph"]
    foreword.addressTypes = ["Integer"]

    intro = JaggedArrayNode()
    intro.add_title("Introduction", "en", primary=True)
    intro.add_title(u"הקדמה", "he", primary=True)
    intro.key = "intro"
    intro.depth = 1
    intro.sectionNames = ["Paragraph"]
    intro.addressTypes = ["Integer"]

    book.append(foreword)
    book.append(intro)

    for parsha_tuple in en_he_parshiot:
        parsha = JaggedArrayNode()
        parsha.key = parsha_tuple[0]
        parsha.add_title(parsha_tuple[0], "en", primary=True)
        parsha.add_title(parsha_tuple[1], "he", primary=True)
        parsha.sectionNames = ["Paragraph"]
        parsha.depth = 1
        parsha.addressTypes = ["Integer"]
        book.append(parsha)
        en_parshiot.append(parsha_tuple[0])


    book.validate()
    return book, en_parshiot



def set_up_map(en_parshiot):
    mappings = {}
    torah = [12, 11, 10, 10, 11]
    counter = 0
    for torah_index, sefer in enumerate(torah):
        for sefer_index in range(sefer):
            orig = "Midrash Tanchuma {}:{}".format(torah_index+1, sefer_index+1)
            new = "Midrash Tanchuma, {}".format(en_parshiot[counter])
            mappings[orig] = new
            counter += 1
    return mappings


def remove_sets():
    LinkSet({"refs": {"$regex": "^Complex Midrash Tanchuma"}}).delete()
    HistorySet({"new.refs": {"$regex": "^Complex Midrash Tanchuma"}}).delete()
    HistorySet({"old.refs": {"$regex": "^Complex Midrash Tanchuma"}}).delete()
    HistorySet({"new.ref": {"$regex": "^Complex Midrash Tanchuma"}}).delete()
    HistorySet({"old.ref": {"$regex": "^Complex Midrash Tanchuma"}}).delete()
    HistorySet({"ref": {"$regex": "^Complex Midrash Tanchuma"}}).delete()
    GardenStopSet({"ref": {"$regex": "^Complex Midrash Tanchuma"}}).delete()
    #db.sheets.find({"sources.ref": {"$regex": "Complex Midrash Tanchuma"}})
    NoteSet({"ref": {"$regex": "^Complex Midrash Tanchuma"}}).delete()
    TranslationRequestSet({"ref": {"$regex": "^Complex Midrash Tanchuma"}}).delete()



def rewriter(ref_str):
    print ref_str
    ref = Ref(ref_str)
    new_sec_of_ref = map_(ref, map_array)
    if len(ref.sections) == 3:
        ref = "Midrash Tanchuma "+new_sec_of_ref + ":" + str(ref.sections[2])
        assert Ref(ref)
        return ref
    elif len(ref.sections) == 2:
        ref = "Midrash Tanchuma "+new_sec_of_ref
        assert Ref(ref)
        return ref
    return ref_str



def needs_rewrite(ref_str, *args):

    try:
        ref = Ref(ref_str).section_ref()
        if len(ref.sections) > 1:
            return ref.book == "Midrash Tanchuma" and ref.sections[0] == 1 and ref.sections[1] > 12 and ref.sections[1] <= 54
        else:
            return False
    except:
        return False


def swap_text(ref, vtitle):
    orig_ref = Ref("Midrash Tanchuma {}".format(ref))
    tc = TextChunk(orig_ref, vtitle=vtitle)
    new_ref = Ref("Midrash Tanchuma {}".format(map_(orig_ref, map_array)))
    new_tc = TextChunk(new_ref, vtitle=vtitle)
    assert False not in tc.text and False not in new_tc.text
    old_text = tc.text
    if len(old_text) == 0:
        return
    new_tc.text = old_text
    tc.text = []
    new_tc.save()
    tc.save()

if __name__ == "__main__":
    #move english
    en_he_parshiot = get_parshiot()
    refs = ["1:15", "1:22", "1:23", "1:24", "1:25", "1:35", "1:48", "1:49", "1:50"]
    outer_info = [12, 11, 10, 10, 11]
    map_array = []
    for sindex, size in enumerate(outer_info):
        for i in range(size):
            x = "{}:{}".format(sindex+1, i+1)
            map_array.append(x)
    for ref in refs:
        swap_text(ref, "Rabbi Mike Feuer, Jerusalem Anthology")
    for ref in refs:
        swap_text(ref, "Sefaria Community Translation")
    cascade("Midrash Tanchuma", rewriter, needs_rewrite)

    #make it complex
    en_he_parshiot = get_parshiot()
    book, en_parshiot = create_schema(en_he_parshiot)
    mappings = set_up_map(en_parshiot)
    remove_sets()
    try:
        library.get_index("Complex Midrash Tanchuma").delete()
    except InputError:
        pass
    migrate_to_complex_structure("Midrash Tanchuma", book.serialize(), mappings)

    #increase depth
    i = library.get_index("Midrash Tanchuma")
    nodes = i.nodes.children
    for count, node in enumerate(nodes):
        print node
        if count < 2 or node._full_title['en'].find("Footnotes") >= 0:
            continue
        new_names = ["Siman", "Paragraph"]
        change_node_structure(node, new_names)
