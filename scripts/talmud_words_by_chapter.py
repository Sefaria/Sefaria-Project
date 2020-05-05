# -*- coding: utf-8 -*-
from sefaria.model import *

titles = library.get_indexes_in_category("Bavli")
for title in titles:
    indx = get_index(title)
    chapters = indx.alt_structs["Chapters"]["refs"]
    for i, ref in enumerate(chapters):
        text = Ref(ref).text(lang="he")
        words = text.word_count()
        chapter  = "%s chapter %d" % (title, i+1)
        print("%s, %d" % (chapter, words))
