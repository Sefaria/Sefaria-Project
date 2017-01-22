import sys
sys.path.append("../")
from sefaria.helper.schema import cascade
sys.path.insert(0, "../../Sefaria-Data/")
import os
from functions import *
os.environ["DJANGO_SETTINGS_MODULE"] = "sefaria.settings"
from sefaria.model import *


def map_(x, map_array):
    return map_array[x.sections[1]-1]


'''
Logic for cascade is we only care about the few refs that have english so check for that is needs_rewrite
rewriter simply calls map_ with
'''


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
        needs.write(ref_str+"\n")
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
    needs = open("needs_generated_by_moving_english.txt", 'w')
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
