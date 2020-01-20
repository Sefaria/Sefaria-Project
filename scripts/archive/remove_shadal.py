# -*- coding: utf-8 -*-
"""
Remove texts and of Shadal that may be under copyright, 
also remove any links to texts that we know longer have.
"""

import sys
import os
from copy import deepcopy


from pprint import pprint

path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.database import db
from sefaria import counts
from sefaria.clean import remove_old_counts
from sefaria.texts import parse_ref

titles = set()

versions = db.texts.find({"title": {"$regex": "^Shadal on "}})
for version in versions:

	# TODO Split Shadal on Genesis
	if version["versionSource"].startswith("http://Shadal"):
		version_copy = deepcopy(version)
		version_copy["title"] = "(removed) Shadal on Genesis"
		del version_copy["_id"]
		db.texts.save(version_copy)

		version["chapter"] = version["chapter"][:4]
		db.texts.save(version)


	elif (not version["versionSource"].startswith("http://www.sefaria.org") and
		not version["versionSource"].startswith("http://www.archive.org")):

		titles.add(version["title"])
		version["title"] = "(removed) " + version["title"] 
		db.texts.save(version)


links = db.links.find({"refs": {"$regex": "^Shadal on "}})
for link in links:
	parsed = list(map(parse_ref, link["refs"]))
	remove = True
	for p in parsed:
		if (p.get("book", None) == "Shadal on Genesis" 
			and p.get("sections", [999])[0] <= 5):
			remove = False
	if remove:
		db.links.remove(link)


for title in list(titles):
	counts.update_full_text_count(title)


remove_old_counts()