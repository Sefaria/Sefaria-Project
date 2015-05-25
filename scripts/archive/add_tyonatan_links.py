# -*- coding: utf-8 -*-

import sys
import os
p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")

import pymongo

from sefaria.texts import get_text, generate_refs_list
from sefaria.settings import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


chapters = generate_refs_list({"title": {"$regex": "Targum Jonathan"}})

for ref in chapters:
	text = get_text(ref, commentary=0)
	verses = len(text["he"])

	for i in range(verses):
		ref1 = "%s:%d" % (ref, i+1)
		ref2 = ref1.replace("Targum Jonathan on ", "")

		link = {
			"refs": [ref1, ref2],
			"type": "targum"
		}
		db.links.save(link)