# -*- coding: utf-8 -*-
from collections import defaultdict

from sefaria.system.database import db
from sefaria.model import *

sheets = db.sheets.find({ "dateCreated": { "$gte": "2017-07-17T00:00:00.00" } })



sheet_count = 0
public_sheet_count = 0

for sheet in sheets:
    owner = sheet.get("owner", 0)
    if "interface_language" in UserProfile(id=owner).settings and UserProfile(id=owner).settings["interface_language"] == "hebrew":
        print(sheet["id"])
        sheet_count += 1
        if "status" in sheet and sheet["status"] == "public":
            public_sheet_count += 1

print("Sheets: %d" % sheet_count)

print("Public Sheets: %d" % public_sheet_count)
