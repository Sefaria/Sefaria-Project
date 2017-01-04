# -*- coding: utf-8 -*-
import csv
import sys
import os
os.environ['DJANGO_SETTINGS_MODULE'] = "sefaria.settings"
sys.path.append("../")
import pdb
__author__ = 'stevenkaplan'
from sefaria.helper.schema import *
from sefaria.model import *
from sefaria.system.exceptions import InputError

def rewriter(ref):
    ref = ref.replace(":", ".")
    ref_obj = Ref(ref)
    if len(ref_obj.sections) > 1 and ref_obj.sections[0] == 1 and ref_obj.sections[1] > 12:
        ref = other_rewriter(ref)
        ref_obj = Ref(other_rewriter(ref))
    look_for_ref = ref_obj.section_ref().normal()
    look_for_ref = look_for_ref.replace(":", ".")
    if look_for_ref in mappings:
        return "Complex "+ref.replace(look_for_ref, mappings[look_for_ref]).replace(".", ' ')
    print ref
    return "Complex "+ref

def needs_rewrite(ref, *args):
    not_ruled_out = True
    try:
        Ref(ref).sections
    except:
        needs.write(ref+"\n")
        return False


    return ref.find("Midrash Tanchuma") >= 0


def map_(x):
    outer_info = [12, 11, 10, 10, 11]
    map_array = []
    for sindex, size in enumerate(outer_info):
        for i in range(size):
            map_array.append("{}:{}".format(sindex+1, i+1))
    return map_array[x.sections[1]-1]


def other_rewriter(ref_str):
    ref = Ref(ref_str)
    new_sec_of_ref = map_(ref)
    if len(ref.sections) == 3:
        ref = "Midrash Tanchuma "+new_sec_of_ref + ":" + str(ref.sections[2])
        assert Ref(ref)
        return ref
    elif len(ref.sections) == 2:
        ref = "Midrash Tanchuma "+new_sec_of_ref
        assert Ref(ref)
        return ref
    return ref_str




needs = open("needs_rewrite.txt", 'w')
rewrite = open("rewriter.txt", "w")
en_he_parshiot = []
en_parshiot = []
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

footnotes = SchemaNode()
footnotes.key = "footnotes"
footnotes.add_title("Footnotes", "en", primary=True)
footnotes.add_title(u"הערות", "he", primary=True)

intro = JaggedArrayNode()
intro.add_title("Introduction", "en", primary=True)
intro.add_title(u"הקדמה", "he", primary=True)
intro.key = "intro"
intro.depth = 1
intro.sectionNames = ["Paragraph"]
intro.addressTypes = ["Integer"]

footnotes.append(intro)

for parsha_tuple in en_he_parshiot:
    parsha = JaggedArrayNode()
    parsha.key = "footnotes"+parsha_tuple[0]
    parsha.add_title(parsha_tuple[0], "en", primary=True)
    parsha.add_title(parsha_tuple[1], "he", primary=True)
    parsha.sectionNames = ["Paragraph"]
    parsha.depth = 1
    parsha.addressTypes = ["Integer"]
    footnotes.append(parsha)

book.append(footnotes)


book.validate()


mappings = {}
torah = [12, 11, 10, 10, 11]
counter = 0
for torah_index, sefer in enumerate(torah):
    for sefer_index in range(sefer):
        orig = "Midrash Tanchuma {}.{}".format(torah_index+1, sefer_index+1)
        new = "Midrash Tanchuma, {}".format(en_parshiot[counter])
        mappings[orig] = new
        counter += 1

#Go through each sefer and set the key of a dictionary to be like 1.2 = Noah
try:
    LinkSet(Ref("Complex Midrash Tanchuma")).delete()
    library.get_index("Complex Midrash Tanchuma").delete()
except InputError:
    pass




migrate_to_complex_structure("Midrash Tanchuma", book.serialize(), mappings, rewriter, needs_rewrite)