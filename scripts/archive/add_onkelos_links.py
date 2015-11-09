# -*- coding: utf-8 -*-
"""
Split Shulchan Aruch from being a single text of depth 3,
transform into a text for each Chelek (depth 2).
- Split existing texts
- Rewrites existing links
- Rewrites history
"""

import sys
import os
p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")

import pymongo

from sefaria.system.database import db


chapters = generate_refs_list({"title": {"$regex": "Onkelos"}})

for ref in chapters:
	text = get_text(ref, commentary=0)
	verses = len(text["he"])

	for i in range(verses):
		ref1 = "%s:%d" % (ref, i+1)
		ref2 = ref1.replace("Onkelos ", "")

		link = {
			"refs": [ref1, ref2],
			"type": "targum"
		}
		db.links.save(link)