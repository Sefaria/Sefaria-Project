# -*- coding: utf-8 -*-

import argparse
import re
from sefaria.model import *
from sefaria.utils.hebrew import decompose_presentation_forms_in_str, decompose_presentation_forms

vs = VersionSet({'versionTitle': "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann", 'language': "he"})
assert vs.count() == 5
pres_re = re.compile(r"[\uFB1D-\uFB4F]", re.UNICODE)
for version in vs:
    for ch, chapter in enumerate(version.chapter,1):
        for vs, verse in enumerate(chapter, 1):
            for cm, comment in enumerate(verse, 1):
                chars = pres_re.findall(comment)
                if len(chars) > 0:
                    new_comment = decompose_presentation_forms_in_str(comment)
                    print("[{}] {}:{}.{}.{} - {}".format(len(comment), version.title, ch, vs, cm, comment.encode('utf-8')))
                    print("[{}] {}:{}.{}.{} - {}".format(len(new_comment), version.title, ch, vs, cm, new_comment.encode('utf-8')))
                    print("Characters found ({}): {}".format(len(chars), chars))
                    num_extra_length = sum([(len(decompose_presentation_forms(x))-len(x)) for x in chars])
                    print("Difference in Length: {}".format(num_extra_length))
                    assert len(new_comment) == (len(comment) + num_extra_length)

