# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import os
import csv

import sefaria.model.text as txt

path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")



indexes = txt.IndexSet()

with open("../tmp/text_map.csv", 'wb') as csvfile:
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
		order         = getattr(i, "order", [])
		sectionNames  = getattr(i, "sectionNames", [])
		section       = ".".join([str(x) for x in order])
		title         = getattr(i, "title")
		heTitle       = getattr(i, "heTitle", "")
		titleVariants = ", ".join(getattr(i, "titleVariants"))
		categories    = ", ".join(getattr(i, "categories"))
		textStructure = ", ".join(sectionNames)
		length        = str(getattr(i, "length", ""))

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