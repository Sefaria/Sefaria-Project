# -*- coding: utf-8 -*-

from sefaria.model import *

indices = library.get_indexes_in_category('Tanach', include_dependant=True, full_records=True)

for idx in indices:
    pos = idx.categories.index('Tanach')
    #print "{}:{}".format(idx.categories, pos)
    idx.categories[pos] = 'Tanakh'
    idx.save()

bdb = Lexicon().load({'name': 'BDB Augmented Strong'})
bdb.text_categories = [
        "Tanakh, Torah",
        "Tanakh, Prophets",
        "Tanakh, Writings"
    ]
bdb.save()