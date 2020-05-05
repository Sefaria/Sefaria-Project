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
import pymongo
from helper.link import add_links_from_text
from sefaria.utils.talmud import section_to_daf

p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
#sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")

import sefaria.model.text as txt
from sefaria.system.database import db

user = 28
texts = db.texts.find({"language": "he"})

text_total = {}
text_order = []
for text in texts:
	if text['title'] not in text_total:
		text_total[text["title"]] = 0
		text_order.append(text["title"])
	print(text["title"])
	index = txt.library.get_index(text["title"])
	if not index or not index.get("categories"):
		print("No index found for " + text["title"])
		continue
	if "Tanach" in index.categories:
		continue
	talmud = True if "Talmud" in index.categories else False

	for i in range(len(text['chapter'])):
		if talmud:
			if "Bavli" in index.categories and i < 2:
				continue
			chap = section_to_daf(i + 1)
		else:
			chap = i + 1
		ref = text['title'] + " " + str(chap)
		print(ref)
		try:
			result = add_links_from_text(ref, text['language'], text['chapter'][i], text['_id'], user)
			if result:
				text_total[text["title"]] += len(result)
		except Exception as e:
			print(e)

total = 0
for text in text_order:
	num = text_total[text]
	index = txt.library.get_index(text)
	if getattr(index, "categories", None):
		print(text.replace(",",";") + "," + str(num) + "," + ",".join(index.categories))
	else:
		print(text.replace(",",";") + "," + str(num))
	total += num
print("Total " + str(total))