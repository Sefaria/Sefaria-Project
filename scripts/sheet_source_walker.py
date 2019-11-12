# -*- coding: utf-8 -*-
"""
Code stump to walk through all sources on sheets to find various settings
"""

from sefaria.model import *
from sefaria.system.database import db

sheets = db.sheets.find()

ref_sources = 0
comment_sources = 0
outsideBiText_sources = 0
outsideText_sources = 0
media_sources = 0;
unknown_sources = 0;
unknown_sheets = set([])


for sheet in sheets:
	sources = sheet.get("sources", [])
	for source in sources:
		if "ref" in source:
			ref_sources += 1
		elif "comment" in source:
			comment_sources += 1
		elif "outsideBiText" in source:
			outsideBiText_sources += 1
		elif "outsideText" in source:
			outsideText_sources += 1
		elif "media" in source:
			media_sources += 1
		else:
			unknown_sources += 1
			unknown_sheets.add(sheet["id"])

print("***")
print("%d refs \n%d comments \n%d outsideBiTexts \n%d outsideTexts \n%d Media \n%d unknowns" % (ref_sources,comment_sources,outsideBiText_sources,outsideText_sources,media_sources,unknown_sources))