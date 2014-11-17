# -*- coding: utf-8 -*-

from sefaria.model import *
import sefaria.model.text as text
from sefaria.utils.hebrew import is_hebrew
from sefaria.system.database import db


def convert(idx):
    node = text.JaggedArrayNode()

    node.key = idx.title
    node.sectionNames = idx.sectionNames
    node.depth = len(node.sectionNames)
    del idx.sectionNames

    r = Ref(idx.title)
    if r.is_talmud():
        if node.depth != 2:
            raise Exception("Talmud not depth 2!")
        node.addressTypes = ["Talmud", "Integer"]
        if r.index.categories[1] == "Bavli" and getattr(idx, "heTitle", None):
            node.checkFirst = {"he": u"משנה" + idx.heTitle}
    elif r.index.categories[0] == "Mishnah":
        node.addressTypes = ["Perek", "Mishnah"]
    else:
        node.addressTypes = ["Integer" for x in range(node.depth)]
    if getattr(idx, "length", None):
        node.lengths = [idx.length]
        del idx.length
    if getattr(idx, "lengths", None):
        node.lengths = idx.lengths  #overwrite if index.length is already there
        del idx.lengths

    #Build titles
    node.add_title(idx.title, "en", True)
    for t in idx.titleVariants:
        lang = "he" if is_hebrew(t) else "en"
        node.add_title(t, lang)
    del idx.titleVariants
    if getattr(idx, "heTitle", None):
        node.add_title(idx.heTitle, "he", True)
        del idx.heTitle
    if getattr(idx, "heTitleVariants", None):
        for t in idx.heTitleVariants:
            node.add_title(t, "he")
        del idx.heTitleVariants

    idx.schema = node.serialize()


try:
    db.index.drop_index("titleVariants")
except:
    pass

for indx in IndexSet():
    if indx.is_commentary() or getattr(indx, "schema", None):
        print "Skipping " + indx.title
        continue
    print indx.title
    convert(indx)
    indx.save()


"""
Scripts used for an intermediate upgrade:
ix = IndexSet({"categories.0":"Mishnah"})
for i in ix:
	i.nodes.addressTypes = ["Perek","Mishnah"]
	i.save()
ix = IndexSet({"categories.1":"Bavli"})
for i in ix:
	i.nodes.checkFirst = {"he": u"משנה " + i.nodes.primary_title("he")}
	i.save()
"""
