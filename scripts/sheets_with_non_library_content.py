# -*- coding: utf-8 -*-

import django
django.setup()

from sefaria.model import *
from sefaria.system.database import db

import csv

sheets = db.sheets.find({"status": "public"})


sheets_with_non_library_content = [["sheet_id","sheet_title","like_count"]]

for sheet in sheets:
	row = []
	sources = sheet.get("sources", [])
	for source in sources:
		if "comment" in source:
			row.append(sheet.get("id", ""))
			row.append(sheet.get("title", "").encode("utf-8"))
			row.append(len(sheet.get("likes", [])))
			break
		elif "outsideBiText" in source:
			row.append(sheet.get("id", ""))
			row.append(sheet.get("title", "").encode("utf-8"))
			row.append(len(sheet.get("likes", [])))
			break
		elif "outsideText" in source:
			row.append(sheet.get("id", ""))
			row.append(sheet.get("title", "").encode("utf-8"))
			row.append(len(sheet.get("likes", [])))
			break
		elif "media" in source:
			row.append(sheet.get("id", ""))
			row.append(sheet.get("title", "").encode("utf-8"))
			row.append(len(sheet.get("likes", [])))
			break

	if len(row) > 0:
		sheets_with_non_library_content.append(row)
		print(row)

with open("output.csv", "wb") as f:
	writer = csv.writer(f)
	writer.writerows(sheets_with_non_library_content)
