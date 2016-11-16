# -*- coding: utf-8 -*-

from sefaria.model import *

harchevs = IndexSet({"title": {"$regex": "^Harchev Davar"}})

for idx in harchevs:
    print idx.title
    collective_title = "Harchev Davar"
    base_book = idx.title.replace(collective_title+" on ", '')
    idx.dependence = 'Commentary'
    idx.collective_title = collective_title
    idx.base_text_mapping = None
    bidx = library.get_index(base_book)
    idx.base_text_titles = [base_book]
    idx.related_categories = [c for c in bidx.categories if c not in idx.categories]
    idx.save()