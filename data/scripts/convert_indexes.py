# -*- coding: utf-8 -*-

from sefaria.model import *
import sefaria.model.text as text


def convert(index):
    node = text.JaggedArrayNode()
    #Build titles
    node.add_title(index.title, "en", True)
    for t in index.titleVariants:
        node.add_title(t, "en")
    del index.titleVariants
    if getattr(index, "heTitle", None):
        node.add_title(index.heTitle, "he", True)
        del index.heTitle
    if getattr(index, "heTitleVariants", None):
        for t in index.heTitleVariants:
            node.add_title(t, "he")
        del index.heTitleVariants
    node.sectionNames = index.sectionNames
    del index.sectionNames
    node.key = index.title
    node.depth = len(node.sectionNames)
    if Ref(index.title).is_talmud():
        if node.depth != 2:
            raise Exception("Talmud not depth 2!")
        node.addressTypes = ["Talmud", "Integer"]
    else:
        node.addressTypes = ["Integer" for x in range(node.depth)]
    if getattr(index, "length", None):
        node.lengths = [index.length]
        del index.length
    if getattr(index, "lengths", None):
        node.lengths = index.lengths  #overwrite if index.length is already there
        del index.lengths
    index.schema = node.serialize()


for index in IndexSet():
    if index.is_commentary() or getattr(index, "schema", None):
        print "Skipping " + index.title
        continue
    print index.title
    convert(index)
    index.save()
