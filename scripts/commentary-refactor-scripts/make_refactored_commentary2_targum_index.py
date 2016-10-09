
# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.utils.hebrew import hebrew_term


commentary2 = IndexSet({"categories.0": "Commentary2"})
targums = IndexSet({"categories.1": "Targum"})

targum_collective_titles = [('Aramaic Targum', 'to '),
                            ('Targum Jonathan', 'on '),
                            ('Onkelos', ''),
                            ('Targum Neofiti', None),
                            ('Targum Jerusalem', None),
                            ('Tafsir Rasag', None)]
for trg in targums:
    print trg.title
    for t in targum_collective_titles:
        if t[0] in trg.title:
            collective_title = t[0]
            if t[1] is not None:
                base_books = [trg.title.replace(t[0]+' '+t[1], '')]
            else:
                base_books = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy']
    trg.dependence = 'targum'
    trg.collective_title = collective_title
    trg.auto_linking_scheme = 'match_base_text_depth'
    if base_books:
        trg.base_text_titles = base_books
        for b in base_books:
            bidx = library.get_index(b)
            trg.related_categories = [c for c in bidx.categories if c not in trg.categories]
    trg.save()

for com2 in commentary2:
    print com2.title
    if ' on ' in com2.title:
        on_title = com2.title.split(" on ")[1].strip()
        try:
            base_books = [library.get_index(on_title).title]
        except Exception as e:
            base_books = [t for t in library.get_indexes_in_category(on_title)]

    com2.categories = [com2.categories[1], 'Commentary'] + com2.categories[2:]
    com2.dependence = 'commentary'
    com2.collective_title = com2.categories[2]
    com2.auto_linking_scheme = None
    if len(base_books):
        com2.base_text_titles = base_books
        other_categories = []
        for b in base_books:
            bidx = library.get_index(b)
            o_cats = [c for c in bidx.categories if c not in com2.categories and c not in other_categories]
            other_categories += o_cats
        com2.related_categories = other_categories
    com2.save()

    if not Term().load({"name": com2.collective_title}):
        term = Term({"name": com2.collective_title, 'scheme': 'commentary_titles'})
        titles = [
            {
                "lang": "en",
                "text": com2.collective_title,
                "primary": True
            },
            {
                "lang": "he",
                "text": hebrew_term(com2.collective_title),
                "primary": True
            }
        ]
        term.set_titles(titles)
        term.save()










