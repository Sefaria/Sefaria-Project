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
        commentator = "Rambam"

    if i.title == "Introduction to the Mishnah":
        i.order = [0]
    if i.title == "Introduction to Masechet Horayot":
        i.order = [39.5]
    if i.title == "Introduction to Seder Kodashim":
        i.order = [40.5]

    i.categories = ["Commentary2", i.categories[1], commentator]
    i.save()

library.rebuild_toc()