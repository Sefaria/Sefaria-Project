# -*- coding: utf-8 -*-
"""
Migrate category structure for Commentary2 texts
"""
from sefaria.model import *

indexes = IndexSet({"categories.0": "Commentary2"})

for i in indexes:
    on_split = i.get_title().split(" on ")
    if len(on_split) == 2:
        commentator = on_split[0]
    else:
        commentator = u"Rambam"

    i.categories = [u"Commentary2", i.categories[1], commentator]
    i.save()
