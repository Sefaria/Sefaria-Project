# -*- coding: utf-8 -*-
"""Adds an Introduction section to the complex text Ben Ish Hai"""
from sefaria.model import *

# Versions
vs = VersionSet({"title": "Ben Ish Hai"})
for v in vs:
    v.chapter["intro"] = []
    v.save()

# Prep VersionState

vs = VersionState("Ben Ish Hai")
flags = vs.flags
vs.delete()

# Index
i = library.get_index("Ben Ish Hai")

intro = JaggedArrayNode(index=i)
intro.add_title("Introduction", "en", primary=True)
intro.add_title("הקדמה", "he", primary=True)
intro.key = "intro"
intro.depth = 1
intro.sectionNames = ["Paragraph"]
intro.addressTypes = ["Integer"]

i.nodes.children.insert(0, intro)
i.save()

# Refresh VersionState
vs = VersionState("Ben Ish Hai")
vs.flags = flags
vs.save()
