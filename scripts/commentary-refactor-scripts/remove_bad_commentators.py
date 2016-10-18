# -*- coding: utf-8 -*-

from sefaria.model import Index, IndexSet, VersionSet, Term
from sefaria.system.database import db
import re


commentators  = IndexSet({"categories.0": "Commentary"})
bad_commentator_titles = []
for idx in commentators:
    commentary_re = ur"^({}) on ".format(idx.title)
    query = {"title": {"$regex": commentary_re}}
    vs_count = VersionSet(query).count()
    if vs_count < 1:
        bad_commentator_titles.append(idx.title)
        idx.delete()

print "Found {} bad Commentator titles".format(len(bad_commentator_titles))
print bad_commentator_titles