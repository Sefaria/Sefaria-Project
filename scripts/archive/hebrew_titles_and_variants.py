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

p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
from sefaria.texts import *
from sefaria.summaries import update_table_of_contents

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


# For mishna, add a leading u'משנה' to the Hebrew name
mishnahs = db.index.find({"categories": "Mishnah"})
for m in mishnahs:
	title = m["heTitle"]
	if not regex.match('משנה', m["heTitle"]):
		m["heTitle"] = 'משנה' + " " + title
		db.index.save(m)
# Do we need to do anything like update_text_title()?

# To all index records with a heTitle, add heTitleVariants and copy the heTitle to heTitleVariants
idxs = db.index.find({"heTitle": {"$exists": 1}})
for i in idxs:
	i['heTitleVariants'] = [i['heTitle']]
	db.index.save(i)

# For mishna that does not have a Gemara as well, add the simple name to heTitleVariants
mlist = ['פאה', 'דמאי', 'כלאים', 'שביעית' ,'תרומות', 'מעשרות', 'מעשר שני', 'חלה', 'ערלה', 'ביכורים', 'שקלים', 'עדיות', 'אבות', 'מדות', 'קינים', 'כלים', 'אהלות', 'נגעים', 'פרה', 'טהרות', 'מקואות', 'מכשירין', 'זבים', 'טבול יום', 'ידים', 'עוקצים']
for m in mlist:
	print(m)
	search = [m,'משנה' + " " + m]
	mrec = db.index.find_one({"categories": "Mishnah", "heTitle": {"$in": search}})
	v = mrec.get("heTitleVariants")
	v.append(m)
	mrec['heTitleVariants'] = v
	db.index.save(mrec)


'''
05d0 - aleph
05d1 - bet
05de - mem
05e7 - kuf
05e9 - shin
'''

alts = {
	'ירמיה': 'ירמיהו',
	'נידה': 'נדה',
	'ישעיה': 'ישעיהו',
	'תהלים': 'תהילים',
	'ערובין': 'עירובין',
	'\u05de\"\u05d0': 'מלכים א',
	'\u05de\"\u05d1': 'מלכים ב',
	'\u05e9\"\u05d0': 'שמואל א',
	'\u05e9\"\u05d1': 'שמואל ב',
	'\u05d1\"\u05de': 'בבא מציעא',
	'\u05d1\"\u05e7': 'בבא קמא',
	'\u05d1\"\u05d1': 'בבא בתרא'
}

for alt, book in list(alts.items()):
	print(book)
	mrec = db.index.find_one({"heTitle": book})
	v = mrec.get("heTitleVariants")
	v.append(alt)
	mrec['heTitleVariants'] = v
	db.index.save(mrec)

update_table_of_contents()
