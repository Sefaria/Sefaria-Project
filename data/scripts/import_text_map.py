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

from sefaria.texts import *


import csv
with open('../updated_text_map..csv', 'rb') as csvfile:
	texts = csv.reader(csvfile)
	for text in texts:
		new_index = {
			"title": text[2]
			"sectionNames": text[7].split(", ")
			"categories": text[6].splitt(", ")
			"titleVariants": [text[2]] + text[4].split(", ")
		}
		if len(text[3]):
			new_index["heTitle"] = text[3]
		if len(text[3]):
			new_index["heTitle"] = text[3]


		print new_index["new_index"]


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