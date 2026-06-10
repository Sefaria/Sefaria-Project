# -*- coding: utf-8 -*-

import sys
import os
import csv

from sefaria import texts, summaries
from sefaria.system.database import db
import sefaria.tracker as tracker
from sefaria.model import library

path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

filename = '../tmp/Sefaria Text Map - Talmud.csv'
action   = sys.argv[1] if len(sys.argv) > 1 else None
category = sys.argv[2] if len(sys.argv) > 2 else None

def import_from_csv(filename, action="status", category="all"):
	existing_titles = []
	with open(filename, 'rb') as csvfile:
		rows = csv.reader(csvfile)
		header = next(rows)
		for text in rows:
			if not len(text[2]) or not len(text[9]): 
				# Require a primary titl and something set in "ready to upload" field
				continue	
			new_index = {
				"title": text[2].strip(),
				"sectionNames": [s.strip() for s in text[8].split(",")],
				"categories": [s.strip() for s in text[7].split(", ")],
				"titleVariants": [text[2].strip()] + [s.strip() for s in  text[6].split(", ")],
			}
			if len(text[3]):
				new_index["heTitle"] = text[3].strip()
			if len(text[4]):
				new_index["transliteratedTitle"] = text[4].strip()
				new_index["titleVariants"] += [new_index["transliteratedTitle"]]
				new_index["titleVariants"] = [v for v in new_index["titleVariants"] if v]
			if len(text[10]):
				new_index["length"] = int(text[10])
			if len(text[12]):
				# Only import the last order field for now
				new_index["order"] = [map(int, text[12].split(","))[-1]] 

			existing = db.index.find_one({"titleVariants": new_index["title"]})

			if action == "status":
				# Print information about texts listed
				if not existing:
					print("NEW - " + new_index["title"])
				if existing:
					if new_index["title"] == existing["title"]:
						print("EXISTING - " + new_index["title"])
					else:
						print("EXISTING (title change) - " + new_index["title"])
					existing_titles.append(existing["title"])

				validation = texts.validate_index(new_index)
				if "error" in validation:
					print("*** %s" % validation["error"])


			# Add texts if their category is specified in command line
			if action in ("post", "update") and category:
				if category == "all" or category in new_index["categories"][:2]:
					print("Saving %s" % new_index["title"])

					if action == "update":
						# TOOD remove any fields that have empty values like []
						# before updating - don't overwrite with nothing
						new_index.update(existing)

					tracker.add(1, sefaria.model.index.Index, new_index)
			

			if action == "hebrew" and existing:
				if "heTitle" not in existing:
					print("Missing Hebrew: %s" % (existing["title"]))
					existing_titles.append(existing["title"])


	if action == "status":
		indexes = db.index.find()
		for i in indexes:
			if i["title"] not in existing_titles:
				print("NOT ON SHEET - %s" % i["title"])

	if action == "hebrew":
		indexes = db.index.find()
		for i in indexes:
			if "heTitle" not in i and i["title"] not in existing_titles:
				print("Still no Hebrew:  %s" % i["title"])

	if action in ("post", "update"):
		library.rebuild_toc()
