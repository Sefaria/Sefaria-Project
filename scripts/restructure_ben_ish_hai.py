# -*- coding: utf-8 -*-
"""Adds an Introduction section to the complex text Ben Ish Hai"""
from sefaria.model import *

# Versions
vs = VersionSet({"title": "Ben Ish Hai"})
for v in vs:
    v.chapter["intro"] = []
    v.save()

# Prep VersionState
v = VersionState("Ben Ish Hai")
v.content["intro"] = {}
v.refresh()

# Index
intro = JaggedArrayNode()
intro.add_title("Introduction", "en", primary=True)
intro.add_title(u"הקדמה", "he", primary=True)
intro.key = "intro"
intro.depth = 1
intro.sectionNames = ["Paragraph"]
intro.addressTypes = ["Integer"]

i = get_index("Ben Ish Chai")
i.nodes.children.insert(0, intro)
i.save()

# Refresh VersionState
v = VersionState("Ben Ish Hai")
v.refresh()