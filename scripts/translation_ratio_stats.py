# -*- coding: utf-8 -*-
from sefaria.model import *

torah =    library.get_indexes_in_category(["Tanakh", "Torah"])
prophets = library.get_indexes_in_category(["Tanakh", "Prophets"])
writings = library.get_indexes_in_category(["Tanakh", "Writings"])

cats = [("Torah", torah), ("Prophets", prophets), ("Writings", writings)]

for cat in cats:
    Hebrew  = VersionSet({"title": {"$in": cat[1]}, "versionTitle": 'Tanach with Text Only'}).word_count()
    JPS1917 = VersionSet({"title": {"$in": cat[1]}, "versionTitle": "The Holy Scriptures: A New Translation (JPS 1917)"}).word_count()
    JPS1985 = VersionSet({"title": {"$in": cat[1]}, "versionTitle": "Tanakh: The Holy Scriptures, published by JPS"}).word_count()
    print("%s:" % cat[0]) 
    print("JPS 1985 / Hebrew: %.2f" % (float(JPS1985) / Hebrew))
    print("JPS 1917 / Hebrew: %.2f" % (float(JPS1917) / Hebrew))
    print("JPS 1985 / JPS 1917: %.2f" % (float(JPS1985) / JPS1917))


mishnah =  library.get_indexes_in_category("Mishnah")

en = 0
he = 0
for m in mishnah:
    en += TextChunk(Ref(m), lang="en").word_count()
    he += TextChunk(Ref(m), lang="he").word_count()


print("Mishnah:")
print("English / Hebrew: %.2f" % (float(en) / he))