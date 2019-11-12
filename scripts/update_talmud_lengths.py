# -*- coding: utf-8 -*-

from sefaria.model import *

i = IndexSet({"$and": [{"categories": "Talmud"}, {"categories": {"$ne": "Commentary"}}]})
for ind in i:
    sn = StateNode(ind.title)
    ac = sn.get_available_counts("he")
    try:
        l = ind.nodes.lengths
        if ac != l:
            print("{} {}:{}".format(ind.title, ac, l))
            ind.nodes.lengths = ac[:]
            ind.save()
    except Exception as e:
        print("{} {}".format(ind.title, e))
        ind.nodes.lengths = ac[:]
        ind.save()