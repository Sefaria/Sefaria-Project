# -*- coding: utf-8 -*-

import sys
import os
import pymongo
import csv
from pprint import pprint

from datetime import datetime, date, timedelta

path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.texts import *

existing_titles = []

action   = sys.argv[1] if len(sys.argv) > 1 else None
category = sys.argv[2] if len(sys.argv) > 2 else None

with open('../tmp/Sefaria Text Map - Ready to Import.csv', 'rb') as csvfile:
	texts = csv.reader(csvfile)
	header = texts.next()
	for text in texts:
		if not (len(text[2])): 
			continue	
		new_index = {
			"title": text[2].strip(),
			"sectionNames": [s.strip() for s in text[7].split(",")],
			"categories": [s.strip() for s in text[6].split(", ")],
			"titleVariants": [text[2].strip()] + [s.strip() for s in  text[5].split(", ")],
		}
		if len(text[3]):
			new_index["heTitle"] = text[3].strip()
		if len(text[4]):
			new_index["transliteratedTitle"] = text[4].strip()
			new_index["titleVariants"] += [new_index["transliteratedTitle"]]
			new_index["titleVariants"] = [v for v in new_index["titleVariants"] if v]
		if len(text[9]):
			new_index["length"] = int(text[9])
		if len(text[11]):
			# Only import the last order field for now
			new_index["order"] = [map(int, text[11].split(","))[-1]] 

		# TEMP - rename Yerushalmi Category
		if len(new_index["categories"]) == 3 and new_index["categories"][1] == "Talmud Yerushalmi / Jerusalem Talmud":
			new_index["categories"][1] =  "Talmud Yerushalmi"

		# TEMP  - change Shulchan Aruch Categories
		if "Shulchan Aruch" in new_index["categories"]:
			new_index["categories"] = ["Halakhah", "Shulchan Arukh"]


		existing = db.index.find_one({"titleVariants": new_index["title"]})

		if action == "status":
			# Print information about texts listed
			if not existing:
				print "NEW - " + new_index["title"]
			if existing:
				if new_index["title"] == existing["title"]:
					print "EXISTING - " + new_index["title"]
				else:
					print "EXISTING (title change) - " + new_index["title"]
				existing_titles.append(existing["title"])

			validation = validate_index(new_index)
			if "error" in validation:
				print "*** %s" % validation["error"]


		# Add texts if their category is specified in command line
		if action == "post" and category:
			if category == "all" or category in new_index["categories"][:2]:
				print "Saving %s" % new_index["title"]

				save_index(new_index, 1)
		

		if action == "hebrew" and existing:
			if "heTitle" not in existing:
				print "Missing Hebrew: %s" % (existing["title"])
				existing_titles.append(existing["title"])


if action == "status":
	indexes = db.index.find()
	for i in indexes:
		if i["title"] not in existing_titles:
			print "NOT ON SHEET - %s" % i["title"]

if action == "hebrew":
	indexes = db.index.find()
	for i in indexes:
		if "heTitle" not in i and i["title"] not in existing_titles:
			print "Still no Hebrew:  %s" % i["title"]


if action == "post":
	update_summaries()