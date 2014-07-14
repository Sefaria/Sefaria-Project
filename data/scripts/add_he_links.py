# -*- coding: utf-8 -*-
"""
# add_links_from_text for every ref

# generate_refs_list to get all refs
#	get_text (commentary=false)
#		is there data in 'he'? (and skip tanach)
#			add_links_from_text
"""

import sys
import os
import re
from pprint import pprint
import pymongo

p = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
#sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
import texts as t
import counts as c

connection = pymongo.Connection()
db = connection[t.SEFARIA_DB]
if t.SEFARIA_DB_USER and t.SEFARIA_DB_PASSWORD:
	db.authenticate(t.SEFARIA_DB_USER, t.SEFARIA_DB_PASSWORD)

user = 1
texts = db.texts.find({"language": "he"})

text_total = {}
text_order = []
for text in texts:
	if text['title'] not in text_total:
		text_total[text["title"]] = 0
		text_order.append(text["title"])
	print text["title"]
	index = t.get_index(text["title"])
	if not index or not index.get("categories"):
		print "No index found for " + text["title"]
		continue
	if "Tanach" in index['categories']:
		continue
	talmud = True if "Talmud" in index['categories'] else False

	for i in range(len(text['chapter'])):
		if talmud:
			if "Bavli" in index['categories'] and i < 2:
				continue
			chap = t.section_to_daf(i + 1)
		else:
			chap = i + 1
		ref = text['title'] + " " + str(chap)
		print ref
		try:
			result = t.add_links_from_text(ref, {"text": text['chapter'][i]}, user)
			if result:
				text_total[text["title"]] += len(result)
		except Exception, e:
			print e

total = 0
for text in text_order:
	num = text_total[text]
	print text.replace(",",";") + "," + str(num)
	total += num
print "Total " + str(total)