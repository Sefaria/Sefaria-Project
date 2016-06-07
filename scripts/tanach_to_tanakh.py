# -*- coding: utf-8 -*-

from sefaria.model import *

indices = library.get_indexes_in_category('Tanach', include_commentary=True, full_records=True)

for idx in indices:
    pos = idx.categories.index('Tanach')
    #print "{}:{}".format(idx.categories, pos)
    idx.categories[pos] = u'Tanakh'
    idx.save()