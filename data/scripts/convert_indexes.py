# -*- coding: utf-8 -*-

from sefaria.model import *
import sefaria.model.text as text
from sefaria.utils.hebrew import is_hebrew
from sefaria.system.database import db


def convert(idx):
    node = text.JaggedArrayNode()
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
    node.sectionNames = idx.sectionNames
    del idx.sectionNames
    node.key = idx.title
    node.depth = len(node.sectionNames)
    if Ref(idx.title).is_talmud():
        if node.depth != 2:
            raise Exception("Talmud not depth 2!")
        node.addressTypes = ["Talmud", "Integer"]
    else:
        node.addressTypes = ["Integer" for x in range(node.depth)]
    if getattr(idx, "length", None):
        node.lengths = [idx.length]
        del idx.length
    if getattr(idx, "lengths", None):
        node.lengths = idx.lengths  #overwrite if index.length is already there
        del idx.lengths
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
