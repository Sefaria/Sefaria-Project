# -*- coding: utf-8 -*-

import argparse

from sefaria.model import *
from sefaria.datatype.jagged_array import JaggedTextArray, JaggedArray
from sefaria.utils.talmud import daf_to_section
import copy

def pad_moved_ja(ja, padding_values):
    #pads the jagged array with the skeleton of the empty places up to this point in the ref
    if len(padding_values) > 0:
        padval = padding_values.pop(0)
        if all(isinstance(y, list) for y in ja):
            for _ in range(padval-1):
                ja.insert(0, [])
            pad_moved_ja(ja[padval-1], padding_values)
        return ja
    elif

#first text
#create needed index and versions

rashbam_bava_batra_he = Version({
    "chapter" : Index().load({'title': 'Bava Batra'}).nodes.create_skeleton(),
    "title" : 'Rashbam on Bava Batra',
    "versionTitle" : "WikiSource",
    "language" : "he",
    "versionSource" : "https://he.wikisource.org/wiki/תלמוד_בבלי"
}).save()

whole_ref = Ref('Rashi on Bava Batra')
whole_moved_ref = Ref('Rashbam on Bava Batra')
stay_section_ref = Ref('Rashi on Bava Batra.2a.1.1-29a.9.1')
move_section_ref = Ref('Rashi on Bava Batra.29a.9.2-176b.4.2')



orig_tc = TextChunk(whole_ref, 'he', rashbam_bava_batra_he.versionTitle)
dest_tc = TextChunk(whole_moved_ref, 'he', rashbam_bava_batra_he.versionTitle)

#get the two slices of the whole text, corresponding to the new texts
jatext_tostay = JaggedTextArray(orig_tc.text).subarray_with_ref(stay_section_ref).array()

jatext_tomove = copy.deepcopy(JaggedTextArray(orig_tc.text).subarray_with_ref(move_section_ref).array())
#the piece of text being moved needs to be padded so that its overall structure matches the original structure
jatext_tostay = pad_moved_ja(jatext_tostay, stay_section_ref.sections)
jatext_tomove = pad_moved_ja(jatext_tomove, move_section_ref.sections)

orig_tc.text = jatext_tostay
orig_tc.save()

dest_tc.text = jatext_tomove
dest_tc.save()


r_gershom_index = Index({
    "title":'Rabbeinu Gershom',
    "heTitle" : u'רבינו גרשום',
    "titleVariants":[],
    "heTitleVariants":[],
    "categories" : [
        "Commentary",
        "Rishonim"
    ],
    "sectionNames":["",""],
    "maps":[]
}).save()

r_gershom_makkot_he = Version({
    "chapter": Index().load({'title': 'Makkot'}).nodes.create_skeleton(),
    "status" : "locked",
    "versionTitle" : "Vilna Edition",
    "license" : "Public Domain",
    "language" : "he",
    "title" : "Rabbeinu Gershom on Makkot",
    "versionSource" : "http://primo.nli.org.il/primo_library/libweb/action/dlDisplay.do?vid=NLI&docId=NNL_ALEPH001300957"
}).save()


whole_ref = Ref('Rashi on Makkot')
whole_moved_ref = Ref('Rabbeinu Gershom on Makkot')
stay_section_ref = Ref('Rashi on Makkot.2a.1.1-24a.34.2')
move_section_ref = Ref('Rashi on Makkot.24a.35.1-24b.16.1')



orig_tc = TextChunk(whole_ref, 'he', r_gershom_makkot_he.versionTitle)
dest_tc = TextChunk(whole_moved_ref, 'he', r_gershom_makkot_he.versionTitle)

#get the two slices of the whole text, corresponding to the new texts
jatext_tostay = JaggedTextArray(orig_tc.text).subarray_with_ref(stay_section_ref).array()
jatext_tomove = copy.deepcopy(JaggedTextArray(orig_tc.text).subarray_with_ref(move_section_ref).array())
#the piece of text being moved needs to be padded so that its overall structure matches the original structure
jatext_tostay = pad_moved_ja(jatext_tostay, stay_section_ref.sections)
jatext_tomove = pad_moved_ja(jatext_tomove, move_section_ref.sections)

orig_tc.text = jatext_tostay
orig_tc.save()

dest_tc.text = jatext_tomove
dest_tc.save()




