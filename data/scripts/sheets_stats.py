# -*- coding: utf-8 -*-
import sys
import os
import locale
import operator
from collections import defaultdict
from datetime import datetime
from pprint import pprint

path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.texts import parse_ref
from sefaria.counts import is_ref_translated
from sefaria.sheets import save_sheet, LISTED_SHEETS
from sefaria.util import strip_tags
from sefaria.database import db

action   = sys.argv[1] if len(sys.argv) > 1 else None

show_count = 20

refs               = defaultdict(int)
texts              = defaultdict(int)
categories         = defaultdict(int)

untrans_texts      = defaultdict(int)
untrans_categories = defaultdict(int)
untrans_refs       = defaultdict(int)

fragments          = defaultdict(list)

languages          = defaultdict(int)

sources_count      = 0
untrans_count      = 0
comments_count     = 0
outside_count      = 0
fragments_count    = 0


def count_sources(sources, sheet_id):
	global refs, texts, categories
	global sources_count, comments_count, outside_count, untrans_count
	global untrans_texts, untrans_categories, untrans_refs
	global fragments, fragments_count

	for s in sources:
		if "ref" in s:
			sources_count += 1
			pRef = parse_ref(s["ref"])
			if "error" in pRef:
				continue
			refs[s["ref"]] += 1
			texts[pRef["book"]] += 1
			categories[pRef["categories"][0]] += 1

			if not is_ref_translated(s["ref"]):
				untrans_categories[pRef["categories"][0]] +=1 
				untrans_texts[pRef["book"]] += 1
				untrans_refs[s["ref"]] += 1
				untrans_count += 1

				en = strip_tags(s.get("text", {}).get("en", ""))
				if len(en) > 25:
					fragments[s["ref"]].append(sheet_id)
					fragments_count += 1

			if "subsources" in s:
				count_sources(s["subsources"], sheet_id)
		
		elif "comment" in s:
			comments_count += 1
		
		elif "outsideText" in s or "outsideBiText" in s:
			outside_count += 1


sheets       = db.sheets.find()
total        = sheets.count()
public_total = db.sheets.find({"status": {"$in": LISTED_SHEETS}}).count()

for sheet in sheets: 
	global language
	count_sources(sheet["sources"], sheet["id"])
	if "options" in sheet and "language" in sheet["options"]:
		languages[sheet["options"]["language"]] += 1
	else:
		languages["bilingual"] += 1


sorted_refs       = sorted(refs.iteritems(), key=lambda x: -x[1])
sorted_texts      = sorted(texts.iteritems(), key=lambda x: -x[1])
sorted_categories = sorted(categories.iteritems(), key=lambda x: -x[1])

sorted_untrans_refs       = sorted(untrans_refs.iteritems(), key=lambda x: -x[1])
sorted_untrans_texts      = sorted(untrans_texts.iteritems(), key=lambda x: -x[1])
sorted_untrans_categories = sorted(untrans_categories.iteritems(), key=lambda x: -x[1])

sorted_fragments          = sorted(fragments.iteritems(), key=lambda x: -len(x[1]))


if action == "print":
	print "*********************************\n"

	print "%d Total Sheets" % total
	print "%d Public Sheets" % public_total
	print "\n"
	print "%0.1f%% Bilingual" % (100 * languages["bilingual"] / float(total))
	print "%0.1f%% Hebrew" % (100 * languages["hebrew"] / float(total))
	print "%0.1f%% English" % (100 * languages["english"] / float(total))
	print "\n"
	print "\n%d Sources" % sources_count
	print "%d Untranslated Sources" % comments_count
	print "\n"
	print "%d Comments" % comments_count
	print "%d Outside Texts" % outside_count
	print "\n"
	print "%d Potential Fragments (translations in sheets not saved in DB)" % fragments_count

	print "\n******* Top Sources ********\n"
	for item in sorted_refs[:show_count]:
		print "%s: %d" % (item[0], item[1])

	print "\n******* Top Texts ********\n"
	for item in sorted_texts[:show_count]:
		print "%s: %d" % (item[0], item[1])

	print "\n******* Top Categories ********\n"
	for item in sorted_categories[:show_count]:
		print "%s: %d" % (item[0], item[1])


	print "\n******* Top Untranslated Sources ********\n"
	for item in sorted_untrans_refs[:show_count]:
		print "%s: %d" % (item[0], item[1])

	print "\n******* Top Untranslated Texts ********\n"
	for item in sorted_untrans_texts[:show_count]:
		print "%s: %d" % (item[0], item[1])

	print "\n******* Top Untranslated Categories ********\n"
	for item in sorted_untrans_categories[:show_count]:
		print "%s: %d" % (item[0], item[1])

	print "\n******* Top Fragments ********\n"
	for item in sorted_fragments[:show_count]:
		print "%s: %d" % (item[0], len(item[1]))



if action == "savesheet":
	sheet = {
		"title": "Top Sources in All Source Sheets",
		"sources": [{"ref": ref[0]} for ref in sorted_refs[:show_count]],
		"options": {"numbered": 1, "divineNames": "noSub"}
	}
	save_sheet(sheet, 1)