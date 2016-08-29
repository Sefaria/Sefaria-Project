# -*- coding: utf-8 -*-
"""
Migration script to convert all old comments to outside texts. Primarily to preserve formating vis a vis s2's new layout for comments.
"""

from sefaria.model import *
from sefaria.system.database import db

sheets = db.sheets.find()

for sheet in sheets:
	sources = sheet.get("sources", [])
	for source in sources:
		if "comment" in source:
			source["outsideText"] = "<div class='oldComment'>"+source["comment"]+"</div>"
			source["comment"]
			del source["comment"]
	db.sheets.save(sheet)

