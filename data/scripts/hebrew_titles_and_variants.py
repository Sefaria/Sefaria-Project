# -*- coding: utf-8 -*-
"""
For mishna, add a leading u'משנה' to the Hebrew name
To all index records with a heTitle, add heTitleVariants and copy the heTitle to heTitleVariants
For mishna that does not have a Gemara as well, add the simple name to heTitleVariants

"""

import sys
import os
import re
from pprint import pprint
import pymongo

p = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
from sefaria.texts import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


# For mishna, add a leading u'משנה' to the Hebrew name
mishnahs = db.index.find({"categories": "Mishna"})
for m in mishnahs:
	title = m["heTitle"]
	if not regex.match(u'משנה', m["heTitle"]):
		m["heTitle"] = u'משנה' + " " + title
		db.index.save(m)
# Do we need to do anything like update_text_title()?

# To all index records with a heTitle, add heTitleVariants and copy the heTitle to heTitleVariants
idxs = db.index.find({"heTitle": {"$exists": 1}})
for i in idxs:
	i['heTitleVariants'] = [i['heTitle']]
	db.index.save(i)

# For mishna that does not have a Gemara as well, add the simple name to heTitleVariants
mlist = [u'פאה', u'דמאי', u'כלאים', u'שביעית' ,u'תרומות', u'מעשרות', u'מעשר שני', u'חלה', u'ערלה', u'ביכורים', u'שקלים', u'עדויות', u'אבות', u'מדות', u'כינים', u'כלים', u'אהלות', u'נגעים', u'פרה', u'טהרות', u'מקואות', u'מכשירים', u'זבים', u'טבול יום', u'ידים', u'עוקצים']
for m in mlist:
	search = [m,u'משנה' + " " + m]
	mrec = db.index.find_one({"categories": "Mishna", "heTitle": {"$in": search}})
	v = mrec.get("heTitleVariants")
	v.append(m)
	mrec['heTitleVariants'] = v
	db.index.save(mrec)

update_table_of_contents()
