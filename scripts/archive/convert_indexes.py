# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.system.database import db
from sefaria.clean import remove_old_counts

#Clear out counts
remove_old_counts()
db.vstate.remove({})

#Remove mongo indexes for Index.titleVariants
for x in ["titleVariants", "titleVariants_1"]:
    try:
        db.index.drop_index(x)
    except:
        pass

#Covert Indexes to new format
for indx in IndexSet():
    print(indx.title)
    try:
        indx.save()
    except Exception as e:
        print("Caught exception: {}".format(e))

#Convert all existing Version counts to VersionState objects
for c in CountSet({"title": {"$exists": 1}}):
    print(c.title)
    try:
        vs = VersionState(c.title)
        vs.flags = getattr(c, "flags", {})
        vs.save()
    except Exception as e:
        print("Couldn't modify version state {}: {}".format(c.title, e))
