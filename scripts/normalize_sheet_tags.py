# -*- coding: utf-8 -*-
"""
Normalizes backlog of source sheet tags so that there are no dupes.

Should not be required to be run again thanks to: https://github.com/Sefaria/Sefaria-Project/commit/54d83d61a2132ac6b60057a996c305c4220fdb8e
"""
import sys
import os
from sefaria.utils.util import titlecase



path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.system.database import db

sheets = db.sheets.find({"tags": { "$exists": "true" } })

for sheet in sheets:
	olddoc = sheet;
	newdoc = {};
	normTags = [];
	oldTags = olddoc["tags"];

	for tag in oldTags:
		if "," in tag:
			commaSeparatedTags = tag.split(',')
			for commaSeparatedTag in commaSeparatedTags:
				normTags.append(titlecase(commaSeparatedTag.strip()))

		else:
			normTags.append(titlecase(tag.strip()))

	newdoc = olddoc
	normTags = list(set(normTags)) 	# tags list should be unique

	newdoc["tags"] = normTags


	print(newdoc["id"])
	print(olddoc["tags"])
	print(newdoc["tags"])
	print("-------")

#	print newdoc


	db.sheets.update({'_id': olddoc["_id"]}, newdoc );
