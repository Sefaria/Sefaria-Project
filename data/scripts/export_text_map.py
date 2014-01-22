# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import os
import pymongo
import csv

from datetime import datetime, date, timedelta

path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.settings import *

connection = pymongo.Connection(MONGO_HOST)
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

indexes = db.index.find()

with open("../text_map.csv", 'wb') as csvfile:
	writer = csv.writer(csvfile)
	writer.writerow([
						"Priority",
						"Section",
						"English Title",
						"Hebrew Title",
						"Transliterated Title",
						"Title Variants",
						"Categories",
						"Text Structure",
						"Ready for Upload?",
						"Length",
					 ])
	for i in indexes:
		order         = i.get("order", [])
		sectionNames  = i.get("sectionNames", [])
		section       = ".".join([unicode(x) for x in order])
		title         = i["title"]
		heTitle       = i.get("heTitle", "")
		titleVariants = ", ".join(i["titleVariants"])
		categories    = ", ".join(i["categories"])
		textStructure = ", ".join(sectionNames)
		length        = unicode(i.get("length", ""))


		row = [
				"",
				section,
				title,
				heTitle,
				"",
				titleVariants,
				categories,
				textStructure,
				"",
				length,
			 ]
		row = [x.encode('utf-8') for x in row]

		writer.writerow(row)