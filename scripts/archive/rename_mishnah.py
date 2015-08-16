# -*- coding: utf-8 -*-
"""
Change spelling of "Mishna" to "Mishnah" in all text names and categories.
"""

import sys
import os

import pymongo


p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
from sefaria.texts import *
from sefaria.clean import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


remove_refs_with_false()

mishnahs = db.index.find({"categories": "Mishna"})
for m in mishnahs:
	old = m["title"]
	new = m["title"].replace("Mishna ", "Mishnah ")
	update_text_title(old, new)

rename_category("Mishna", "Mishnah")

mishnahs = db.index.find({"categories": "Mishnah"})
for m in mishnahs:
	variants = set([v.replace("Mishna ", "Mishnah ") for v in m["titleVariants"]])
	new_variants = set([v.replace("Mishnah ", "Mishna ") for v in variants])
	m["titleVariants"] = list(variants.union(new_variants))
	db.index.save(m)

update_table_of_contents()
save_toc_to_db()