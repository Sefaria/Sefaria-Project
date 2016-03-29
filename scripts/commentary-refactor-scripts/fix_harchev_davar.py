# -*- coding: utf-8 -*-

from sefaria.model import *

harchevs = IndexSet({"title": {"$regex": "^Harchev Davar"}})

for idx in harchevs:
    print idx.title
    work_title = "Harchev Davar"
    base_book = idx.title.replace(work_title+" on ", '')
    idx.dependence = 'commentary'
    idx.work_title = work_title
    idx.auto_linking_scheme = None
    bidx = library.get_index(base_book)
    idx.base_text_titles = [base_book]
    idx.related_categories = [c for c in bidx.categories if c not in idx.categories]
    idx.save()