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
import re
from pprint import pprint
import pymongo

p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
from sefaria.texts import *
from sefaria.counts import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

sections =[
	"Shulchan Arukh, Orach Chayyim",
	"Shulchan Arukh, Yoreh De'ah",
	"Shulchan Arukh, Even HaEzer",
	"Shulchan Arukh, Choshen Mishpat"
	]

# Add Order info to index records
for i in range(len(sections)):
	index = db.index.find_one({"title": sections[i]})
	index["order"] = [i+1]
	db.index.save(index)


# Find and split texts
texts = db.texts.find({"title": "Shulchan Aruch"})
for text in texts:
	for i in range(len(text["chapter"])):
		if text["chapter"][i] != []:
			new_text = {
				"title": sections[i],
				"chapter": text["chapter"][i],
				"versionTitle": text["versionTitle"],
				"versionSource": text["versionSource"],
				"language": text["language"]
			}
			db.texts.save(new_text)

db.texts.remove({"title": "Shulchan Aruch"})
db.index.remove({"title": "Shulchan Aruch"})

update_counts()
update_summaries()

# Rewrite a ref fom old style to new style
def rewrite(ref):
	if not ref:
		return ref
		
	m = re.search("^Shulchan Aruch (\d+)", ref)
	if not m: return ref
	i = int(m.group(1))
	try:
		new_ref = re.sub("Shulchan Aruch %d:" % i, sections[i-1] + " ", ref)
	except:
		return ref
	return new_ref


# Rewrite links
links = db.links.find({"refs": {"$regex": "^Shulchan Aruch"}})
new_links = []
for link in links:
	link["refs"] = list(map(rewrite, link["refs"]))
	db.links.save(link)


# Rewrite history
def rewrite_hist(h):
	if "ref" in h:
		h["ref"] = rewrite(h["ref"])
	if "new" in h and h["new"] and "refs" in h["new"]:
		h["new"]["refs"] = list(map(rewrite, h["new"]["refs"]))
	if "old" in h and h["old"] and "refs" in h["old"]:
		h["old"]["refs"] = list(map(rewrite, h["old"]["refs"]))
	db.history.save(h)

text_hist = db.history.find({"ref": {"$regex": "^Shulchan Aruch"}})
for h in text_hist:
	rewrite_hist(h)

link_hist = db.history.find({"new.refs": {"$regex": "^Shulchan Aruch"}})
for h in link_hist:
	rewrite_hist(h)

link_hist = db.history.find({"old.refs": {"$regex": "^Shulchan Aruch"}})
for h in link_hist:
	rewrite_hist(h)