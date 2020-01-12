# -*- coding: utf-8 -*-

"""
Split Mishneh Torah from being a single text of depth 4,
transform into a text for each topic (depth 2).
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

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


# Insert index records from JSON
mishneh_torah = json.loads(open("mishneh-torah.json", "r").read())

for topic in mishneh_torah:
	db.index.save(topic)


# Build the mapping of numbered sections to new text names
index = []
indices = db.index.find({"categories": "Mishneh Torah"}).sort([["order.0", 1]])
section = -1
for i in indices:
	if i["order"][1] == 1:
		index.append([])
		section += 1
	index[section].append(i["title"])


# Find and split texts
texts = db.texts.find({"title": "Mishneh Torah"})
new_texts = []
for text in texts:
	for i in range(len(text["chapter"])):
		for j in range(len(text["chapter"][i])):
			if text["chapter"][i][j] != []:
				new_text = {
					"title": index[i+1][j],
					"chapter": text["chapter"][i][j],
					"versionTitle": text["versionTitle"],
					"versionSource": text["versionSource"],
					"language": text["language"]
				}
				db.texts.save(new_text)

db.texts.remove({"title": "Mishneh Torah"})
db.index.remove({"title": "Mishneh Torah"})

update_counts()
update_summaries()
invalidate_template_cache("texts_list")

# Rewrite a ref fom old style to new style
def rewrite(ref):
	m = re.search("^Mishneh Torah (\d+):(\d+)", ref)
	if not m: return ref
	i, j = int(m.group(1)), int(m.group(2))
	ref = re.sub("Mishneh Torah %d:%d:" % (i, j), index[i][j-1] + " ", ref)
	return ref


# Rewrite links
links = db.links.find({"refs": {"$regex": "^Mishneh Torah"}})
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

text_hist = db.history.find({"ref": {"$regex": "^Mishneh Torah"}})
for h in text_hist:
	rewrite_hist(h)

link_hist = db.history.find({"new.refs": {"$regex": "^Mishneh Torah"}})
for h in link_hist:
	rewrite_hist(h)

link_hist = db.history.find({"old.refs": {"$regex": "^Mishneh Torah"}})
for h in link_hist:
	rewrite_hist(h)