# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import pymongo
import os
import locale
import operator
from collections import defaultdict
from datetime import datetime
path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")
from sefaria.settings import *
from sefaria.texts import *
from sefaria.sheets import *
from sefaria.util import strip_tags

action   = sys.argv[1] if len(sys.argv) > 1 else None

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


refs               = defaultdict(int)
texts              = defaultdict(int)
categories         = defaultdict(int)

untrans_texts      = defaultdict(int)
untrans_categories = defaultdict(int)
untrans_refs       = defaultdict(int)

languages          = defaultdict(int)

sources_count      = 0
untrans_count      = 0
comments_count     = 0
outside_count      = 0

def count_sources(sources):
	global refs, texts, categories
	global sources_count, comments_count, outside_count, untrans_count
	global untrans_texts, untrans_categories, untrans_refs

	for s in sources:
		if "ref" in s:
			sources_count += 1
			pRef = parse_ref(s["ref"])
			if "error" in pRef:
				continue
			refs[s["ref"]] += 1
			texts[pRef["book"]] += 1
			categories[pRef["categories"][0]] += 1

			if "text" in s and "en" in s["text"] and "he" in s["text"] and len(s["text"]["he"]):
				en = strip_tags(s["text"]["en"])
				he = strip_tags(s["text"]["he"])
				if len(he) and len(en) / float(len(he)) < 0.30:
					untrans_categories[pRef["categories"][0]] +=1 
					untrans_texts[pRef["book"]] += 1
					untrans_refs[s["ref"]] += 1
					untrans_count += 1

			if "subsources" in s:
				count_sources(s["subsources"])
		
		elif "comment" in s:
			comments_count += 1
		
		elif "outsideText" in s:
			outside_count += 1


sheets = db.sheets.find()
total = sheets.count()

for sheet in sheets: 
	global language
	count_sources(sheet["sources"])
	if "options" in sheet and "language" in sheet["options"]:
		languages[sheet["options"]["language"]] += 1
	else:
		languages["bilingual"] += 1


sorted_refs       = sorted(refs.iteritems(), key=lambda x: -x[1])[:20]
sorted_texts      = sorted(texts.iteritems(), key=lambda x: -x[1])[:20]
sorted_categories = sorted(categories.iteritems(), key=lambda x: -x[1])[:20]

sorted_untrans_refs       = sorted(untrans_refs.iteritems(), key=lambda x: -x[1])[:20]
sorted_untrans_texts      = sorted(untrans_texts.iteritems(), key=lambda x: -x[1])[:20]
sorted_untrans_categories = sorted(untrans_categories.iteritems(), key=lambda x: -x[1])[:20]

print "*********************************\n"

print "%d Total Sheets\n" % total

print "%0.1f%% Bilingual" % (100 * languages["bilingual"] / float(total))
print "%0.1f%% Hebrew" % (100 * languages["hebrew"] / float(total))
print "%0.1f%% English" % (100 * languages["english"] / float(total))

print "\n%d Sources" % sources_count
print "%d Untranslated Sources" % comments_count

print "%d Comments" % comments_count
print "%d Outside Texts" % outside_count



print "\n******* Top Sources ********\n"
for item in sorted_refs:
	print "%s: %d" % (item[0], item[1])

print "\n******* Top Texts ********\n"
for item in sorted_texts:
	print "%s: %d" % (item[0], item[1])

print "\n******* Top Categories ********\n"
for item in sorted_categories:
	print "%s: %d" % (item[0], item[1])


print "\n******* Top Untranslated Sources ********\n"
for item in sorted_untrans_refs:
	print "%s: %d" % (item[0], item[1])

print "\n******* Top Untranslated Texts ********\n"
for item in sorted_untrans_texts:
	print "%s: %d" % (item[0], item[1])

print "\n******* Top Untranslated Categories ********\n"
for item in sorted_untrans_categories:
	print "%s: %d" % (item[0], item[1])


if action == "savesheet":
	sheet = {
		"title": "Top Sources in All Source Sheets",
		"sources": [{"ref": ref[0]} for ref in sorted_refs],
		"options": {"numbered": 1}
	}
	save_sheet(sheet, 1)