# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.system.database import db


for x in ["titleVariants", "titleVariants_1"]:
    try:
        db.index.drop_index(x)
    except:
        pass

for indx in IndexSet():
    if indx.is_commentary():
        print "Skipping " + indx.title
        continue
    print indx.title
    try:
        indx.save()
    except Exception as e:
        print u"Caught exception: {}".format(e)
