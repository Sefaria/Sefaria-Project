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

import pymongo


p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
from sefaria.texts import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

rename_category("Halacha", "Halakhah")

mt = db.index.find({"categories": "Mishneh Torah"})

for i in mt:
	i["categories"].insert(0, "Halakhah")
	db.index.save(i)

talmud = db.index.find({"categories": "Talmud"})
for t in talmud:
	if t["categories"][1] == "Talmud Yerushalmi":
		t["categories"][1] = "Yerushalmi"
	else:
		t["categories"].insert(1, "Bavli")

	db.index.save(t)

update_summaries()