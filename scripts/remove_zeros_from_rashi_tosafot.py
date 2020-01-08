# -*- coding: utf-8 -*-

from sefaria.model import *

for v in library.get_commentary_versions(["Rashi","Tosafot"]):
    assert isinstance(v, Version)
    print("{} {}".format(v.title, v.versionTitle))
    index = v.get_index()
    for sref in index.all_top_section_refs():
        tc = TextChunk(sref, v.language, v.versionTitle)
        if [0] in tc.text:
            tc.text = [s if s != [0] else [] for s in tc.text]
            tc.save()
            print("Fixed {}".format(sref.normal()))
