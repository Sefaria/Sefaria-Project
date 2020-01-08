# -*- coding: utf-8 -*-
"""
# remove all quotation references from bavli
#	query to get names of bavli texts
#	use those to search for refs where bavli is in there and type is quotation
#		(and tanach name)
"""

import sys
import os
import re
from pprint import pprint
import pymongo

p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
from sefaria.texts import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)



mesechtot = get_text_titles({"categories": "Bavli"})
m_title_string = "|".join([re.escape(m) for m in mesechtot])
mregex = "^(" + m_title_string + ")\s\d"
print(mregex)

tanach = get_text_titles({"categories": "Tanach"})
t_title_string = "|".join([re.escape(m) for m in tanach])
tregex = "^(" + t_title_string + ")\s\d"
print(tregex)

q = {
	"type": "quotation",
	"anchorText": {"$regex": "^$"},
	"$and": [
		{"refs": {"$regex": mregex}},
		{"refs": {"$regex": tregex}}
	]
}
tlinks = db.links.find(q)

#for t in tlinks:
#		print t
print("Removing " + str(tlinks.count()) + " links.")

db.links.remove(q)


